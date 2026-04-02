export default function Footer() {
  return (
    <footer className="bg-pink-50 border-t border-pink-100 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-600">
        <p>© {new Date().getFullYear()} Bridal Bloom. All rights reserved.</p>
        <p>Wedding dress showroom - sample site for Render deployment.</p>
      </div>
    </footer>
  )
}
