import React, { useEffect, useMemo, useState } from 'react'
import { ADMIN_AUTH_EVENT, getAdminToken } from './admin/auth'
import ProductCarousel from './components/ProductCarousel'

declare const __BUILD_TIME__: string
declare const __GIT_HASH__: string

type Product = {
  _id?: string
  id?: string
  name: string
  style: string
  image: string
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getBusinessWindow(dateInput: string) {
  const [year, month, day] = dateInput.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (Number.isNaN(date.getTime())) return null

  const weekDay = date.getDay()
  if (weekDay === 0) return null // Sunday closed

  const openHour = 10
  const closeHour = weekDay === 6 ? 16 : 19

  const from = new Date(year, month - 1, day, openHour, 0, 0, 0)
  const to = new Date(year, month - 1, day, closeHour, 0, 0, 0)
  return { from, to }
}

function formatSlotLabel(slotIso: string) {
  return new Date(slotIso).toLocaleTimeString('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extractTags(style: string) {
  return style
    .split(/[,/|]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export default function Home() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', startDateTime: '', notes: '' })
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()))
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => Boolean(getAdminToken()))
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productsError, setProductsError] = useState('')
  const [bookingMessage, setBookingMessage] = useState('')
  const [bookingError, setBookingError] = useState('')
  const [submittingBooking, setSubmittingBooking] = useState(false)

  useEffect(() => {
    const syncAuthState = () => {
      setIsAdminLoggedIn(Boolean(getAdminToken()))
    }

    window.addEventListener('storage', syncAuthState)
    window.addEventListener(ADMIN_AUTH_EVENT, syncAuthState)

    return () => {
      window.removeEventListener('storage', syncAuthState)
      window.removeEventListener(ADMIN_AUTH_EVENT, syncAuthState)
    }
  }, [])

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

  const availableTags = useMemo(() => {
    const tags = new Set<string>()

    products.forEach((product) => {
      const extracted = extractTags(product.style)
      if (extracted.length === 0 && product.style.trim()) {
        tags.add(product.style.trim())
        return
      }

      extracted.forEach((tag) => tags.add(tag))
    })

    return Array.from(tags)
  }, [products])

  useEffect(() => {
    setActiveTags((prev) => prev.filter((tag) => availableTags.includes(tag)))
  }, [availableTags])

  const filteredProducts = useMemo(() => {
    if (activeTags.length === 0) return products

    return products.filter((product) => {
      const extracted = extractTags(product.style)
      const productTags = extracted.length > 0 ? extracted : [product.style.trim()].filter(Boolean)
      return activeTags.some((tag) => productTags.includes(tag))
    })
  }, [activeTags, products])

  const heroProduct = products[0]

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((s) => ({ ...s, [e.target.name]: e.target.value }))
  }

  async function loadAvailabilityForDate(dateValue: string, preferredSlot = '') {
    const window = getBusinessWindow(dateValue)
    if (!window) {
      setAvailableSlots([])
      setAvailabilityError('')
      setForm((s) => ({ ...s, startDateTime: '' }))
      return
    }

    setLoadingAvailability(true)
    setAvailabilityError('')

    try {
      const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Budapest'
      const params = new URLSearchParams({
        fromIso: window.from.toISOString(),
        toIso: window.to.toISOString(),
        timeZone: clientTimeZone,
      })

      const response = await fetch(`/api/bookings/availability?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.error || 'Could not load availability')
      }

      const slots = Array.isArray(payload?.slots) ? payload.slots : []
      setAvailableSlots(slots)

      const nextSlot = preferredSlot && slots.includes(preferredSlot)
        ? preferredSlot
        : (slots[0] || '')

      setForm((s) => ({ ...s, startDateTime: nextSlot }))
    } catch (error) {
      console.error('Availability request failed', error)
      setAvailableSlots([])
      setAvailabilityError(error instanceof Error ? error.message : 'Could not load availability')
      setForm((s) => ({ ...s, startDateTime: '' }))
    } finally {
      setLoadingAvailability(false)
    }
  }

  useEffect(() => {
    loadAvailabilityForDate(selectedDate, form.startDateTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBookingError('')
    setBookingMessage('')

    if (!form.name || !form.email || !form.phone || !form.startDateTime) {
      setBookingError('Please add your name, email, phone number, and preferred appointment start time.')
      return
    }

    const start = new Date(form.startDateTime)
    if (Number.isNaN(start.getTime())) {
      setBookingError('Please provide a valid appointment start time.')
      return
    }

    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Budapest'

    setSubmittingBooking(true)
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          startIso: start.toISOString(),
          notes: form.notes,
          timeZone: clientTimeZone,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        if (payload?.fallbackUrl) {
          window.open(payload.fallbackUrl, '_blank')
          setBookingMessage('Calendar API is unavailable right now, so we opened a prefilled Google Calendar booking page instead.')
          return
        }

        setBookingError(payload?.error || 'Could not create booking right now. Please try again.')
        return
      }

      if (payload?.eventLink) {
        window.open(payload.eventLink, '_blank')
      }

      setBookingMessage('Appointment added to Google Calendar. The event page opened in a new tab.')
      setForm({ name: '', email: '', phone: '', startDateTime: '', notes: '' })
      await loadAvailabilityForDate(selectedDate)
    } catch (error) {
      console.error('Booking request failed', error)
      setBookingError('Could not connect to the booking service. Please try again.')
    } finally {
      setSubmittingBooking(false)
    }
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
              <a className="hover:text-rose-deep" href="#visit">Visit Us</a>
              <a className="hover:text-rose-deep" href="#contact">Contact</a>
              {isAdminLoggedIn ? <a className="hover:text-rose-deep" href="/admin">Admin</a> : null}
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
      <section id="collection" className="py-12">
        <div className="mx-auto max-w-6xl px-6 mb-6">
          <h2 className="text-3xl font-cormorant text-rose-deep">The Collection</h2>
          {availableTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTags([])}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${activeTags.length === 0 ? 'border-rose-deep bg-rose-deep text-white' : 'border-rose-deep/30 bg-white text-rose-deep'}`}
              >
                All
              </button>
              {availableTags.map((tag) => {
                const active = activeTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? 'border-rose-deep bg-rose-deep text-white' : 'border-rose-deep/30 bg-white text-rose-deep'}`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          ) : null}
          {productsError ? <p className="mt-2 text-sm text-gray-500">{productsError}</p> : null}
        </div>
        {loadingProducts ? (
          <div className="mx-auto max-w-6xl px-6">
            <div className="rounded-2xl border border-rose-deep/10 bg-white p-6 text-gray-500">Loading collection…</div>
          </div>
        ) : filteredProducts.length > 0 ? (
          <ProductCarousel products={filteredProducts} />
        ) : (
          <div className="mx-auto max-w-6xl px-6">
            <div className="rounded-2xl border border-rose-deep/10 bg-white p-6 text-gray-500">
              {products.length > 0 ? 'No items match the selected tags.' : 'No products yet. Add items in Admin to show them here.'}
            </div>
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
              <input name="name" value={form.name} onChange={handleChange} placeholder="Full name" className="border rounded px-3 py-2 w-full" required />
              <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="border rounded px-3 py-2 w-full" required />
            </div>
            <div>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                type="tel"
                placeholder="Phone number"
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Select date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Available start times</label>
              {loadingAvailability ? (
                <p className="text-sm text-gray-500">Loading free slots...</p>
              ) : availabilityError ? (
                <p className="text-sm text-red-600">{availabilityError}</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-gray-500">No free slots for this day.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableSlots.map((slot) => {
                    const active = form.startDateTime === slot
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setForm((s) => ({ ...s, startDateTime: slot }))}
                        className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${active ? 'border-rose-deep bg-rose-deep text-white' : 'border-rose-deep/30 bg-white text-rose-deep'}`}
                      >
                        {formatSlotLabel(slot)}
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">Slots are pulled from Google Calendar, 90 minutes long, and start every 15 minutes.</p>
            </div>
            <div>
              <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes (dress styles, size, anything)" className="border rounded px-3 py-2 w-full h-24" />
            </div>
            {bookingError ? <p className="text-sm text-red-600">{bookingError}</p> : null}
            {bookingMessage ? <p className="text-sm text-green-700">{bookingMessage}</p> : null}
            <div className="flex justify-end">
              <button type="submit" disabled={submittingBooking} className="rounded-full bg-rose-deep px-6 py-2 text-white font-semibold disabled:opacity-60">{submittingBooking ? 'Creating…' : 'Request Appointment'}</button>
            </div>
          </form>
        </div>
      </section>

      {/* Visit Us */}
      <section id="visit" className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="rounded-2xl bg-white border border-rose-deep/10 p-6 shadow-sm">
            <h3 className="text-2xl font-cormorant text-rose-deep mb-3">Visit Extreme Ruhaszalon</h3>
            <p className="text-gray-600 mb-5">
              Our boutique is in the city center with private fitting rooms and one-on-one bridal styling.
            </p>

            <div className="space-y-3 text-gray-700">
              <p><span className="font-semibold text-rose-deep">Business:</span> Extreme Ruhaszalon</p>
              <p><span className="font-semibold text-rose-deep">Address:</span> Munkacsy utca, 3530 Miskolc, Hungary</p>
              <p><span className="font-semibold text-rose-deep">Phone:</span> +36 1 555 0137</p>
              <p><span className="font-semibold text-rose-deep">Email:</span> hello@bridalbloom.hu</p>
            </div>

            <div className="mt-5 border-t border-rose-deep/10 pt-4 text-sm text-gray-600">
              <p className="font-semibold text-rose-deep mb-1">Opening Hours</p>
              <p>Mon-Fri: 10:00 - 19:00</p>
              <p>Saturday: 10:00 - 16:00</p>
              <p>Sunday: By appointment</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-rose-deep/10 shadow-sm min-h-[360px]">
            <iframe
              title="Bridal Bloom on Google Maps"
              src="https://www.google.com/maps?q=Extreme+Ruhaszalon+Miskolc&output=embed"
              className="h-full w-full min-h-[360px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
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
        <div className="mx-auto max-w-6xl px-6 mt-2 text-xs text-gray-400">
          Build: {new Date(__BUILD_TIME__).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} &middot; {__GIT_HASH__}
        </div>
      </footer>
    </div>
  )
}
