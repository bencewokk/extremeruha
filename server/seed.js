import dotenv from 'dotenv'
import mongoose from 'mongoose'
import fs from 'fs/promises'
import Product from './models/Product.js'

dotenv.config({ path: './server/.env' })

const MONGO = process.env.MONGO_URI

if (!MONGO) {
  console.error('MONGO_URI not set in environment')
  process.exit(1)
}

async function run() {
  try {
    await mongoose.connect(MONGO)
    console.log('Connected to MongoDB for seeding')

    const raw = await fs.readFile(new URL('./seed-data.json', import.meta.url))
    const docs = JSON.parse(raw.toString())

    const existing = await Product.countDocuments()
    if (existing > 0) {
      console.log('Products collection not empty; skipping seed (existing count:', existing, ')')
      await mongoose.disconnect()
      return
    }

    // Map JSON fields to model (no _id provided)
    const toInsert = docs.map((d) => ({
      name: d.name,
      price: d.price,
      description: d.description,
      style: d.style,
      sizes: d.sizes,
      image: d.image,
    }))

    const res = await Product.insertMany(toInsert)
    console.log('Inserted', res.length, 'products')
    await mongoose.disconnect()
  } catch (err) {
    console.error('Seed failed', err)
    process.exit(1)
  }
}

run()
