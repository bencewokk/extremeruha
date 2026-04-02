import { useEffect, useState } from 'react'

type Product = {
  _id?: string
  name: string
  style: string
  image: string
}

export default function Admin() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<Product>({ name: '', style: '', image: '' })
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    fetch('/api/products')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setItems)
      .catch((err) => {
        console.error('Failed to load products', err)
        setItems([])
      })
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target as HTMLInputElement
    setForm((s) => ({ ...s, [name]: value }))
  }

  async function uploadFile(): Promise<string | null> {
    if (!file) return null
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!res.ok) throw new Error('Upload failed')
    const json = await res.json()
    return json.url
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      let image = form.image
      if (file) {
        const url = await uploadFile()
        if (url) image = url
      }

      if (!image.trim()) {
        throw new Error('Image is required')
      }

      const payload = {
        name: form.name.trim(),
        style: form.style.trim(),
        image: image.trim(),
      }

      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(`Create failed: ${res.status} ${res.statusText}`)
      const data = await res.json()
      setItems((it) => [data, ...it])
      setForm({ name: '', style: '', image: '' })
      setFile(null)
    } catch (err) {
      console.error(err)
      alert('Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  async function remove(id?: string) {
    if (!id) return
    await fetch(`/api/products/${id}`, { method: 'DELETE' })
    setItems((it) => it.filter((p) => p._id !== id))
  }

  return (
    <div className="min-h-screen bg-ivory font-jost">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-cormorant text-rose-deep mb-4">Admin — Products</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it._id} className="p-3 bg-white border rounded flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-sm text-gray-500">{it.style}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-sm text-red-600" onClick={() => remove(it._id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <aside>
            <form onSubmit={createProduct} className="space-y-3 bg-white p-4 border rounded">
              <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="w-full border p-2" required />
              <input name="style" value={form.style} onChange={handleChange} placeholder="Style" className="w-full border p-2" required />
              <div>
                <label className="block text-sm mb-1">Image</label>
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="w-full" />
                <div className="text-xs text-gray-500 mt-1">Or leave blank to use image URL below</div>
              </div>
              <input name="image" value={form.image} onChange={handleChange} placeholder="Or paste image URL" className="w-full border p-2" />
              <button type="submit" disabled={loading} className="w-full bg-rose-deep text-white py-2 rounded">{loading ? 'Saving…' : 'Create'}</button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  )
}
