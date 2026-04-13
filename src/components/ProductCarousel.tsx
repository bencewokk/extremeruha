import { useEffect, useRef } from 'react'

type Product = {
  _id?: string
  id?: string
  name: string
  style: string
  image: string
}

type Props = {
  products: Product[]
}

// Pixels per second for continuous left auto-scroll.
const SCROLL_SPEED = 60

export default function ProductCarousel({ products }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  // Current horizontal offset in pixels.
  const offsetRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)

  // We duplicate the list so the loop looks seamless
  const items = products.length > 0 ? [...products, ...products] : []

  // Width of a single set — computed once after mount
  const halfWidthRef = useRef(0)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    function measureHalfWidth() {
      if (!track) return
      halfWidthRef.current = track.scrollWidth / 2
    }

    measureHalfWidth()
    window.addEventListener('resize', measureHalfWidth)

    function tick(timestamp: number) {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp
      const delta = (timestamp - lastTimeRef.current) / 1000
      lastTimeRef.current = timestamp

      offsetRef.current += SCROLL_SPEED * delta

      const halfWidth = halfWidthRef.current
      if (halfWidth > 0 && offsetRef.current >= halfWidth) {
        // Wrap back to start seamlessly
        offsetRef.current -= halfWidth
      }

      if (track) {
        track.style.transform = `translateX(-${offsetRef.current}px)`
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', measureHalfWidth)
    }
  }, [products])

  if (products.length === 0) return null

  return (
    <div className="overflow-hidden">
      <div ref={trackRef} className="flex will-change-transform">
        {items.map((product, i) => {
          const key = `${product._id ?? product.id ?? product.name}-${i}`
          return (
            <article
              key={key}
              aria-hidden={i >= products.length}
              className="flex-shrink-0 w-64 mr-2 rounded-2xl bg-white border border-rose-deep/10 overflow-hidden shadow-sm"
            >
              <div className="aspect-[9/16] w-full overflow-hidden">
                <img
                  src={product.image}
                  alt={product.name}
                  draggable={false}
                  className="h-full w-full object-cover pointer-events-none"
                />
              </div>
              <div className="p-4">
                <h3 className="text-xl font-cormorant text-rose-deep">{product.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{product.style}</p>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
