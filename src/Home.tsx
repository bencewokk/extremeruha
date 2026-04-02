import React, { useEffect, useState } from 'react'

type Product = {
  _id?: string
  id?: string
  name: string
  price: number
  description: string
  style: string
  sizes: string[]
  image: string
}

export default function Home() {
  const [form, setForm] = useState({ name: '', email: '', date: '', notes: '' })
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productsError, setProductsError] = useState('')

  useEffect(() => {
    let isActive = true

    async function loadProducts() {
      try {
        const res = await fetch('/api/products')
        if (!res.ok) throw new Error(`Failed to load products: ${res.status}`)

        const data = await res.json()
        if (!isActive) return

        setProducts(Array.isArray(data) ? data : [])
        setProductsError('')
      } catch (err) {
        if (!isActive) return

        console.error('Failed to load homepage products', err)
        setProducts([])
        setProductsError('The collection is unavailable right now.')
      } finally {
        if (isActive) setLoadingProducts(false)
      }
    }

    loadProducts()

    return () => {
      isActive = false
    }
  }, [])

  const heroProduct = products[0]

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((s) => ({ ...s, [e.target.name]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    window.open('https://calendar.google.com/calendar/u/0/r/eventedit', '_blank')
  }

  return (
    <div className="min-h-screen font-jost text-gray-800 bg-ivory">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/60 backdrop-blur border-b border-rose-deep/10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-serif font-cormorant text-rose-deep">Bridal Bloom</div>
            <div className="hidden md:flex gap-6 text-gray-600">
              <a className="hover:text-rose-deep" href="#collection">Collection</a>
              <a className="hover:text-rose-deep" href="#booking">Book</a>
              <a className="hover:text-rose-deep" href="#contact">Contact</a>
              <a className="hover:text-rose-deep" href="/admin">Admin</a>
            </div>
          </div>
          <div>
            <a href="#booking" className="inline-flex items-center rounded-full bg-rose-deep px-4 py-2 text-white text-sm font-semibold shadow">Book Fitting</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="order-2 lg:order-1">
            {heroProduct ? (
              <img src={heroProduct.image} alt={heroProduct.name} className="w-full rounded-3xl shadow-lg object-cover h-[520px]" />
            ) : (
              <div className="flex h-[520px] w-full items-center justify-center rounded-3xl border border-rose-deep/10 bg-white/70 text-gray-500 shadow-lg">
                {loadingProducts ? 'Loading collection…' : 'Add dresses in Admin to feature them here.'}
              </div>
            )}
          </div>
          <div className="order-1 lg:order-2">
            <h1 className="text-5xl leading-tight font-cormorant text-rose-deep mb-4">An editorial collection for the <span className="italic">beginnings</span> of forever</h1>
            <p className="text-lg text-gray-600 mb-6">Soft silhouettes, heirloom-quality lace, and modern tailoring. Each gown is selected for its quiet romance and timeless beauty.</p>
            <div className="flex gap-4">
              <a href="#collection" className="rounded-full border border-rose-deep px-6 py-3 text-rose-deep font-semibold">Explore Collection</a>
              <a href="#booking" className="rounded-full bg-rose-deep px-6 py-3 text-white font-semibold">Book a Fitting</a>
            </div>
          </div>
        </div>
      </header>

      {/* Collection Grid */}
      <section id="collection" className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-3xl font-cormorant text-rose-deep mb-6">The Collection</h2>
        {productsError ? <p className="mb-4 text-sm text-gray-500">{productsError}</p> : null}
        {loadingProducts ? (
          <div className="rounded-2xl border border-rose-deep/10 bg-white p-6 text-gray-500">Loading collection…</div>
        ) : products.length > 0 ? (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <article key={product._id ?? product.id ?? product.name} className="rounded-2xl bg-white border border-rose-deep/10 overflow-hidden shadow-sm">
                <img src={product.image} alt={product.name} className="h-64 w-full object-cover" />
                <div className="p-4">
                  <h3 className="text-xl font-cormorant text-rose-deep">{product.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{product.style} • ${product.price}</p>
                  <p className="mt-3 text-gray-600 text-sm">{product.description}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-rose-deep/10 bg-white p-6 text-gray-500">
            No products yet. Add items in Admin to show them here.
          </div>
        )}
      </section>

      {/* Booking Banner */}
      <section id="booking" className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center rounded-2xl bg-white border border-rose-deep/10 p-6">
          <div>
            <h3 className="text-2xl font-cormorant text-rose-deep mb-3">Personalized fittings that feel like home</h3>
            <p className="text-gray-600">Schedule a private appointment and let our stylists curate options tailored to your vision and silhouette.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input name="name" value={form.name} onChange={handleChange} placeholder="Full name" className="border rounded px-3 py-2 w-full" />
              <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <input name="date" value={form.date} onChange={handleChange} type="date" className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes (dress styles, size, anything)" className="border rounded px-3 py-2 w-full h-24" />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="rounded-full bg-rose-deep px-6 py-2 text-white font-semibold">Request Appointment</button>
            </div>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="border-t border-rose-deep/10 bg-white py-6">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between text-sm text-gray-600">
          <div>© {new Date().getFullYear()} Bridal Bloom</div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-rose-deep">Instagram</a>
            <a href="#" className="hover:text-rose-deep">Pinterest</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
