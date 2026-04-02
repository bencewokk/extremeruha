import mongoose from 'mongoose'

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  style: { type: String, required: true, trim: true },
  image: { type: String, required: true, trim: true },
})

export default mongoose.models.Product || mongoose.model('Product', ProductSchema)
