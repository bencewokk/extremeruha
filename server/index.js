import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Product from './models/Product.js'
import path from 'path'
import multer from 'multer'
import { randomUUID, createHash } from 'crypto'
import { google } from 'googleapis'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { v2 as cloudinary } from 'cloudinary'
import { loadSettings, getStoredSettings, updateSettingsSection, clearSettingsSection } from './settingsStore.js'
import { DEFAULT_RESERVATION_TYPES, SLOT_STEP_MINUTES, sanitizeReservationTypes, withDerivedDefaults } from './reservationTypes.js'

// Load server/.env specifically so running from project root works
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') })

const app = express()
// Needed so req.protocol is https behind a hosting proxy (Google OAuth redirect URI)
app.set('trust proxy', true)
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

// Booking types exactly as saved in /admin (incl. switched-off ones).
function getRawReservationTypes() {
  const stored = getStoredSettings().reservationTypes?.types
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_RESERVATION_TYPES
}

function getAllReservationTypes() {
  return getRawReservationTypes().map((type) => ({
    ...withDerivedDefaults(type),
    durationLabel: `Idotartam: ${type.durationMinutes} perc`,
  }))
}

function getEnabledReservationTypes() {
  return getAllReservationTypes().filter((type) => type.enabled !== false)
}

function resolveReservationType(typeId) {
  const enabled = getEnabledReservationTypes()
  if (!typeId) return enabled[0] || null
  return enabled.find((type) => type.id === typeId) || null
}

function toPublicReservationType(type) {
  const { enabled, durationLabel, eventTitle, ...publicFields } = type
  return publicFields
}

// Google Calendar event ids may only use a-v and 0-9. A hash of type + start
// keeps double-submits of the same slot from creating two events.
function buildCalendarEventId(typeId, start) {
  return `bk${createHash('sha1').update(`${typeId}|${start.getTime()}`).digest('hex')}`
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

// ---- Integration config: values saved in /admin win over server/.env ----
// Each section is taken as a whole from one source, so admin-saved keys are
// never mixed with keys from .env.

function getCloudinaryConfig() {
  const stored = getStoredSettings().cloudinary || {}
  if (stored.cloudName && stored.apiKey && stored.apiSecret) {
    return { cloud_name: stored.cloudName, api_key: stored.apiKey, api_secret: stored.apiSecret, source: 'admin' }
  }

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    return { cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, source: 'env' }
  }

  return null
}

function cloudinaryCallOptions(config) {
  return { cloud_name: config.cloud_name, api_key: config.api_key, api_secret: config.api_secret }
}

function getGoogleCalendarConfig() {
  const stored = getStoredSettings().google || {}
  const timeZone = stored.timeZone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'Europe/Budapest'

  if (stored.clientId && stored.clientSecret && stored.refreshToken) {
    return {
      clientId: stored.clientId,
      clientSecret: stored.clientSecret,
      refreshToken: stored.refreshToken,
      calendarId: stored.calendarId || 'primary',
      timeZone,
      source: 'admin',
    }
  }

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID } = process.env
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN && GOOGLE_CALENDAR_ID) {
    return {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      refreshToken: GOOGLE_REFRESH_TOKEN,
      calendarId: GOOGLE_CALENDAR_ID,
      timeZone,
      source: 'env',
    }
  }

  return null
}

function getCalendarClient(config = getGoogleCalendarConfig()) {
  if (!config) return null

  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret)
  auth.setCredentials({ refresh_token: config.refreshToken })
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
  .finally(() => loadSettings().catch((error) => console.error('Could not load admin settings', error)))

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
    return res.status(400).json({ error: 'Ez a foglalástípus jelenleg nem elérhető. Kérlek válassz másikat.' })
  }

  const calendarConfig = getGoogleCalendarConfig()
  const calendar = getCalendarClient(calendarConfig)
  const calendarId = calendarConfig?.calendarId
  const normalizedTimeZone = timeZone || calendarConfig?.timeZone || 'Europe/Budapest'

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
    return res.status(400).json({ error: 'Ez a foglalástípus jelenleg nem elérhető. Kérlek válassz másikat.' })
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

  const calendarConfig = getGoogleCalendarConfig()
  const calendar = getCalendarClient(calendarConfig)
  const calendarId = calendarConfig?.calendarId
  const normalizedTimeZone = timeZone || calendarConfig?.timeZone || 'Europe/Budapest'

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
      eventId: buildCalendarEventId(reservationType.id, start),
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
      error: 'Nem sikerült létrehozni a foglalást a Google Naptárban',
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

