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

type GoogleReview = {
  authorName: string
  authorUrl: string
  authorPhotoUrl: string
  rating: number | null
  relativeTimeDescription: string
  text: string
  publishTime: string
}

type GoogleReviewsPlace = {
  name: string
  address: string
  googleMapsUri: string
  rating: number | null
  userRatingCount: number
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

function formatReviewMeta(review: GoogleReview) {
  if (review.relativeTimeDescription) return review.relativeTimeDescription
  if (!review.publishTime) return 'Google review'

  return new Date(review.publishTime).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function truncateReviewText(text: string, maxLength = 220) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}...`
}

function extractTags(style: string) {
  return style
    .split(/[,/|]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.35em] text-rose-deep/70">
      <span className="h-px w-10 bg-rose-deep/30" />
      <span>{children}</span>
    </div>
  )
}

function MotifBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-rose-deep/15 bg-white/80 px-3 py-1 text-xs font-semibold text-rose-deep shadow-sm backdrop-blur">
      {children}
    </span>
  )
}

function SectionDivider() {
  return (
    <div className="flex items-center gap-4 py-8">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-rose-deep/30 to-transparent" />
      <span className="h-2 w-2 rotate-45 border border-rose-deep/40 bg-ivory shadow-sm" />
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-rose-deep/30 to-transparent" />
    </div>
  )
}

function IconShell({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-deep/15 bg-white/80 text-rose-deep shadow-sm">
      {children}
    </span>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3.75 2.63 5.34 5.9.86-4.27 4.16 1.01 5.88L12 17.23 6.73 20l1.01-5.88-4.27-4.16 5.9-.86L12 3.75Z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.75v3.5M16 2.75v3.5M3.75 9.25h16.5M5.75 5.25h12.5a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2V7.25a2 2 0 0 1 2-2Z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.25a7.75 7.75 0 1 1 0 15.5 7.75 7.75 0 0 1 0-15.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.5v4l2.75 1.75" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25s5.25-5.26 5.25-10.03a5.25 5.25 0 1 0-10.5 0c0 4.77 5.25 10.03 5.25 10.03Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.98 4.75h2.13c.36 0 .68.24.77.58l.72 2.88a.8.8 0 0 1-.2.76l-1.31 1.32a12.7 12.7 0 0 0 4.62 4.62l1.32-1.31a.8.8 0 0 1 .76-.2l2.88.72c.34.09.58.41.58.77v2.13c0 .44-.36.8-.8.8h-1.2C9.97 19.82 4.18 14.03 4.18 6.35v-1.2c0-.44.36-.8.8-.8Z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.75 6.25h14.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H4.75a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" />
    </svg>
  )
}

function RatingStars({ rating, size = 'h-4 w-4' }: { rating: number | null, size?: string }) {
  const filledStars = Math.max(0, Math.min(5, Math.round(rating || 0)))

  return (
    <div className="flex items-center gap-1 text-rose-deep">
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          className={size}
          fill={index < filledStars ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m12 3.75 2.63 5.34 5.9.86-4.27 4.16 1.01 5.88L12 17.23 6.73 20l1.01-5.88-4.27-4.16 5.9-.86L12 3.75Z" />
        </svg>
      ))}
    </div>
  )
}

function ReviewAvatar({ name, photoUrl }: { name: string, photoUrl?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'G'

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-11 w-11 rounded-full border border-rose-deep/10 object-cover"
      />
    )
  }

  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-rose-deep/10 bg-rose-deep/5 text-sm font-semibold text-rose-deep">
      {initial}
    </span>
  )
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
  const [reviews, setReviews] = useState<GoogleReview[]>([])
  const [reviewsPlace, setReviewsPlace] = useState<GoogleReviewsPlace | null>(null)
  const [loadingReviews, setLoadingReviews] = useState(true)
  const [reviewsError, setReviewsError] = useState('')
  const [reviewsStale, setReviewsStale] = useState(false)

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
        setProductsError('A kollekcio jelenleg nem elerheto.')
      } finally {
        if (isActive) setLoadingProducts(false)
      }
    }

    loadProducts()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    async function loadReviews() {
      try {
        const response = await fetch('/api/reviews')
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload?.error || 'Nem sikerult betolteni a Google velemenyeket.')
        }

        if (!isActive) return

        setReviews(Array.isArray(payload?.reviews) ? payload.reviews : [])
        setReviewsPlace(payload?.place || null)
        setReviewsStale(Boolean(payload?.stale))
        setReviewsError('')
      } catch (error) {
        if (!isActive) return

        console.error('Failed to load Google reviews', error)
        setReviews([])
        setReviewsPlace(null)
        setReviewsStale(false)
        setReviewsError(error instanceof Error ? error.message : 'Nem sikerult betolteni a Google velemenyeket.')
      } finally {
        if (isActive) setLoadingReviews(false)
      }
    }

    loadReviews()

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

  const visibleReviews = useMemo(() => {
    return reviews.filter((review) => review.text.trim()).slice(0, 3)
  }, [reviews])

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
        throw new Error(payload?.error || 'Nem sikerult betolteni az idopontokat')
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
      setAvailabilityError(error instanceof Error ? error.message : 'Nem sikerult betolteni az idopontokat')
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
      setBookingError('Kerlek add meg a nevedet, email-cimedet, telefonszamodat es valassz idopontot.')
      return
    }

    const start = new Date(form.startDateTime)
    if (Number.isNaN(start.getTime())) {
      setBookingError('Ervenytelen idopont.')
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
          setBookingMessage('A naptar API most nem elerheto, ezert egy elore kitoltott Google Naptar oldalt nyitottunk meg.')
          return
        }

        setBookingError(payload?.error || 'A foglalas most nem sikerult. Kerlek probald ujra.')
        return
      }

      if (payload?.eventLink) {
        window.open(payload.eventLink, '_blank')
      }

      setBookingMessage('A foglalas sikeresen bekerult a Google Naptarba. Az esemeny uj lapon nyilt meg.')
      setForm({ name: '', email: '', phone: '', startDateTime: '', notes: '' })
      await loadAvailabilityForDate(selectedDate)
    } catch (error) {
      console.error('Booking request failed', error)
      setBookingError('Nem sikerult kapcsolodni a foglalasi szolgaltatashoz. Kerlek probald ujra.')
    } finally {
      setSubmittingBooking(false)
    }
  }

  return (
    <div className="min-h-screen font-jost text-gray-800 overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/60 backdrop-blur border-b border-rose-deep/10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-serif font-cormorant text-rose-deep">extremeruha</div>
            <div className="hidden md:flex gap-6 text-gray-600">
              <a className="hover:text-rose-deep" href="#collection">Kollekcio</a>
              <a className="hover:text-rose-deep" href="#booking">Idopontfoglalas</a>
              <a className="hover:text-rose-deep" href="#visit">Latogatas</a>
              <a className="hover:text-rose-deep" href="#contact">Kapcsolat</a>
              {isAdminLoggedIn ? <a className="hover:text-rose-deep" href="/admin">Admin</a> : null}
            </div>
          </div>
          <div>
            <a href="#booking" className="inline-flex items-center rounded-full bg-rose-deep px-4 py-2 text-white text-sm font-semibold shadow">Idopontfoglalas</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="order-2 lg:order-1 mb-[50.625%]">
            {heroProduct ? (
              <div className="relative isolate">
                <div className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-rose/15 blur-3xl" />
                <div className="pointer-events-none absolute -right-8 bottom-8 h-24 w-24 rounded-full border border-rose-deep/20" />
                <div className="relative aspect-video w-full overflow-visible">
                  <img
                    src={heroProduct.image}
                    alt={heroProduct.name}
                    className="absolute left-0 top-0 h-[190%] w-full rounded-[2rem] object-cover object-top shadow-lg ring-1 ring-white/60"
                  />
                </div>
                <div className="pointer-events-none absolute -bottom-4 left-8 hidden rounded-full border border-rose-deep/10 bg-white/85 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-rose-deep shadow-sm backdrop-blur md:block">
                  Atelier selection
                </div>
              </div>
            ) : (
              <div className="aspect-video flex w-full items-center justify-center rounded-3xl border border-rose-deep/10 bg-white/70 text-gray-500 shadow-lg">
                {loadingProducts ? 'Kollekcio betoltese…' : 'Adj hozza ruhakat az Admin feluleten, hogy itt megjelenjenek.'}
              </div>
            )}
          </div>
          <div className="order-1 lg:order-2">
            <SectionEyebrow>Atelier bridal salon</SectionEyebrow>
            <h1 className="text-5xl leading-tight font-cormorant text-rose-deep mb-4">Exkluziv menyasszonyi kollekcio az <span className="italic">orok</span> pillanatokhoz</h1>
            <p className="text-lg text-gray-600 mb-6">Finom vonalvezetes, modern szabvonalak es idotallo elegancia. Minden ruhat gondosan valogatunk, hogy kulonleges legyen a nagy napod.</p>
            <div className="mb-8 flex flex-wrap gap-3">
              <MotifBadge>Privat proba</MotifBadge>
              <MotifBadge>Szemelyre szabott stilus</MotifBadge>
              <MotifBadge>Nyugodt hangulat</MotifBadge>
            </div>
            <div className="flex gap-4">
              <a href="#collection" className="rounded-full border border-rose-deep px-6 py-3 text-rose-deep font-semibold">Kollekcio megnezese</a>
              <a href="#booking" className="rounded-full bg-rose-deep px-6 py-3 text-white font-semibold">Proba foglalasa</a>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6">
        <SectionDivider />
      </div>

      {/* Collection Grid */}
      <section id="collection" className="py-12">
        <div className="mx-auto max-w-6xl px-6 mb-6">
          <SectionEyebrow>Valogatott darabok</SectionEyebrow>
          <h2 className="text-3xl font-cormorant text-rose-deep">A Kollekcio</h2>
          <p className="mt-2 max-w-2xl text-gray-600">Finom csipke, strukturalt szabasok es idotallo elegancia minden darabban.</p>
          {availableTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTags([])}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${activeTags.length === 0 ? 'border-rose-deep bg-rose-deep text-white' : 'border-rose-deep/30 bg-white text-rose-deep'}`}
              >
                Osszes
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
            <div className="rounded-2xl border border-rose-deep/10 bg-white p-6 text-gray-500">Kollekcio betoltese…</div>
          </div>
        ) : filteredProducts.length > 0 ? (
          <ProductCarousel products={filteredProducts} />
        ) : (
          <div className="mx-auto max-w-6xl px-6">
            <div className="motif-panel rounded-[28px] p-6 text-gray-500">
              {products.length > 0 ? 'Nincs a kijelolt cimkeknek megfelelo ruha.' : 'Meg nincs feltoltott ruha. Add hozza az Admin feluleten.'}
            </div>
          </div>
        )}
      </section>

      {/* Booking Banner */}
      <section id="booking" className="mx-auto max-w-6xl px-6 py-12">
        <div className="motif-panel grid grid-cols-1 lg:grid-cols-2 gap-6 items-center rounded-[32px] p-6 lg:p-8">
          <div>
            <SectionEyebrow>Idopontfoglalas</SectionEyebrow>
            <h3 className="text-2xl font-cormorant text-rose-deep mb-3">Szemelyre szabott ruhaproba, nyugodt kornyezetben</h3>
            <p className="text-gray-600">Foglalj privat idopontot, es stylistjaink segitenek megtalalni a hozzad leginkabb illo ruhat.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <MotifBadge>90 perces proba</MotifBadge>
              <MotifBadge>Stylist tanacsadas</MotifBadge>
              <MotifBadge>Google naptar szinkron</MotifBadge>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-deep/10 bg-white/70 px-4 py-3 text-sm text-gray-600">
                <div className="mb-2 flex items-center gap-2 text-rose-deep">
                  <IconShell><ClockIcon /></IconShell>
                </div>
                90 perc nyugodt, privat probara.
              </div>
              <div className="rounded-2xl border border-rose-deep/10 bg-white/70 px-4 py-3 text-sm text-gray-600">
                <div className="mb-2 flex items-center gap-2 text-rose-deep">
                  <IconShell><CalendarIcon /></IconShell>
                </div>
                Azonnali visszaigazolas Google Naptarral.
              </div>
              <div className="rounded-2xl border border-rose-deep/10 bg-white/70 px-4 py-3 text-sm text-gray-600">
                <div className="mb-2 flex items-center gap-2 text-rose-deep">
                  <IconShell><StarIcon /></IconShell>
                </div>
                Szemelyes figyelem minden menyasszonynak.
              </div>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input name="name" value={form.name} onChange={handleChange} placeholder="Teljes nev" className="elegant-field" required />
              <input name="email" value={form.email} onChange={handleChange} placeholder="Email-cim" className="elegant-field" required />
            </div>
            <div>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                type="tel"
                placeholder="Telefonszam"
                className="elegant-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Datum valasztasa</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="elegant-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Elerheto kezdesi idopontok</label>
              {loadingAvailability ? (
                <p className="text-sm text-gray-500">Szabad idopontok betoltese...</p>
              ) : availabilityError ? (
                <p className="text-sm text-red-600">{availabilityError}</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-gray-500">Erre a napra nincs szabad idopont.</p>
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
              <p className="mt-2 text-xs text-gray-500">Az idopontok a Google Naptarbol erkeznek, 90 percesek, es 15 percenkent indulnak.</p>
            </div>
            <div>
              <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Megjegyzes (stilus, meret, egyeb)" className="elegant-field h-24 resize-y" />
            </div>
            {bookingError ? <p className="text-sm text-red-600">{bookingError}</p> : null}
            {bookingMessage ? <p className="text-sm text-green-700">{bookingMessage}</p> : null}
            <div className="flex justify-end">
              <button type="submit" disabled={submittingBooking || !form.startDateTime} className="rounded-full bg-rose-deep px-6 py-2 text-white font-semibold disabled:opacity-60">{submittingBooking ? 'Foglalas folyamatban…' : 'Idopont foglalasa'}</button>
            </div>
            <p className="border-t border-rose-deep/10 pt-3 text-xs uppercase tracking-[0.22em] text-gray-500">
              Privat idopont • Google visszaigazolas • 5 csillagos elmeny
            </p>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-4">
        <div className="grid gap-4 rounded-[32px] border border-rose-deep/10 bg-white/70 p-6 backdrop-blur lg:grid-cols-[0.95fr,1.25fr]">
          <div>
            <SectionEyebrow>Google velemenyek</SectionEyebrow>
            <h3 className="text-2xl font-cormorant text-rose-deep">Valos visszajelzesek a Google-bol</h3>
            <p className="mt-2 max-w-xl text-gray-600">A szalon ertekeleseit es vendegvelemenyeit kozvetlenul a Google helyadatlaprol toltjuk be.</p>

            {loadingReviews ? (
              <div className="mt-6 animate-pulse space-y-3">
                <div className="h-12 w-28 rounded-full bg-rose-deep/10" />
                <div className="h-4 w-40 rounded-full bg-rose-deep/10" />
                <div className="h-4 w-56 rounded-full bg-rose-deep/10" />
              </div>
            ) : reviewsPlace ? (
              <div className="mt-6">
                <div className="flex flex-wrap items-end gap-5">
                  <div className="text-5xl leading-none font-cormorant text-rose-deep">
                    {typeof reviewsPlace.rating === 'number' ? reviewsPlace.rating.toFixed(1) : '-'}
                  </div>
                  <div>
                    <RatingStars rating={reviewsPlace.rating} />
                    <p className="mt-2 text-sm text-gray-600">{reviewsPlace.userRatingCount.toLocaleString('hu-HU')} Google ertekeles</p>
                    <p className="mt-1 text-sm text-gray-500">{reviewsPlace.name || 'Extreme Ruhaszalon'}</p>
                  </div>
                </div>

                {reviewsPlace.address ? <p className="mt-4 max-w-md text-sm text-gray-500">{reviewsPlace.address}</p> : null}
                {reviewsStale ? <p className="mt-3 text-xs uppercase tracking-[0.22em] text-gray-400">Atmenetileg gyorsitotarazott ertekelesek</p> : null}
                {reviewsPlace.googleMapsUri ? (
                  <a
                    href={reviewsPlace.googleMapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex rounded-full border border-rose-deep/20 px-4 py-2 text-sm font-semibold text-rose-deep transition hover:border-rose-deep hover:bg-rose-deep hover:text-white"
                  >
                    Teljes Google profil
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-rose-deep/10 bg-white px-4 py-4 text-sm text-gray-600">
                {reviewsError || 'A Google review kapcsolat hamarosan elerheto.'}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loadingReviews ? Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="rounded-2xl border border-rose-deep/10 bg-white px-5 py-5 shadow-sm animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-rose-deep/10" />
                  <div className="space-y-2">
                    <div className="h-3 w-24 rounded-full bg-rose-deep/10" />
                    <div className="h-3 w-16 rounded-full bg-rose-deep/10" />
                  </div>
                </div>
                <div className="mt-4 h-3 w-28 rounded-full bg-rose-deep/10" />
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded-full bg-rose-deep/10" />
                  <div className="h-3 w-full rounded-full bg-rose-deep/10" />
                  <div className="h-3 w-4/5 rounded-full bg-rose-deep/10" />
                </div>
              </div>
            )) : visibleReviews.length > 0 ? visibleReviews.map((review) => (
              <article key={`${review.authorName}-${review.publishTime}`} className="rounded-2xl border border-rose-deep/10 bg-white px-5 py-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <ReviewAvatar name={review.authorName} photoUrl={review.authorPhotoUrl} />
                  <div className="min-w-0">
                    {review.authorUrl ? (
                      <a href={review.authorUrl} target="_blank" rel="noreferrer" className="font-semibold text-gray-800 transition hover:text-rose-deep">
                        {review.authorName}
                      </a>
                    ) : (
                      <p className="font-semibold text-gray-800">{review.authorName}</p>
                    )}
                    <p className="text-xs uppercase tracking-[0.22em] text-gray-400">{formatReviewMeta(review)}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <RatingStars rating={review.rating} size="h-3.5 w-3.5" />
                  <span className="text-xs text-gray-400">{typeof review.rating === 'number' ? `${review.rating.toFixed(1)}/5` : ''}</span>
                </div>

                <p className="mt-4 text-sm leading-6 text-gray-600">
                  {review.text ? truncateReviewText(review.text) : 'A teljes velemeny a Google profilon olvashato.'}
                </p>
              </article>
            )) : (
              <div className="rounded-2xl border border-rose-deep/10 bg-white px-4 py-5 text-sm text-gray-600 md:col-span-2 xl:col-span-3">
                {reviewsError || 'A Google profilhoz meg nem erkezett megjelenitheto velemeny.'}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Visit Us */}
      <section id="visit" className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="motif-panel rounded-[32px] p-6">
            <SectionEyebrow>Latogatas</SectionEyebrow>
            <h3 className="text-2xl font-cormorant text-rose-deep mb-3">Latogass el az extremeruha szalonba</h3>
            <p className="text-gray-600 mb-5">
              Szalonunk a belvarosban var, privat probafulkekkel es szemelyes tanacsadassal.
            </p>

            <div className="mb-5 flex flex-wrap gap-3">
              <MotifBadge>Miskolc belvaros</MotifBadge>
              <MotifBadge>Privat probafulkek</MotifBadge>
            </div>

            <div className="space-y-3 text-gray-700">
              <p className="flex items-center gap-3"><IconShell><StarIcon /></IconShell><span><span className="font-semibold text-rose-deep">Uzlet:</span> extremeruha</span></p>
              <p className="flex items-center gap-3"><IconShell><PinIcon /></IconShell><span><span className="font-semibold text-rose-deep">Cim:</span> Munkacsy utca, 3530 Miskolc, Magyarorszag</span></p>
              <p className="flex items-center gap-3"><IconShell><PhoneIcon /></IconShell><span><span className="font-semibold text-rose-deep">Telefon:</span> +36 1 555 0137</span></p>
              <p className="flex items-center gap-3"><IconShell><MailIcon /></IconShell><span><span className="font-semibold text-rose-deep">Email:</span> hello@extremeruha.hu</span></p>
            </div>

            <div className="mt-5 border-t border-rose-deep/10 pt-4 text-sm text-gray-600">
              <p className="mb-3 flex items-center gap-3 font-semibold text-rose-deep"><IconShell><ClockIcon /></IconShell><span>Nyitvatartas</span></p>
              <p>Hetfo-Pentek: 10:00 - 19:00</p>
              <p>Szombat: 10:00 - 16:00</p>
              <p>Vasarnap: Elore egyeztetett idopontban</p>
            </div>
          </div>

          <div className="motif-panel overflow-hidden rounded-[32px] min-h-[360px]">
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
          <div>© {new Date().getFullYear()} extremeruha</div>
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
