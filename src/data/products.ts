export interface DressProduct {
  id: string
  name: string
  style: string
  image: string
}

export const dresses: DressProduct[] = [
  {
    id: 'bliss-ivory',
    name: 'Bliss Ivory Lace A-Line',
    style: 'A-Line',
    image: 'https://images.unsplash.com/photo-1599138819555-d47be6fb04c1?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'radiance-mermaid',
    name: 'Radiance Mermaid Satin',
    style: 'Mermaid',
    image: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'garden-romance',
    name: 'Garden Romance Boho',
    style: 'Boho',
    image: 'https://images.unsplash.com/photo-1525219047891-2ecc3a9f1719?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'classic-ballgown',
    name: 'Classic Ballgown Pearl',
    style: 'Ballgown',
    image: 'https://images.unsplash.com/photo-1542201275-3db67f8d0e07?auto=format&fit=crop&w=1200&q=80'
  }
]
