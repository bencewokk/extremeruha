declare const __BUILD_TIME__: string
declare const __GIT_HASH__: string

export default function Footer() {
  const buildDate = new Date(__BUILD_TIME__).toLocaleString('hu-HU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <footer className="bg-pink-50 border-t border-pink-100 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-600">
        <p>© {new Date().getFullYear()} Bridal Bloom. All rights reserved.</p>
        <p>Wedding dress showroom - sample site for Render deployment.</p>
        <p className="mt-2 text-xs text-gray-400">
          Build: {buildDate} &middot; {__GIT_HASH__}
        </p>
      </div>
    </footer>
  )
}
