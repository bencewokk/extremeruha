import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Product from './models/Product.js'
import path from 'path'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { google } from 'googleapis'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { v2 as cloudinary } from 'cloudinary'

// Load server/.env specifically so running from project root works
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') })

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const app = express()
app.use(cors())
app.use(express.json())

const seedDataPath = path.join(process.cwd(), 'server', 'seed-data.json')
const distDir = path.join(process.cwd(), 'dist')
const distIndexPath = path.join(distDir, 'index.html')
import fs from 'fs'

const seededProducts = JSON.parse(fs.readFileSync(seedDataPath, 'utf8')).map((product) => ({
  ...product,
  _id: product.id || randomUUID(),
}))
let inMemoryProducts = [...seededProducts]
let useInMemoryProducts = true

function enableInMemoryProducts(error) {
  useInMemoryProducts = true
  if (error) console.error('MongoDB unavailable, using in-memory products instead.', error)
}

function enableMongoProducts() {
  useInMemoryProducts = false
  console.log('MongoDB connected')
}

function formatGoogleDate(value) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function buildFallbackCalendarUrl({ name, email, phone, notes, start, end }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Bridal Fitting Appointment',
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
    details: [
      `Client: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      notes ? `Notes: ${notes}` : '',
      'Duration: 1.5 hours',
    ].filter(Boolean).join('\n'),
    location: 'Extreme Ruhaszalon, Munkacsy utca, 3530 Miskolc, Hungary',
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function getCalendarClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return google.calendar({ version: 'v3', auth })
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH
const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

function extractBearerToken(req) {
  const header = req.get('authorization')
  if (!header) return null

  const [scheme, token] = header.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

function createAdminToken(username) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  return jwt.sign(
    {
      sub: username,
      role: 'admin',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

function verifyAdminToken(token) {
  if (!JWT_SECRET) return null

  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return null
  }
}

async function verifyAdminPassword(inputPassword) {
  if (ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(inputPassword, ADMIN_PASSWORD_HASH)
  }

  if (ADMIN_PASSWORD) {
    return inputPassword === ADMIN_PASSWORD
  }

  return false
}

function requireAdminAuth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Admin authentication is not configured on the server' })
  }

  const token = extractBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = verifyAdminToken(token)
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.admin = payload
  next()
}

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bridal'
mongoose.set('bufferCommands', false)
mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 })
  .then(() => enableMongoProducts())
  .catch((err) => enableInMemoryProducts(err))

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {}

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' })
  }

  if (!ADMIN_USERNAME) {
    return res.status(503).json({ error: 'Admin authentication is not configured on the server' })
  }

  const usernameMatches = username === ADMIN_USERNAME
  const passwordMatches = await verifyAdminPassword(password)

  if (!usernameMatches || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  try {
    const token = createAdminToken(username)
    return res.status(200).json({ token, expiresIn: JWT_EXPIRES_IN })
  } catch (error) {
    return res.status(503).json({ error: 'Admin authentication is not configured on the server' })
  }
})

app.get('/api/products', async (req, res) => {
  if (useInMemoryProducts) {
    return res.json(inMemoryProducts)
  }

  try {
    const products = await Product.find().lean()
    res.json(products)
  } catch (err) {
    enableInMemoryProducts(err)
    res.json(inMemoryProducts)
  }
})

app.post('/api/products', requireAdminAuth, async (req, res) => {
  if (useInMemoryProducts) {
    const doc = { ...req.body, _id: randomUUID() }
    inMemoryProducts = [doc, ...inMemoryProducts]
    return res.status(201).json(doc)
  }

  try {
    const doc = await Product.create(req.body)
    res.status(201).json(doc)
  } catch (err) {
    enableInMemoryProducts(err)
    const doc = { ...req.body, _id: randomUUID() }
    inMemoryProducts = [doc, ...inMemoryProducts]
    res.status(201).json(doc)
  }
})

app.post('/api/bookings', async (req, res) => {
  const { name, email, phone, startIso, notes, timeZone } = req.body || {}

  if (!name || !email || !phone || !startIso) {
    return res.status(400).json({
      error: 'name, email, phone, and startIso are required',
    })
  }

  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) {
    return res.status(400).json({ error: 'Invalid startIso value' })
  }

  const end = new Date(start.getTime() + 90 * 60 * 1000)
  const fallbackUrl = buildFallbackCalendarUrl({
    name,
    email,
    phone,
    notes,
    start,
    end,
  })

  const calendar = getCalendarClient()
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  const normalizedTimeZone = timeZone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'Europe/Budapest'

  if (!calendar || !calendarId) {
    return res.status(503).json({
      error: 'Google Calendar is not configured on the server',
      fallbackUrl,
    })
  }

  try {
    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: 'Bridal Fitting Appointment',
        location: 'Extreme Ruhaszalon, Munkacsy utca, 3530 Miskolc, Hungary',
        description: [
          `Client: ${name}`,
          `Email: ${email}`,
          `Phone: ${phone}`,
          notes ? `Notes: ${notes}` : '',
          'Duration: 1.5 hours',
        ].filter(Boolean).join('\n'),
        start: {
          dateTime: start.toISOString(),
          timeZone: normalizedTimeZone,
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: normalizedTimeZone,
        },
        attendees: [{ email }],
      },
    })

    res.status(201).json({
      ok: true,
      eventId: event.data.id,
      eventLink: event.data.htmlLink,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    })
  } catch (error) {
    console.error('Google Calendar booking failed', error)
    res.status(502).json({
      error: 'Could not create Google Calendar event',
      fallbackUrl,
    })
  }
})

app.put('/api/products/:id', requireAdminAuth, async (req, res) => {
  if (useInMemoryProducts) {
    const index = inMemoryProducts.findIndex((product) => product._id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Product not found' })

    const updated = { ...inMemoryProducts[index], ...req.body, _id: req.params.id }
    inMemoryProducts[index] = updated
    return res.json(updated)
  }

  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true })
    res.json(updated)
  } catch (err) {
    enableInMemoryProducts(err)
    const index = inMemoryProducts.findIndex((product) => product._id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Product not found' })

    const updated = { ...inMemoryProducts[index], ...req.body, _id: req.params.id }
    inMemoryProducts[index] = updated
    res.json(updated)
  }
})

function getCloudinaryPublicId(imageUrl) {
  if (!imageUrl || !imageUrl.includes('res.cloudinary.com')) return null
  // URL pattern: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<public_id>.<ext>
  const match = imageUrl.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/)
  return match ? match[1] : null
}

app.delete('/api/products/:id', requireAdminAuth, async (req, res) => {
  if (useInMemoryProducts) {
    const product = inMemoryProducts.find((p) => p._id === req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const publicId = getCloudinaryPublicId(product.image)
    if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {})

    inMemoryProducts = inMemoryProducts.filter((p) => p._id !== req.params.id)
    return res.status(204).end()
  }

  try {
    const product = await Product.findByIdAndDelete(req.params.id).lean()
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const publicId = getCloudinaryPublicId(product.image)
    if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {})

    res.status(204).end()
  } catch (err) {
    enableInMemoryProducts(err)
    const product = inMemoryProducts.find((p) => p._id === req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const publicId = getCloudinaryPublicId(product.image)
    if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {})

    inMemoryProducts = inMemoryProducts.filter((p) => p._id !== req.params.id)
    res.status(204).end()
  }
})

// Upload endpoint — streams to Cloudinary, returns secure URL.
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed (jpeg, png, webp, gif)'))
    }
  },
})

app.post('/api/upload', requireAdminAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      return res.status(status).json({ error: err.message })
    }

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({ error: 'Image storage is not configured on the server' })
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'extremeruha',
        transformation: [
          { width: 1200, crop: 'limit' },
          { fetch_format: 'auto', quality: 'auto' },
        ],
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error', error)
          return res.status(502).json({ error: 'Image upload failed' })
        }
        res.json({ url: result.secure_url })
      }
    )

    uploadStream.end(req.file.buffer)
  })
})

if (fs.existsSync(distIndexPath)) {
  app.use(express.static(distDir))

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next()
    }

    res.sendFile(distIndexPath)
  })
}

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`Server running on ${port}`))
