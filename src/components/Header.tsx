import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'

export default function Header() {
  const { items } = useCart()
  const count = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <header className="bg-white shadow sticky top-0 z-20">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <Link to="/" className="text-2xl font-bold text-pink-700">
          Bridal Bloom
        </Link>
        <nav className="space-x-4">
          <Link to="/catalog" className="text-gray-700 hover:text-pink-600">
            Catalog
          </Link>
          <Link to="/contact" className="text-gray-700 hover:text-pink-600">
            Contact
          </Link>
          <Link to="/cart" className="text-gray-700 hover:text-pink-600 relative">
            Cart
            <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-pink-600 text-xs font-semibold text-white">
              {count}
            </span>
          </Link>
        </nav>
      </div>
    </header>
  )
}
