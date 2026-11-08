import mongoose from 'mongoose'
import { randomUUID } from 'crypto'
import Product from './models/Product.js'

// Products (wedding dresses) shown in the collection.
// Stored in MongoDB. Only when no MONGO_URI is configured at all (local
// development) do they live in memory, seeded from seed-data.json; changes
// are lost on restart there. If MongoDB is configured but unreachable, writes
// are refused instead of silently going to memory.

const MAX_NAME = 100
const MAX_STYLE = 120
const MAX_URL = 1000

export class ProductError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

let memoryProducts = []

export function seedMemoryProducts(seed) {
  memoryProducts = seed.map((product, index) => ({
    _id: product.id || randomUUID(),
    name: product.name,
    style: product.style || '',
    image: product.image,
    visible: true,
    order: index,
  }))
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1
}

function useMemory() {
  if (isMongoConnected()) return false
  if (process.env.MONGO_URI) return null // configured but down
  return true
}

function requireStorage({ write }) {
  const memory = useMemory()
  if (memory === null) {
    if (write) throw new ProductError(503, 'Az adatbázis most nem érhető el, ezért nem lehet menteni. Próbáld újra pár perc múlva.')
    return 'unavailable'
  }
  return memory ? 'memory' : 'mongo'
}

function toPlain(doc) {
  return {
    _id: String(doc._id),
    name: doc.name,
    style: doc.style || '',
    image: doc.image,
    visible: doc.visible !== false,
    order: typeof doc.order === 'number' ? doc.order : null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  }
}

function sortProducts(list) {
  // Explicit order first; products without one keep their original order.
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = a.item.order ?? Number.POSITIVE_INFINITY
      const bo = b.item.order ?? Number.POSITIVE_INFINITY
      return ao === bo ? a.index - b.index : ao - bo
    })
    .map(({ item }) => item)
}

// Validates admin input. `partial` allows updating only some fields.
export function sanitizeProductInput(input, { partial = false } = {}) {
  const out = {}

  if (!partial || input?.name !== undefined) {
    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    if (!name) throw new ProductError(400, 'A ruha neve kötelező.')
    if (name.length > MAX_NAME) throw new ProductError(400, `A név legfeljebb ${MAX_NAME} karakter lehet.`)
    out.name = name
  }

  if (!partial || input?.style !== undefined) {
    const raw = Array.isArray(input?.style) ? input.style.join(', ') : (typeof input?.style === 'string' ? input.style : '')
    const tags = [...new Set(raw.split(/[,/|]/).map((tag) => tag.trim()).filter(Boolean))]
    const style = tags.join(', ')
    if (style.length > MAX_STYLE) throw new ProductError(400, `A stílus címkék együtt legfeljebb ${MAX_STYLE} karakter lehetnek.`)
    out.style = style
  }

  if (!partial || input?.image !== undefined) {
    const image = typeof input?.image === 'string' ? input.image.trim() : ''
    if (!image) throw new ProductError(400, 'A kép megadása kötelező.')
    let url
    try {
      url = new URL(image)
    } catch {
      throw new ProductError(400, 'A kép címe nem érvényes link.')
    }
    if (!['https:', 'http:'].includes(url.protocol) || image.length > MAX_URL) {
      throw new ProductError(400, 'A kép címe nem érvényes link (https://… legyen).')
    }
    out.image = image
  }

  if (input?.visible !== undefined) out.visible = Boolean(input.visible)

  return out
}

// Old documents have no `order`; give everyone one, keeping the current order.
async function backfillOrder(docs) {
  if (!docs.some((doc) => typeof doc.order !== 'number')) return docs
  const sorted = sortProducts(docs.map(toPlain))
  await Product.bulkWrite(sorted.map((doc, index) => ({
    updateOne: { filter: { _id: doc._id }, update: { $set: { order: index } } },
  })))
  return sorted.map((doc, index) => ({ ...doc, order: index }))
}

export async function listProducts({ includeHidden = false } = {}) {
  const storage = requireStorage({ write: false })
  let list
  if (storage === 'mongo') {
    const docs = await Product.find().lean()
    list = sortProducts((await backfillOrder(docs)).map(toPlain))
  } else if (storage === 'memory') {
    list = sortProducts(memoryProducts.map(toPlain))
  } else {
    throw new ProductError(503, 'Az adatbázis most nem érhető el. Próbáld újra pár perc múlva.')
  }
  return includeHidden ? list : list.filter((product) => product.visible)
}

async function nextTopOrder() {
  const list = await listProducts({ includeHidden: true })
  const orders = list.map((p) => p.order).filter((o) => typeof o === 'number')
  return orders.length ? Math.min(...orders) - 1 : 0
}

export async function createProduct(input) {
  const data = sanitizeProductInput(input)
  const storage = requireStorage({ write: true })
  const order = await nextTopOrder() // new dresses go to the front

  if (storage === 'memory') {
    const doc = { _id: randomUUID(), visible: true, ...data, order, createdAt: new Date().toISOString() }
    memoryProducts = [doc, ...memoryProducts]
    return toPlain(doc)
  }

  const doc = await Product.create({ visible: true, ...data, order })
  return toPlain(doc.toObject())
}

async function findById(id) {
  if (requireStorage({ write: false }) === 'memory') {
    return memoryProducts.find((p) => String(p._id) === id) || null
  }
  if (!mongoose.isValidObjectId(id)) return null
  return Product.findById(id).lean()
}

// Returns { product, previous } so the caller can clean up a replaced image.
export async function updateProduct(id, input) {
  const data = sanitizeProductInput(input, { partial: true })
  const storage = requireStorage({ write: true })
  const previous = await findById(id)
  if (!previous) throw new ProductError(404, 'Ez a ruha már nem létezik (lehet, hogy közben törölték).')

  if (storage === 'memory') {
    const updated = { ...previous, ...data, updatedAt: new Date().toISOString() }
    memoryProducts = memoryProducts.map((p) => (String(p._id) === id ? updated : p))
    return { product: toPlain(updated), previous: toPlain(previous) }
  }

  const updated = await Product.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean()
  if (!updated) throw new ProductError(404, 'Ez a ruha már nem létezik (lehet, hogy közben törölték).')
  return { product: toPlain(updated), previous: toPlain(previous) }
}

export async function deleteProduct(id) {
  const storage = requireStorage({ write: true })
  const existing = await findById(id)
  if (!existing) throw new ProductError(404, 'Ez a ruha már nem létezik.')

  if (storage === 'memory') {
    memoryProducts = memoryProducts.filter((p) => String(p._id) !== id)
  } else {
    await Product.deleteOne({ _id: id })
  }
  return toPlain(existing)
}

// ids: every product id in the wanted order.
export async function reorderProducts(ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new ProductError(400, 'Érvénytelen sorrend.')
  }
  const storage = requireStorage({ write: true })
  const current = await listProducts({ includeHidden: true })
  const known = new Set(current.map((p) => p._id))
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw new ProductError(409, 'A lista közben megváltozott. Frissítsd az oldalt, és próbáld újra.')
  }

  if (storage === 'memory') {
    const position = new Map(ids.map((id, index) => [id, index]))
    memoryProducts = memoryProducts.map((p) => ({ ...p, order: position.get(String(p._id)) }))
  } else {
    await Product.bulkWrite(ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    })))
  }
  return listProducts({ includeHidden: true })
}
