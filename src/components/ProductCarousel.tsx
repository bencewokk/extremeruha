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
  if (products.length === 0) return null

  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {products.map((product) => {
          const key = product._id ?? product.id ?? product.name
          return (
            <article
              key={key}
              className="rounded-2xl bg-white border border-rose-deep/10 overflow-hidden shadow-sm"
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
