import { useCallback, useEffect, useState } from 'react'
import { clearAdminToken, getAdminToken, setAdminToken } from './auth'
import { CloudinarySettings, GoogleCalendarSettings } from './IntegrationSettings'
import ReservationTypesSettings from './ReservationTypesSettings'
import BookingScheduleSettings from './BookingScheduleSettings'
import ProductsManager from './ProductsManager'

type AdminTab = 'products' | 'reservations' | 'cloudinary' | 'google'

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'products', label: 'Termékek' },
  { id: 'reservations', label: 'Foglalások' },
  { id: 'cloudinary', label: 'Képtárhely' },
  { id: 'google', label: 'Google Naptár' },
]

function readInitialAdminState() {
  if (typeof window === 'undefined') return { tab: 'products' as AdminTab, googleNotice: null }
  const params = new URLSearchParams(window.location.search)
  const tabParam = params.get('tab')
  const tab: AdminTab = tabParam === 'cloudinary' || tabParam === 'google' || tabParam === 'reservations' ? tabParam : 'products'
  const googleStatus = params.get('google')
  const googleNotice = googleStatus === 'connected'
    ? { kind: 'ok' as const, text: 'A Google-fiók csatlakoztatva. Kattints a „Kapcsolat tesztelése” gombra az ellenőrzéshez.' }
    : googleStatus === 'error'
      ? { kind: 'error' as const, text: `A csatlakoztatás nem sikerült: ${params.get('message') || 'ismeretlen hiba'}` }
      : null

  return { tab, googleNotice }
}

export default function Admin() {
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [token, setToken] = useState(() => getAdminToken())
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [initialState] = useState(readInitialAdminState)
  const [tab, setTab] = useState<AdminTab>(initialState.tab)

  useEffect(() => {
    // Drop ?tab=…&google=… (set by the Google OAuth callback) once it has been read.
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  function handleLogout(message?: string) {
    clearAdminToken()
    setToken('')
    if (message) setAuthError(message)
  }

  const adminFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!token) {
      throw new Error('A folytatáshoz jelentkezz be.')
    }

    const headers = new Headers(init?.headers || {})
    headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(input, { ...init, headers })
    if (response.status === 401) {
      handleLogout('A munkamenet lejárt. Kérlek jelentkezz be újra.')
    }

    return response
  }, [token])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginForm.username.trim(),
          password: loginForm.password,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok || !payload?.token) {
        setAuthError(payload?.error || 'Hibás bejelentkezési adatok.')
        return
      }

      setAdminToken(payload.token)
      setToken(payload.token)
      setLoginForm({ username: '', password: '' })
    } catch (error) {
      setAuthError('A szerver jelenleg nem elérhető. Kérlek próbáld újra.')
    } finally {
      setAuthLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-ivory font-jost">
        <div className="mx-auto max-w-md px-6 py-16">
          <h1 className="text-3xl font-cormorant text-rose-deep mb-3">Admin bejelentkezés</h1>
          <p className="text-sm text-gray-600 mb-6">Jelentkezz be a weboldal kezeléséhez.</p>
          <form onSubmit={handleLogin} className="space-y-3 bg-white p-4 border rounded">
            <input
              name="username"
              value={loginForm.username}
              onChange={(e) => setLoginForm((s) => ({ ...s, username: e.target.value }))}
              placeholder="Felhasználónév"
              className="w-full border p-2"
              autoComplete="username"
              required
            />
            <input
              name="password"
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
              placeholder="Jelszó"
              className="w-full border p-2"
              autoComplete="current-password"
              required
            />
            {authError ? <div className="text-sm text-red-600">{authError}</div> : null}
            <button type="submit" disabled={authLoading} className="w-full bg-rose-deep text-white py-2 rounded disabled:opacity-70">
              {authLoading ? 'Bejelentkezés...' : 'Bejelentkezés'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ivory font-jost">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-cormorant text-rose-deep">Admin</h1>
          <button className="text-sm border rounded px-3 py-1 bg-white" onClick={() => handleLogout()}>
            Kijelentkezés
          </button>
        </div>
        <nav className="mb-6 flex flex-wrap gap-2">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-rose-deep text-white' : 'border border-rose-deep/20 bg-white text-rose-deep'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'reservations' ? (
          <div className="space-y-8">
            <BookingScheduleSettings adminFetch={adminFetch} />
            <ReservationTypesSettings adminFetch={adminFetch} />
          </div>
        ) : null}
        {tab === 'cloudinary' ? <CloudinarySettings adminFetch={adminFetch} /> : null}
        {tab === 'google' ? <GoogleCalendarSettings adminFetch={adminFetch} initialNotice={initialState.googleNotice} /> : null}
        {/* Kept mounted so a half-edited dress survives switching tabs. */}
        <div hidden={tab !== 'products'}>
          <ProductsManager adminFetch={adminFetch} />
        </div>
      </div>
    </div>
  )
}
