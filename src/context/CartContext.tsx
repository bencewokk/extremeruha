import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { DressProduct } from '../data/products'

export interface CartItem extends DressProduct {
  quantity: number
  selectedSize: string
}

interface CartContextValue {
  items: CartItem[]
  addItem: (product: DressProduct, size: string) => void
  removeItem: (id: string) => void
  clearCart: () => void
  total: number
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = (product: DressProduct, size: string) => {
    setItems((current) => {
      const existing = current.find((item) => item.id === product.id && item.selectedSize === size)
      if (existing) {
        return current.map((item) =>
          item.id === product.id && item.selectedSize === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...current, { ...product, quantity: 1, selectedSize: size }]
    })
  }

  const removeItem = (id: string) => setItems((current) => current.filter((item) => item.id !== id))
  const clearCart = () => setItems([])

  const total = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items])

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, total }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
