import { useEffect, useMemo, useRef } from 'react'

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

export default function ProductCarousel({ products }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  // Repeat the list so users can keep scrolling manually without hitting a hard edge.
  const repeatedProducts = useMemo(() => {
    if (products.length === 0) return []
    return [...products, ...products, ...products]
  }, [products])

  if (products.length === 0) return null

  useEffect(() => {
    const container = scrollRef.current
    if (!container || products.length === 0) return
    const el = container

    function recenterToMiddleSet() {
      const setWidth = el.scrollWidth / 3
      if (setWidth <= 0) return
      el.scrollLeft = setWidth
      initializedRef.current = true
    }

    // Wait one frame so layout width is fully measured.
    const frame = requestAnimationFrame(recenterToMiddleSet)

    function handleScroll() {
      if (!initializedRef.current) return

      const setWidth = el.scrollWidth / 3
      if (setWidth <= 0) return

      const left = el.scrollLeft
      const threshold = setWidth * 0.25

      // Rebase scroll position back to the middle copy while preserving visual position.
      if (left < threshold) {
        el.scrollLeft = left + setWidth
      } else if (left > setWidth * 2 - threshold) {
        el.scrollLeft = left - setWidth
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', handleScroll)
      initializedRef.current = false
    }
  }, [products])

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <div className="flex gap-4 px-6">
        {repeatedProducts.map((product, index) => {
          const key = `${product._id ?? product.id ?? product.name}-${index}`
          return (
            <article
              key={key}
              aria-hidden={index < products.length || index >= products.length * 2 ? true : undefined}
              className="w-[220px] flex-shrink-0 rounded-2xl bg-white border border-rose-deep/10 overflow-hidden shadow-sm"
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
