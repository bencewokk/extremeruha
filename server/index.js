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

const SLOT_STEP_MINUTES = 15
const DEFAULT_RESERVATION_TYPE = 'ruhaproba'
const RESERVATION_TYPES = {
  ruhaproba: {
    id: 'ruhaproba',
    label: 'Ruhapróba',
    durationMinutes: 90,
    eventTitle: 'Menyasszonyi ruhaproba',
    durationLabel: 'Idotartam: 90 perc',
  },
  'kolcsonzesi-konzultacio': {
    id: 'kolcsonzesi-konzultacio',
    label: 'Kölcsönzési konzultáció',
    durationMinutes: 60,
    eventTitle: 'Menyasszonyi ruhakolcsonzesi konzultacio',
    durationLabel: 'Idotartam: 60 perc',
  },
  'vasarlasi-konzultacio': {
    id: 'vasarlasi-konzultacio',
    label: 'Vásárlási konzultáció',
    durationMinutes: 60,
    eventTitle: 'Menyasszonyi ruhavasarlasi konzultacio',
    durationLabel: 'Idotartam: 60 perc',
  },
}
const GOOGLE_REVIEWS_CACHE_TTL_MS = 30 * 60 * 1000
let googleReviewsCache = { data: null, expiresAt: 0 }

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA
}

async function getBusyRanges(calendar, calendarId, timeMinIso, timeMaxIso, timeZone) {
  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      timeZone,
      items: [{ id: calendarId }],
    },
  })

  const busy = freeBusy.data?.calendars?.[calendarId]?.busy || []
  return busy
    .map((item) => ({ start: new Date(item.start), end: new Date(item.end) }))
    .filter((item) => !Number.isNaN(item.start.getTime()) && !Number.isNaN(item.end.getTime()))
}

function buildAvailableStarts({ windowStart, windowEnd, busyRanges, stepMinutes, durationMinutes }) {
  const available = []
  const stepMs = stepMinutes * 60 * 1000
  const durationMs = durationMinutes * 60 * 1000

  for (let cursor = windowStart.getTime(); cursor + durationMs <= windowEnd.getTime(); cursor += stepMs) {
    const start = new Date(cursor)
    const end = new Date(cursor + durationMs)

    const hasConflict = busyRanges.some((busy) => rangesOverlap(start, end, busy.start, busy.end))
    if (!hasConflict) {
      available.push(start.toISOString())
    }
  }

  return available
}

function getReservationType(typeId) {
  return RESERVATION_TYPES[typeId] || null
}

function resolveReservationType(typeId) {
  if (!typeId) return RESERVATION_TYPES[DEFAULT_RESERVATION_TYPE]
  return getReservationType(typeId)
}

function buildReservationTypePayload(type) {
  return {
    id: type.id,
    label: type.label,
    durationMinutes: type.durationMinutes,
    stepMinutes: SLOT_STEP_MINUTES,
  }
}

