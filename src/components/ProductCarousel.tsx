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

function buildProductAltText(product: Product) {
  const styleLabel = product.style.trim() || 'menyasszonyi ruha'
  return `${product.name} - ${styleLabel} menyasszonyi ruha az extremeruha miskolci szalonjabol`
}

export default function ProductCarousel({ products }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartScrollLeftRef = useRef(0)

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

  useEffect(() => {
    function handleWindowMouseUp() {
      isDraggingRef.current = false
    }

    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [])

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const el = scrollRef.current
    if (!el) return

    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartScrollLeftRef.current = el.scrollLeft
    e.preventDefault()
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return
    const el = scrollRef.current
    if (!el) return

    const delta = e.clientX - dragStartXRef.current
    el.scrollLeft = dragStartScrollLeftRef.current - delta
    e.preventDefault()
  }

  function handleMouseUpOrLeave() {
    isDraggingRef.current = false
  }

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar overflow-x-auto cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
    >
      <div className="flex gap-4 px-6">
        {repeatedProducts.map((product, index) => {
          const key = `${product._id ?? product.id ?? product.name}-${index}`
          return (
            <article
              key={key}
              aria-hidden={index < products.length || index >= products.length * 2 ? true : undefined}
              className="motif-panel group w-[220px] flex-shrink-0 rounded-[28px] overflow-hidden shadow-sm transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="h-1 bg-gradient-to-r from-transparent via-rose-deep/35 to-transparent" />
              <div className="relative aspect-[9/16] w-full overflow-hidden">
                <img
                  src={product.image}
                  alt={buildProductAltText(product)}
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-[1.02]"
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/45 to-transparent" />
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
