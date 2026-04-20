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

type ReservationTypeId = 'ruhaproba' | 'kolcsonzesi-konzultacio' | 'vasarlasi-konzultacio'

type ReservationTypeConfig = {
  id: ReservationTypeId
  label: string
  durationMinutes: number
  heading: string
  description: string
  badges: [string, string, string]
  highlights: [string, string, string]
  notesPlaceholder: string
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

  const openHour = weekDay === 6 ? 9 : 10
  const closeHour = weekDay === 6 ? 13 : 17

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

const SEO_TITLE = 'extremeruha | Menyasszonyi ruhaszalon'
const SEO_DESCRIPTION = 'Extremeruha menyasszonyi ruhaszalon Miskolcon, a Metropolban: privát ruhapróba, kölcsönzés, értékesítés, igazítás és kiegészítők.'
const SITE_URL = 'https://extremeruha.hu'
const LOGO_URL = `${SITE_URL}/logo.png`
const FACEBOOK_URL = 'https://www.facebook.com/Menyasszonyi/?locale=hu_HU'
const BUSINESS_PHONE_E164 = '+36706138891'
const BUSINESS_PHONE_DISPLAY = '06 70 613 8891'
const BUSINESS_NAME = 'extremeruha'
const BUSINESS_CITY = 'Miskolc'
const BUSINESS_STREET_ADDRESS = 'Széchenyi u. 78, Metropol'
const BUSINESS_POSTAL_CODE = '3530'
const BUSINESS_REGION = 'Borsod-Abauj-Zemplen'
const DEFAULT_RESERVATION_TYPE: ReservationTypeId = 'ruhaproba'
const SLOT_STEP_MINUTES = 15
const RESERVATION_TYPES: Record<ReservationTypeId, ReservationTypeConfig> = {
  ruhaproba: {
    id: 'ruhaproba',
    label: 'Ruhapróba',
    durationMinutes: 90,
    heading: 'Ruhapróba 90 perces, privát időpontban',
    description: 'A ruhapróba 90 perces, előre foglalt, privát időpontban történik, ezért kérjük, pontosan érkezz.',
    badges: ['90 perces próba', 'Kényelmes cipő javasolt', 'Inspirációs képek hasznosak'],
    highlights: [
      'Érkezz pontosan a nyugodt, privát próbára.',
      'Hozz kényelmes cipőt és inspirációs képeket.',
      'Egy közeli hozzátartozó vagy barátnő elkísérhet.',
    ],
    notesPlaceholder: 'Megjegyzés (stílus, méret, egyéb)',
  },
  'kolcsonzesi-konzultacio': {
    id: 'kolcsonzesi-konzultacio',
    label: 'Kölcsönzési konzultáció',
    durationMinutes: 60,
    heading: 'Kölcsönzési konzultáció 60 perces időpontban',
    description: 'Átbeszéljük a kölcsönzési igényeket, a szóba jöhető modelleket és a nagy nap időzítését egy személyes konzultáción.',
    badges: ['60 perces konzultáció', 'Költségkeret egyeztetés', 'Elérhető modellek áttekintése'],
    highlights: [
      'Érkezz pontosan, hogy a teljes konzultáció rendelkezésedre álljon.',
      'Hasznos, ha hozol inspirációs képeket és az esküvő dátumát.',
      'A kölcsönzési lehetőségeket és a következő lépéseket együtt átbeszéljük.',
    ],
    notesPlaceholder: 'Megjegyzés (elképzelt fazon, dátum, költségkeret)',
  },
  'vasarlasi-konzultacio': {
    id: 'vasarlasi-konzultacio',
    label: 'Vásárlási konzultáció',
    durationMinutes: 60,
    heading: 'Vásárlási konzultáció 60 perces időpontban',
    description: 'Segítünk végignézni a megvásárolható ruhákat, a méret- és fazonválasztást, valamint az egyedi igényeket.',
    badges: ['60 perces konzultáció', 'Megvásárolható ruhák', 'Méret és fazon egyeztetés'],
    highlights: [
      'Érkezz pontosan, hogy legyen idő a modellek összehasonlítására.',
      'Inspirációs képek és elképzelt stílus nagy segítség a választásnál.',
      'A vásárlási opciókat és az igazítási lehetőségeket is átbeszéljük.',
    ],
    notesPlaceholder: 'Megjegyzés (kedvelt stílus, méret, fontos szempontok)',
  },
}
const RESERVATION_TYPE_ORDER: ReservationTypeId[] = [
  'ruhaproba',
  'kolcsonzesi-konzultacio',
  'vasarlasi-konzultacio',
]

function formatDurationMinutes(durationMinutes: number) {
  return `${durationMinutes} perces`
}

function ensureHeadTag(selector: string, createTag: () => HTMLElement) {
  const existing = document.head.querySelector<HTMLElement>(selector)
  if (existing) return existing

  const element = createTag()
  document.head.appendChild(element)
  return element
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

function SocialIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.25c-4.84 0-8.75 3.91-8.75 8.75s3.91 8.75 8.75 8.75 8.75-3.91 8.75-8.75S16.84 3.25 12 3.25Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 10.25h4m-3.25 3h2.5m-2.5-6h2.5" />
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
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    reservationType: DEFAULT_RESERVATION_TYPE as ReservationTypeId,
    startDateTime: '',
    notes: '',
  })
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
  const selectedReservationType = RESERVATION_TYPES[form.reservationType] || RESERVATION_TYPES[DEFAULT_RESERVATION_TYPE]

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
        setProductsError('A kollekció jelenleg nem elérhető.')
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
          throw new Error(payload?.error || 'Nem sikerült betölteni a Google véleményeket.')
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
        setReviewsError(error instanceof Error ? error.message : 'Nem sikerült betölteni a Google véleményeket.')
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
    return reviews.filter((review) => review.text.trim() && review.rating === 5).slice(0, 3)
  }, [reviews])

  const heroProduct = products[0]

  useEffect(() => {
    document.title = SEO_TITLE

    const canonicalHref = `${SITE_URL}/`

    const descriptionMeta = ensureHeadTag('meta[name="description"]', () => {
      const meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      return meta
    })
    descriptionMeta.setAttribute('content', SEO_DESCRIPTION)

    const robotsMeta = ensureHeadTag('meta[name="robots"]', () => {
      const meta = document.createElement('meta')
      meta.setAttribute('name', 'robots')
      return meta
    })
    robotsMeta.setAttribute('content', 'index, follow, max-image-preview:large')

    const canonicalLink = ensureHeadTag('link[rel="canonical"]', () => {
      const link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      return link
    }) as HTMLLinkElement
    canonicalLink.href = canonicalHref

    const jsonLdScript = ensureHeadTag('script[data-seo="local-business"]', () => {
      const script = document.createElement('script')
      script.setAttribute('type', 'application/ld+json')
      script.setAttribute('data-seo', 'local-business')
      return script
    }) as HTMLScriptElement

    const aggregateRating = reviewsPlace?.rating && reviewsPlace.userRatingCount
      ? {
          '@type': 'AggregateRating',
          ratingValue: reviewsPlace.rating,
          reviewCount: reviewsPlace.userRatingCount,
        }
      : undefined

    const reviewEntries = visibleReviews.map((review) => ({
      '@type': 'Review',
      author: {
        '@type': 'Person',
        name: review.authorName,
      },
      reviewBody: review.text,
      reviewRating: review.rating
        ? {
            '@type': 'Rating',
            ratingValue: review.rating,
            bestRating: 5,
          }
        : undefined,
      datePublished: review.publishTime || undefined,
    }))

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'BridalShop',
      name: reviewsPlace?.name || BUSINESS_NAME,
      description: SEO_DESCRIPTION,
      url: canonicalHref,
      telephone: BUSINESS_PHONE_E164,
      image: heroProduct?.image ? `${window.location.origin}${heroProduct.image}` : LOGO_URL,
      logo: LOGO_URL,
      address: {
        '@type': 'PostalAddress',
        streetAddress: BUSINESS_STREET_ADDRESS,
        postalCode: BUSINESS_POSTAL_CODE,
        addressLocality: BUSINESS_CITY,
        addressRegion: BUSINESS_REGION,
        addressCountry: 'HU',
      },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '10:00',
          closes: '17:00',
        },
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'Saturday',
          opens: '09:00',
          closes: '13:00',
        },
      ],
      hasMap: reviewsPlace?.googleMapsUri || undefined,
      sameAs: reviewsPlace?.googleMapsUri ? [FACEBOOK_URL, reviewsPlace.googleMapsUri] : [FACEBOOK_URL],
      makesOffer: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Menyasszonyi ruha kölcsönzés Miskolc',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Menyasszonyi ruha értékesítés Miskolc',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Menyasszonyi ruha igazítás és méretre készítés Miskolc',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Menyasszonyi kiegészítők Miskolc',
          },
        },
      ],
      aggregateRating,
      review: reviewEntries.length > 0 ? reviewEntries : undefined,
    }

    jsonLdScript.textContent = JSON.stringify(schema)
  }, [heroProduct?.image, reviewsPlace, visibleReviews])

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((s) => ({ ...s, [e.target.name]: e.target.value }))
  }

  async function loadAvailabilityForDate(dateValue: string, preferredSlot = '', reservationTypeId = form.reservationType) {
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
        reservationType: reservationTypeId,
      })

      const response = await fetch(`/api/bookings/availability?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.error || 'Nem sikerült betölteni az időpontokat')
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
      setAvailabilityError(error instanceof Error ? error.message : 'Nem sikerült betölteni az időpontokat')
      setForm((s) => ({ ...s, startDateTime: '' }))
    } finally {
      setLoadingAvailability(false)
    }
  }

  useEffect(() => {
    loadAvailabilityForDate(selectedDate, form.startDateTime, form.reservationType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, form.reservationType])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBookingError('')
    setBookingMessage('')

    if (!form.name || !form.email || !form.phone || !form.startDateTime) {
      setBookingError('Kérlek add meg a nevedet, email-címedet, telefonszámodat és válassz időpontot.')
      return
    }

    const start = new Date(form.startDateTime)
    if (Number.isNaN(start.getTime())) {
      setBookingError('Érvénytelen időpont.')
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
          reservationType: form.reservationType,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        if (payload?.fallbackUrl) {
          window.open(payload.fallbackUrl, '_blank')
          setBookingMessage('A naptár API most nem elérhető, ezért egy előre kitöltött Google Naptár oldalt nyitottunk meg.')
          return
        }

        setBookingError(payload?.error || 'A foglalás most nem sikerült. Kérlek próbáld újra.')
        return
      }

      const successUrl = new URL('/sikeres-foglalas.html', window.location.origin)
      successUrl.searchParams.set('name', form.name)
      successUrl.searchParams.set('slot', form.startDateTime)
      successUrl.searchParams.set('reservationType', payload?.reservationType || form.reservationType)
      if (payload?.eventLink) {
        successUrl.searchParams.set('eventLink', payload.eventLink)
      }
      window.location.assign(`${successUrl.pathname}${successUrl.search}`)
      return
    } catch (error) {
      console.error('Booking request failed', error)
      setBookingError('Nem sikerült kapcsolódni a foglalási szolgáltatáshoz. Kérlek próbáld újra.')
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
              <a className="hover:text-rose-deep" href="#collection">Kollekció</a>
              <a className="hover:text-rose-deep" href="#services">Szolgáltatások</a>
              <a className="hover:text-rose-deep" href="#booking">Időpontfoglalás</a>
              <a className="hover:text-rose-deep" href="#visit">Látogatás</a>
              <a className="hover:text-rose-deep" href="#contact">Kapcsolat</a>
              {isAdminLoggedIn ? <a className="hover:text-rose-deep" href="/admin">Admin</a> : null}
            </div>
          </div>
          <div>
            <a href="#booking" className="inline-flex items-center rounded-full bg-rose-deep px-4 py-2 text-white text-sm font-semibold shadow">Időpontfoglalás</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto max-w-6xl px-6 py-12">
        <div className="motif-panel rounded-[32px] p-6 lg:p-8">
          <SectionEyebrow>Rólam</SectionEyebrow>
          <h1 className="text-5xl leading-tight font-cormorant text-rose-deep mb-4">13 éves korom óta szabok, varrok és tervezek</h1>
          <p className="text-lg text-gray-600 mb-4">
            A szakma szeretetét dédimtől tanultam. Munkám a hobbim, ezért örömmel segítek megvalósítani álmaid ruháját, akár saját elképzelés, akár közös tervezés alapján.
          </p>
          <p className="text-lg text-gray-600 mb-6">
            25 éve működő üzletünkben tapasztalt szakértőkkel, szeretettel várunk ruhapróbára, hogy a nagy napon igazán különleges lehess.
          </p>
          <div className="mb-8 flex flex-wrap gap-3">
            <MotifBadge>25 éve működő üzlet</MotifBadge>
            <MotifBadge>Személyes tervezés</MotifBadge>
            <MotifBadge>Privát ruhapróba</MotifBadge>
          </div>
          <div className="flex flex-wrap gap-4">
            <a href="#collection" className="rounded-full border border-rose-deep px-6 py-3 text-rose-deep font-semibold">Kollekció megnézése</a>
            <a href="#booking" className="rounded-full bg-rose-deep px-6 py-3 text-white font-semibold">Időpont foglalása</a>
          </div>
        </div>
      </header>

      {/* Collection Grid */}
      <section id="collection" className="pb-12">
        <div className="mx-auto max-w-6xl px-6 mb-6">
          <SectionEyebrow>Válogatott darabok</SectionEyebrow>
          <h2 className="text-3xl font-cormorant text-rose-deep">A Kollekció</h2>
          {availableTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTags([])}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${activeTags.length === 0 ? 'border-rose-deep bg-rose-deep text-white' : 'border-rose-deep/30 bg-white text-rose-deep'}`}
              >
                Összes
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
            <div className="rounded-2xl border border-rose-deep/10 bg-white p-6 text-gray-500">Kollekció betöltése…</div>
          </div>
        ) : filteredProducts.length > 0 ? (
          <ProductCarousel products={filteredProducts} />
        ) : (
          <div className="mx-auto max-w-6xl px-6">
            <div className="motif-panel rounded-[28px] p-6 text-gray-500">
              {products.length > 0 ? 'Nincs a kijelölt címkéknek megfelelő ruha.' : 'Még nincs feltöltött ruha. Add hozzá az Admin felületen.'}
            </div>
          </div>
        )}
      </section>

      {/* Booking Banner */}
      <section id="booking" className="mx-auto max-w-6xl px-6 py-12">
        <div className="motif-panel grid grid-cols-1 lg:grid-cols-2 gap-6 items-center rounded-[32px] p-6 lg:p-8">
          <div>
            <SectionEyebrow>Foglalási tájékoztatás</SectionEyebrow>
            <h3 className="text-2xl font-cormorant text-rose-deep mb-3">{selectedReservationType.heading}</h3>
            <p className="text-gray-600">{selectedReservationType.description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {selectedReservationType.badges.map((badge) => (
                <MotifBadge key={badge}>{badge}</MotifBadge>
              ))}
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-deep/10 bg-white/70 px-4 py-3 text-sm text-gray-600">
                <div className="mb-2 flex items-center gap-2 text-rose-deep">
                  <IconShell><ClockIcon /></IconShell>
                </div>
                {selectedReservationType.highlights[0]}
              </div>
              <div className="rounded-2xl border border-rose-deep/10 bg-white/70 px-4 py-3 text-sm text-gray-600">
                <div className="mb-2 flex items-center gap-2 text-rose-deep">
                  <IconShell><CalendarIcon /></IconShell>
                </div>
                {selectedReservationType.highlights[1]}
              </div>
              <div className="rounded-2xl border border-rose-deep/10 bg-white/70 px-4 py-3 text-sm text-gray-600">
                <div className="mb-2 flex items-center gap-2 text-rose-deep">
                  <IconShell><StarIcon /></IconShell>
                </div>
                {selectedReservationType.highlights[2]}
              </div>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm text-gray-700 mb-2">Foglalás típusa</label>
              <div className="flex flex-wrap gap-2">
                {RESERVATION_TYPE_ORDER.map((reservationTypeId) => {
                  const reservationType = RESERVATION_TYPES[reservationTypeId]
                  const active = form.reservationType === reservationTypeId

                  return (
                    <button
                      key={reservationType.id}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, reservationType: reservationType.id, startDateTime: '' }))}
                      className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${active ? 'border-rose-deep bg-rose-deep text-white' : 'border-rose-deep/30 bg-white text-rose-deep'}`}
                    >
                      {reservationType.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input name="name" value={form.name} onChange={handleChange} placeholder="Teljes név" className="elegant-field" required />
              <input name="email" value={form.email} onChange={handleChange} placeholder="Email-cím" className="elegant-field" required />
            </div>
            <div>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                type="tel"
                placeholder="Telefonszám"
                className="elegant-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Dátum választása</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="elegant-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Elérhető kezdési időpontok</label>
              {loadingAvailability ? (
                <p className="text-sm text-gray-500">Szabad időpontok betöltése...</p>
              ) : availabilityError ? (
                <p className="text-sm text-red-600">{availabilityError}</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-gray-500">Erre a napra nincs szabad időpont.</p>
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
              <p className="mt-2 text-xs text-gray-500">Az időpontok a Google Naptárból érkeznek. A kiválasztott foglalás {formatDurationMinutes(selectedReservationType.durationMinutes)}, és {SLOT_STEP_MINUTES} percenként indulhat.</p>
            </div>
            <div>
              <textarea name="notes" value={form.notes} onChange={handleChange} placeholder={selectedReservationType.notesPlaceholder} className="elegant-field h-24 resize-y" />
            </div>
            {bookingError ? <p className="text-sm text-red-600">{bookingError}</p> : null}
            {bookingMessage ? <p className="text-sm text-green-700">{bookingMessage}</p> : null}
            <div className="flex justify-end">
              <button type="submit" disabled={submittingBooking || !form.startDateTime} className="rounded-full bg-rose-deep px-6 py-2 text-white font-semibold disabled:opacity-60">{submittingBooking ? 'Foglalás folyamatban…' : 'Időpont foglalása'}</button>
            </div>
            <p className="border-t border-rose-deep/10 pt-3 text-xs uppercase tracking-[0.22em] text-gray-500">
              {selectedReservationType.label} • Google visszaigazolás • 5 csillagos élmény
            </p>
          </form>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl px-6 py-4">
        <div className="motif-panel rounded-[32px] p-6 lg:p-8">
          <SectionEyebrow>Szolgáltatások</SectionEyebrow>
          <h2 className="text-3xl font-cormorant text-rose-deep">Miben segítünk neked</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">
            Igazítás, javítás, kölcsönzés, méretre készítés és vásárlás egy helyen, személyes segítséggel.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-2xl border border-rose-deep/10 bg-white/80 px-5 py-5 shadow-sm">
              <h3 className="text-xl font-cormorant text-rose-deep">Varroda</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">Igazítás, javítás, zipzár csere, nadrág felhajtás és szűkítés gyorsan és precízen.</p>
            </article>
            <article className="rounded-2xl border border-rose-deep/10 bg-white/80 px-5 py-5 shadow-sm">
              <h3 className="text-xl font-cormorant text-rose-deep">Kölcsönzés</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">Menyasszonyi ruháink frissen tisztítva, méretre igazítva kölcsönözhetők a nagy napra.</p>
            </article>
            <article className="rounded-2xl border border-rose-deep/10 bg-white/80 px-5 py-5 shadow-sm">
              <h3 className="text-xl font-cormorant text-rose-deep">Méretre készítés</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">Hozott vagy nálunk választott anyagból, egyedi méretre készítjük el álmaid ruháját.</p>
            </article>
            <article className="rounded-2xl border border-rose-deep/10 bg-white/80 px-5 py-5 shadow-sm">
              <h3 className="text-xl font-cormorant text-rose-deep">Igazítások</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">A kiválasztott ruha méretét és fazonját tökéletesen rád igazítjuk.</p>
            </article>
            <article className="rounded-2xl border border-rose-deep/10 bg-white/80 px-5 py-5 shadow-sm">
              <h3 className="text-xl font-cormorant text-rose-deep">Vásárlás</h3>
              <p className="mt-3 text-sm leading-7 text-gray-600">Menyasszonyi, menyecske, örömanya és koszorúslány ruhák széles választékban, kiegészítőkkel.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-4">
        <div className="grid gap-4 rounded-[32px] border border-rose-deep/10 bg-white/70 p-6 backdrop-blur lg:grid-cols-[0.95fr,1.25fr]">
          <div>
            <SectionEyebrow>Google vélemények</SectionEyebrow>
            <h3 className="text-2xl font-cormorant text-rose-deep">Valós visszajelzések a Google-ból</h3>
            <p className="mt-2 max-w-xl text-gray-600">A szalon értékeléseit és vendégvéleményeit közvetlenül a Google helyadatlapról töltjük be.</p>

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
                    <p className="mt-2 text-sm text-gray-600">{reviewsPlace.userRatingCount.toLocaleString('hu-HU')} Google értékelés</p>
                    <p className="mt-1 text-sm text-gray-500">{reviewsPlace.name || 'extremeruha'}</p>
                  </div>
                </div>

                {reviewsPlace.address ? <p className="mt-4 max-w-md text-sm text-gray-500">{reviewsPlace.address}</p> : null}
                {reviewsStale ? <p className="mt-3 text-xs uppercase tracking-[0.22em] text-gray-400">Átmenetileg gyorsítótárazott értékelések</p> : null}
                {reviewsPlace.googleMapsUri ? (
                  <p className="mt-5 text-sm text-gray-500">A teljes Google profil elérhető a cég hivatalos csatornáin.</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-rose-deep/10 bg-white px-4 py-4 text-sm text-gray-600">
                {reviewsError || 'A Google review kapcsolat hamarosan elérhető.'}
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
                    <p className="font-semibold text-gray-800">{review.authorName}</p>
                    <p className="text-xs uppercase tracking-[0.22em] text-gray-400">{formatReviewMeta(review)}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <RatingStars rating={review.rating} size="h-3.5 w-3.5" />
                  <span className="text-xs text-gray-400">{typeof review.rating === 'number' ? `${review.rating.toFixed(1)}/5` : ''}</span>
                </div>

                <p className="mt-4 text-sm leading-6 text-gray-600">
                  {review.text ? truncateReviewText(review.text) : 'A teljes vélemény a Google profilon olvasható.'}
                </p>
              </article>
            )) : (
              <div className="rounded-2xl border border-rose-deep/10 bg-white px-4 py-5 text-sm text-gray-600 md:col-span-2 xl:col-span-3">
                {reviewsError || 'A Google profilhoz még nem érkezett megjeleníthető vélemény.'}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Visit Us */}
      <section id="visit" className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="motif-panel rounded-[32px] p-6">
            <SectionEyebrow>Látogatás</SectionEyebrow>
            <h3 className="text-2xl font-cormorant text-rose-deep mb-3">Látogass el az extremeruha szalonba</h3>
            <p className="text-gray-600 mb-5">
              Szalonunk a Metropolban vár, privát próbafülkékkel, személyes tanácsadással és teljes szolgáltatási körrel.
            </p>

            <div className="mb-5 flex flex-wrap gap-3">
              <MotifBadge>Metropol, Széchenyi u. 78</MotifBadge>
              <MotifBadge>Privát próbafülkék</MotifBadge>
            </div>

            <div className="space-y-3 text-gray-700">
              <p className="flex items-center gap-3"><IconShell><StarIcon /></IconShell><span><span className="font-semibold text-rose-deep">Üzlet:</span> extremeruha</span></p>
              <p className="flex items-center gap-3"><IconShell><PinIcon /></IconShell><span><span className="font-semibold text-rose-deep">Cím:</span> Metropol, Széchenyi u. 78, 3530 Miskolc</span></p>
              <p className="flex items-center gap-3"><IconShell><PhoneIcon /></IconShell><span><span className="font-semibold text-rose-deep">Telefon:</span> {BUSINESS_PHONE_DISPLAY}</span></p>
              <p className="flex items-center gap-3"><IconShell><SocialIcon /></IconShell><span><span className="font-semibold text-rose-deep">Facebook:</span> Menyasszonyi</span></p>
            </div>

            <div className="mt-5 border-t border-rose-deep/10 pt-4 text-sm text-gray-600">
              <p className="mb-3 flex items-center gap-3 font-semibold text-rose-deep"><IconShell><ClockIcon /></IconShell><span>Nyitvatartás</span></p>
              <p>Hétfő-Péntek: 10:00 - 17:00</p>
              <p>Szombat: 09:00 - 13:00</p>
              <p>Vasárnap: Zárva</p>
            </div>
          </div>

          <div className="motif-panel overflow-hidden rounded-[32px] min-h-[360px]">
            <iframe
              title="extremeruha a Google Maps-en"
              src="https://www.google.com/maps?q=Metropol+Sz%C3%A9chenyi+u.+78+Miskolc+3530&output=embed"
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
            <a href="/kollekcio.html" className="hover:text-rose-deep">Kollekció</a>
            <a href="/ruhaproba.html" className="hover:text-rose-deep">Ruhapróba</a>
            <a href="/kolcsonzes.html" className="hover:text-rose-deep">Kölcsönzés</a>
            <a href="/ertekesites.html" className="hover:text-rose-deep">Értékesítés</a>
            <a href="/igazitas.html" className="hover:text-rose-deep">Igazítás</a>
            <a href="/kiegeszitok.html" className="hover:text-rose-deep">Kiegészítők</a>
            <a href="/kapcsolat.html" className="hover:text-rose-deep">Kapcsolat</a>
            <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" className="hover:text-rose-deep">Facebook</a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 mt-2 text-xs text-gray-400">
          Build: {new Date(__BUILD_TIME__).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} &middot; {__GIT_HASH__}
        </div>
      </footer>
    </div>
  )
}