// Deletes the product image from Cloudinary, but only if it lives in the
// currently configured cloud (images from a previous account are left alone).
function destroyProductImage(imageUrl) {
  const config = getCloudinaryConfig()
  const publicId = getCloudinaryPublicId(imageUrl)
  if (!config || !publicId) return
  if (!imageUrl.includes(`res.cloudinary.com/${config.cloud_name}/`)) return

  cloudinary.uploader.destroy(publicId, cloudinaryCallOptions(config)).catch(() => {})
}

app.delete('/api/products/:id', requireAdminAuth, async (req, res) => {
  if (useInMemoryProducts) {
    const product = inMemoryProducts.find((p) => p._id === req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    destroyProductImage(product.image)

    inMemoryProducts = inMemoryProducts.filter((p) => p._id !== req.params.id)
    return res.status(204).end()
  }

  try {
    const product = await Product.findByIdAndDelete(req.params.id).lean()
    if (!product) return res.status(404).json({ error: 'Product not found' })

    destroyProductImage(product.image)

    res.status(204).end()
  } catch (err) {
    enableInMemoryProducts(err)
    const product = inMemoryProducts.find((p) => p._id === req.params.id)
    if (!product) return res.status(404).json({ error: 'Product not found' })

    destroyProductImage(product.image)

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

    const cloudinaryConfig = getCloudinaryConfig()
    if (!cloudinaryConfig) {
      return res.status(503).json({ error: 'A képtárhely (Cloudinary) nincs beállítva. Admin → Képtárhely.' })
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        ...cloudinaryCallOptions(cloudinaryConfig),
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

// ---- Booking types ----

app.get('/api/reservation-types', (req, res) => {
  res.set('Cache-Control', 'no-cache')
  res.json({
    stepMinutes: SLOT_STEP_MINUTES,
    types: getEnabledReservationTypes().map(toPublicReservationType),
  })
})

app.get('/api/admin/reservation-types', requireAdminAuth, (req, res) => {
  res.json({
    stepMinutes: SLOT_STEP_MINUTES,
    isDefault: !getStoredSettings().reservationTypes?.types?.length,
    types: getRawReservationTypes(),
  })
})

app.put('/api/admin/reservation-types', requireAdminAuth, async (req, res) => {
  const result = sanitizeReservationTypes(req.body?.types)
  if (result.error) return res.status(400).json({ error: result.error })

  await updateSettingsSection('reservationTypes', { types: result.types })
  res.json({ stepMinutes: SLOT_STEP_MINUTES, isDefault: false, types: result.types })
})

app.delete('/api/admin/reservation-types', requireAdminAuth, async (req, res) => {
  await clearSettingsSection('reservationTypes')
  res.json({ stepMinutes: SLOT_STEP_MINUTES, isDefault: true, types: DEFAULT_RESERVATION_TYPES })
})

// ---- Admin: integration settings (Cloudinary + Google Calendar) ----

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
]

function getGoogleRedirectUri(req) {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')
  return `${base}/api/admin/google/callback`
}

function maskValue(value) {
  if (!value) return ''
  if (value.length <= 6) return '••••'
  return `${value.slice(0, 3)}••••${value.slice(-3)}`
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function describeGoogleError(error) {
  const detail = error?.response?.data?.error_description
    || error?.response?.data?.error?.message
    || error?.response?.data?.error
    || error?.message
    || 'ismeretlen hiba'
  return typeof detail === 'string' ? detail : JSON.stringify(detail)
}

function buildSettingsPayload(req) {
  const stored = getStoredSettings()
  const storedCloudinary = stored.cloudinary || {}
  const storedGoogle = stored.google || {}
  const activeCloudinary = getCloudinaryConfig()
  const activeGoogle = getGoogleCalendarConfig()

  return {
    cloudinary: {
      cloudName: storedCloudinary.cloudName || '',
      apiKey: storedCloudinary.apiKey || '',
      apiSecretMasked: maskValue(storedCloudinary.apiSecret),
      hasApiSecret: Boolean(storedCloudinary.apiSecret),
      updatedAt: storedCloudinary.updatedAt || null,
      activeSource: activeCloudinary?.source || null,
      activeCloudName: activeCloudinary?.cloud_name || null,
    },
    google: {
      clientId: storedGoogle.clientId || '',
      clientSecretMasked: maskValue(storedGoogle.clientSecret),
      hasClientSecret: Boolean(storedGoogle.clientSecret),
      connected: Boolean(storedGoogle.refreshToken),
      connectedEmail: storedGoogle.connectedEmail || '',
      connectedAt: storedGoogle.connectedAt || null,
      calendarId: storedGoogle.calendarId || 'primary',
      timeZone: storedGoogle.timeZone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'Europe/Budapest',
      updatedAt: storedGoogle.updatedAt || null,
      redirectUri: getGoogleRedirectUri(req),
      activeSource: activeGoogle?.source || null,
    },
  }
}

app.get('/api/admin/settings', requireAdminAuth, (req, res) => {
  res.json(buildSettingsPayload(req))
})

app.put('/api/admin/settings/cloudinary', requireAdminAuth, async (req, res) => {
  const cloudName = cleanString(req.body?.cloudName)
  const apiKey = cleanString(req.body?.apiKey)
  const apiSecret = cleanString(req.body?.apiSecret)
  const existing = getStoredSettings().cloudinary || {}

  if (!cloudName || !apiKey || (!apiSecret && !existing.apiSecret)) {
    return res.status(400).json({ error: 'A Cloud name, API key és API secret mezők kötelezők.' })
  }

  // Check the keys before saving, so a typo never breaks image uploads.
  const candidate = { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret || existing.apiSecret }
  try {
    await cloudinary.api.ping(candidate)
  } catch (error) {
    const detail = error?.error?.message || error?.message || 'ismeretlen hiba'
    return res.status(400).json({ error: `A Cloudinary nem fogadta el az adatokat: ${detail}` })
  }

  await updateSettingsSection('cloudinary', {
    cloudName,
    apiKey,
    apiSecret: candidate.api_secret,
  })

  res.json(buildSettingsPayload(req))
})

app.delete('/api/admin/settings/cloudinary', requireAdminAuth, async (req, res) => {
  await clearSettingsSection('cloudinary')
  res.json(buildSettingsPayload(req))
})

app.post('/api/admin/settings/cloudinary/test', requireAdminAuth, async (req, res) => {
  const config = getCloudinaryConfig()
  if (!config) return res.status(400).json({ error: 'Nincs beállított Cloudinary fiók.' })

  try {
    await cloudinary.api.ping(cloudinaryCallOptions(config))
    res.json({ ok: true, message: `Működik — a képek ide kerülnek: ${config.cloud_name}` })
  } catch (error) {
    const detail = error?.error?.message || error?.message || 'ismeretlen hiba'
    res.status(502).json({ error: `A Cloudinary kapcsolat nem működik: ${detail}` })
  }
})

app.put('/api/admin/settings/google', requireAdminAuth, async (req, res) => {
  const clientId = cleanString(req.body?.clientId)
  const clientSecret = cleanString(req.body?.clientSecret)
  const calendarId = cleanString(req.body?.calendarId) || 'primary'
  const timeZone = cleanString(req.body?.timeZone) || 'Europe/Budapest'
  const existing = getStoredSettings().google || {}

  if (!clientId || (!clientSecret && !existing.clientSecret)) {
    return res.status(400).json({ error: 'A Client ID és Client secret mezők kötelezők.' })
  }

  const patch = { clientId, calendarId, timeZone }
  if (clientSecret) patch.clientSecret = clientSecret

  // A refresh token only works with the OAuth client that issued it.
  const clientChanged = clientId !== existing.clientId || (clientSecret && clientSecret !== existing.clientSecret)
  if (clientChanged) {
    patch.refreshToken = ''
    patch.connectedEmail = ''
    patch.connectedAt = null
  }

  await updateSettingsSection('google', patch)
  res.json(buildSettingsPayload(req))
})

app.delete('/api/admin/settings/google', requireAdminAuth, async (req, res) => {
  await clearSettingsSection('google')
  res.json(buildSettingsPayload(req))
})

// Step 1 of "Connect Google": returns the Google consent URL.
app.post('/api/admin/settings/google/auth-url', requireAdminAuth, (req, res) => {
  const stored = getStoredSettings().google || {}
  if (!stored.clientId || !stored.clientSecret) {
    return res.status(400).json({ error: 'Előbb mentsd el a Client ID-t és a Client secretet.' })
  }

  const state = jwt.sign({ purpose: 'google-oauth', sub: req.admin?.sub }, JWT_SECRET, { expiresIn: '15m' })
  const oauth = new google.auth.OAuth2(stored.clientId, stored.clientSecret, getGoogleRedirectUri(req))
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // always return a refresh token
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  })

  res.json({ url })
})

// Step 2: Google redirects back here after the owner clicks "Allow".
app.get('/api/admin/google/callback', async (req, res) => {
  const { code, state, error } = req.query
  const back = (status, message) => {
    const params = new URLSearchParams({ tab: 'google', google: status })
    if (message) params.set('message', String(message).slice(0, 300))
    res.redirect(`/admin?${params.toString()}`)
  }

  if (error) return back('error', `A Google elutasította: ${error}`)

  let statePayload = null
  try {
    statePayload = JWT_SECRET ? jwt.verify(String(state || ''), JWT_SECRET) : null
  } catch {
    statePayload = null
  }
  if (!statePayload || statePayload.purpose !== 'google-oauth') {
    return back('error', 'Lejárt vagy érvénytelen kérés. Próbáld újra a Csatlakoztatás gombbal.')
  }

  const stored = getStoredSettings().google || {}
  if (!stored.clientId || !stored.clientSecret || !code) {
    return back('error', 'Hiányzó Client ID / Client secret.')
  }

  try {
    const oauth = new google.auth.OAuth2(stored.clientId, stored.clientSecret, getGoogleRedirectUri(req))
    const { tokens } = await oauth.getToken(String(code))

    if (!tokens.refresh_token) {
      return back('error', 'A Google nem adott refresh tokent. Vond vissza a hozzáférést a Google-fiókodban, majd próbáld újra.')
    }

    let connectedEmail = ''
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8'))
        connectedEmail = payload.email || ''
      } catch {
        connectedEmail = ''
      }
    }

    await updateSettingsSection('google', {
      refreshToken: tokens.refresh_token,
      connectedEmail,
      connectedAt: new Date().toISOString(),
    })

    back('connected')
  } catch (err) {
    console.error('Google OAuth callback failed', err)
    back('error', describeGoogleError(err))
  }
})

app.post('/api/admin/settings/google/test', requireAdminAuth, async (req, res) => {
  const config = getGoogleCalendarConfig()
  const calendar = getCalendarClient(config)
  if (!calendar) return res.status(400).json({ error: 'A Google Naptár még nincs csatlakoztatva.' })

  try {
    const { data } = await calendar.calendars.get({ calendarId: config.calendarId })
    const now = new Date()
    await getBusyRanges(calendar, config.calendarId, now.toISOString(), new Date(now.getTime() + 86400000).toISOString(), config.timeZone)
    res.json({ ok: true, message: `Működik — a foglalások ebbe a naptárba kerülnek: ${data.summary || config.calendarId}` })
  } catch (error) {
    res.status(502).json({ error: `A naptár nem érhető el: ${describeGoogleError(error)}` })
  }
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
