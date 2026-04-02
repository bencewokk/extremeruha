import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Product from './models/Product.js'
import path from 'path'
import multer from 'multer'
import { randomUUID } from 'crypto'

// Load server/.env specifically so running from project root works
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') })
const app = express()
app.use(cors())
app.use(express.json())

// ensure uploads folder
const uploadsDir = path.join(process.cwd(), 'server', 'public', 'uploads')
const seedDataPath = path.join(process.cwd(), 'server', 'seed-data.json')
const distDir = path.join(process.cwd(), 'dist')
const distIndexPath = path.join(distDir, 'index.html')
import fs from 'fs'
fs.mkdirSync(uploadsDir, { recursive: true })

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

// serve uploaded files
app.use('/uploads', express.static(uploadsDir))

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bridal'
mongoose.set('bufferCommands', false)
mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 })
  .then(() => enableMongoProducts())
  .catch((err) => enableInMemoryProducts(err))

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

app.post('/api/products', async (req, res) => {
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

app.put('/api/products/:id', async (req, res) => {
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

app.delete('/api/products/:id', async (req, res) => {
  if (useInMemoryProducts) {
    const exists = inMemoryProducts.some((product) => product._id === req.params.id)
    if (!exists) return res.status(404).json({ error: 'Product not found' })

    inMemoryProducts = inMemoryProducts.filter((product) => product._id !== req.params.id)
    return res.status(204).end()
  }

  try {
    await Product.findByIdAndDelete(req.params.id)
    res.status(204).end()
  } catch (err) {
    enableInMemoryProducts(err)
    const exists = inMemoryProducts.some((product) => product._id === req.params.id)
    if (!exists) return res.status(404).json({ error: 'Product not found' })

    inMemoryProducts = inMemoryProducts.filter((product) => product._id !== req.params.id)
    res.status(204).end()
  }
})

// Upload endpoint (multipart). Saves locally to server/public/uploads and returns URL.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const name = unique + path.extname(file.originalname)
    cb(null, name)
  }
})
const upload = multer({ storage })

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
  res.json({ url })
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
