import mongoose from 'mongoose'

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  // Comma-separated style tags, e.g. "A-Line, Csipkés"
  style: { type: String, default: '', trim: true, maxlength: 120 },
  image: { type: String, required: true, trim: true, maxlength: 1000 },
  // Hidden dresses stay in the admin but don't show on the website.
  visible: { type: Boolean, default: true },
  // Position in the collection (lower = earlier).
  order: { type: Number, default: null },
}, { timestamps: true })

export default mongoose.models.Product || mongoose.model('Product', ProductSchema)