function buildFallbackCalendarUrl({ reservationType, name, email, phone, notes, start, end }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: reservationType.eventTitle,
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
    details: [
      `Reservation type: ${reservationType.label} (${reservationType.id})`,
      `Client: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      notes ? `Notes: ${notes}` : '',
      reservationType.durationLabel,
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

function getGoogleReviewsConfig() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const placeId = process.env.GOOGLE_PLACE_ID
  const languageCode = process.env.GOOGLE_PLACE_REVIEW_LANGUAGE || 'hu'

  if (!apiKey || !placeId) {
    return null
  }

  return { apiKey, placeId, languageCode }
}

function normalizeGooglePlaceResourceName(placeId) {
  return placeId.startsWith('places/') ? placeId : `places/${placeId}`
}

function normalizeGoogleReview(review) {
  return {
    authorName: review?.authorAttribution?.displayName || 'Google felhasznalo',
    authorUrl: review?.authorAttribution?.uri || '',
    authorPhotoUrl: review?.authorAttribution?.photoUri || '',
    rating: typeof review?.rating === 'number' ? review.rating : null,
    relativeTimeDescription: review?.relativePublishTimeDescription || '',
    text: review?.originalText?.text || review?.text?.text || '',
    publishTime: review?.publishTime || '',
  }
}

async function fetchGooglePlaceReviews() {
  const config = getGoogleReviewsConfig()
  if (!config) {
    throw new Error('Google reviews are not configured on the server')
  }

  const endpoint = new URL(`https://places.googleapis.com/v1/${normalizeGooglePlaceResourceName(config.placeId)}`)
  endpoint.searchParams.set('languageCode', config.languageCode)

  const response = await fetch(endpoint, {
    headers: {
      'X-Goog-Api-Key': config.apiKey,
      'X-Goog-FieldMask': 'displayName,formattedAddress,googleMapsUri,rating,userRatingCount,reviews',
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const googleDetail = payload?.error?.message || payload?.error?.status || JSON.stringify(payload).slice(0, 400)
    console.error(`Google Places API error ${response.status}:`, googleDetail)
    throw new Error(`Google Places API ${response.status}: ${googleDetail}`)
  }

  return {
    place: {
      name: payload?.displayName?.text || '',
      address: payload?.formattedAddress || '',
      googleMapsUri: payload?.googleMapsUri || '',
      rating: typeof payload?.rating === 'number' ? payload.rating : null,
      userRatingCount: typeof payload?.userRatingCount === 'number' ? payload.userRatingCount : 0,
    },
    reviews: Array.isArray(payload?.reviews)
      ? payload.reviews.map((review) => normalizeGoogleReview(review)).filter((review) => review.authorName || review.text)
      : [],
    fetchedAt: new Date().toISOString(),
  }
}

async function getCachedGooglePlaceReviews() {
  const now = Date.now()

  if (googleReviewsCache.data && googleReviewsCache.expiresAt > now) {
    return { ...googleReviewsCache.data, stale: false }
  }

  try {
    const data = await fetchGooglePlaceReviews()
    googleReviewsCache = {
      data,
      expiresAt: now + GOOGLE_REVIEWS_CACHE_TTL_MS,
    }

    return { ...data, stale: false }
  } catch (error) {
    if (googleReviewsCache.data) {
      return { ...googleReviewsCache.data, stale: true }
    }

    throw error
  }
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

app.get('/api/reviews', async (req, res) => {
  if (!getGoogleReviewsConfig()) {
    return res.status(503).json({ error: 'A Google velemenyek nincsenek beallitva a szerveren' })
  }

  try {
    const payload = await getCachedGooglePlaceReviews()
    return res.json(payload)
  } catch (error) {
    console.error('Google reviews fetch failed', error)
    const detail = error?.message || 'ismeretlen hiba'
    return res.status(502).json({
      error: `Nem sikerult betolteni a Google velemenyeket: ${detail}`,
    })
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

app.get('/api/bookings/availability', async (req, res) => {
  const { fromIso, toIso, timeZone, reservationType: reservationTypeId } = req.query
  const from = new Date(fromIso)
  const to = new Date(toIso)
  const reservationType = resolveReservationType(reservationTypeId)

  if (!fromIso || !toIso || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return res.status(400).json({ error: 'A fromIso es toIso kotelezo, es ervenyes idotartomanyt kell megadni' })
  }

  if (!reservationType) {
    return res.status(400).json({ error: 'Ervenytelen reservationType ertek' })
  }

  const calendar = getCalendarClient()
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  const normalizedTimeZone = timeZone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'Europe/Budapest'

  if (!calendar || !calendarId) {
    return res.status(503).json({ error: 'A Google Naptar nincs beallitva a szerveren' })
  }

  try {
    const busyRanges = await getBusyRanges(calendar, calendarId, from.toISOString(), to.toISOString(), normalizedTimeZone)
    const slots = buildAvailableStarts({
      windowStart: from,
      windowEnd: to,
      busyRanges,
      stepMinutes: SLOT_STEP_MINUTES,
      durationMinutes: reservationType.durationMinutes,
    })

    return res.json({
      slots,
      stepMinutes: SLOT_STEP_MINUTES,
      durationMinutes: reservationType.durationMinutes,
      reservationType: buildReservationTypePayload(reservationType),
    })
  } catch (error) {
    console.error('Google Calendar availability check failed', error)
    return res.status(502).json({ error: 'Nem sikerult betolteni a szabad idopontokat a Google Naptarbol' })
  }
})

app.post('/api/bookings', async (req, res) => {
  const { name, email, phone, startIso, notes, timeZone, reservationType: reservationTypeId } = req.body || {}
  const reservationType = resolveReservationType(reservationTypeId)

  if (!name || !email || !phone || !startIso) {
    return res.status(400).json({
      error: 'A name, email, phone es startIso mezok kotelezoek',
    })
  }

  if (!reservationType) {
    return res.status(400).json({ error: 'Ervenytelen reservationType ertek' })
  }

  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) {
    return res.status(400).json({ error: 'Ervenytelen startIso ertek' })
  }

  if (start.getUTCMinutes() % SLOT_STEP_MINUTES !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    return res.status(400).json({ error: `A foglalas kezdete csak ${SLOT_STEP_MINUTES} perces lepeskozokben lehet` })
  }

  const end = new Date(start.getTime() + reservationType.durationMinutes * 60 * 1000)
  const fallbackUrl = buildFallbackCalendarUrl({
    reservationType,
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
      error: 'A Google Naptar nincs beallitva a szerveren',
      fallbackUrl,
    })
  }

  try {
    const busyRanges = await getBusyRanges(calendar, calendarId, start.toISOString(), end.toISOString(), normalizedTimeZone)
    const hasConflict = busyRanges.some((busy) => rangesOverlap(start, end, busy.start, busy.end))
    if (hasConflict) {
      return res.status(409).json({ error: 'Ez az idopont mar nem szabad. Kerlek valassz masikat.' })
    }

    const event = await calendar.events.insert({
      calendarId,
      eventId: `${reservationType.id}-${start.getTime()}`,
      requestBody: {
        summary: reservationType.eventTitle,
        location: 'Extreme Ruhaszalon, Munkacsy utca, 3530 Miskolc, Hungary',
        description: [
          `Reservation type: ${reservationType.label}`,
          `Reservation type id: ${reservationType.id}`,
          `Client: ${name}`,
          `Email: ${email}`,
          `Phone: ${phone}`,
          notes ? `Notes: ${notes}` : '',
          reservationType.durationLabel,
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
      reservationType: reservationType.id,
    })
  } catch (error) {
    if (error?.code === 409) {
      return res.status(409).json({ error: 'Ez az idopont mar nem szabad. Kerlek valassz masikat.' })
    }

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
  app.use(express.static(distDir, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const relativePath = path.relative(distDir, filePath).replace(/\\/g, '/')
      const isHtml = relativePath.endsWith('.html')
      const isHashedAsset = /\.[a-f0-9]{8}\.(js|css|woff2|ttf|eot|svg)$/i.test(relativePath)

      if (isHtml) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
        return
      }

      if (isHashedAsset) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        return
      }

      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400')
    },
  }))

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next()
    }

    res.sendFile(distIndexPath)
  })
}

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`Server running on ${port}`))
