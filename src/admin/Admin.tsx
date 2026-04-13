import { useEffect, useState } from 'react'
import { clearAdminToken, getAdminToken, setAdminToken } from './auth'

type Product = {
  _id?: string
  name: string
  style: string
  image: string
}

export default function Admin() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [token, setToken] = useState(() => getAdminToken())
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [form, setForm] = useState<Product>({ name: '', style: '', image: '' })
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setItems([])
      return
    }

    fetch('/api/products')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setItems)
      .catch((err) => {
        console.error('Failed to load products', err)
        setItems([])
      })
  }, [token])

  function handleLogout(message?: string) {
    clearAdminToken()
    setToken('')
    setItems([])
    if (message) setAuthError(message)
  }

  async function readErrorMessage(res: Response, fallback: string) {
    try {
      const payload = await res.json()
      if (payload?.error) return payload.error
    } catch (error) {
      // Ignore JSON parse failures and keep fallback.
    }

    return fallback
  }

  async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
    if (!token) {
      throw new Error('A folytatashoz jelentkezz be.')
    }

    const headers = new Headers(init?.headers || {})
    headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(input, { ...init, headers })
    if (response.status === 401) {
      handleLogout('A munkamenet lejart. Kerlek jelentkezz be ujra.')
    }

    return response
  }

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
        setAuthError(payload?.error || 'Hibas bejelentkezesi adatok.')
        return
      }

      setAdminToken(payload.token)
      setToken(payload.token)
      setLoginForm({ username: '', password: '' })
    } catch (error) {
      setAuthError('A szerver jelenleg nem elerheto. Kerlek probald ujra.')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target as HTMLInputElement
    setForm((s) => ({ ...s, [name]: value }))
  }

  async function uploadFile(): Promise<string | null> {
    if (!file) return null
    const fd = new FormData()
    fd.append('file', file)
    const res = await adminFetch('/api/upload', { method: 'POST', body: fd })
    if (!res.ok) {
      const message = await readErrorMessage(res, 'A feltoltes nem sikerult')
      throw new Error(message)
    }
    const json = await res.json()
    return json.url
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      let image = form.image
      if (file) {
        const url = await uploadFile()
        if (url) image = url
      }

      if (!image.trim()) {
        throw new Error('A kep megadasa kotelezo')
      }

      const payload = {
        name: form.name.trim(),
        style: form.style.trim(),
        image: image.trim(),
      }

      const res = await adminFetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const message = await readErrorMessage(res, `A letrehozas nem sikerult: ${res.status} ${res.statusText}`)
        throw new Error(message)
      }
      const data = await res.json()
      setItems((it) => [data, ...it])
      setForm({ name: '', style: '', image: '' })
      setFile(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
      }
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'A termek letrehozasa nem sikerult')
    } finally {
      setLoading(false)
    }
  }

  async function remove(id?: string) {
    if (!id) return
    const res = await adminFetch(`/api/products/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const message = await readErrorMessage(res, 'A torles nem sikerult')
      alert(message)
      return
    }

    setItems((it) => it.filter((p) => p._id !== id))
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-ivory font-jost">
        <div className="mx-auto max-w-md px-6 py-16">
          <h1 className="text-3xl font-cormorant text-rose-deep mb-3">Admin bejelentkezes</h1>
          <p className="text-sm text-gray-600 mb-6">Jelentkezz be a termekkatalogus kezeleshez.</p>
          <form onSubmit={handleLogin} className="space-y-3 bg-white p-4 border rounded">
            <input
              name="username"
              value={loginForm.username}
              onChange={(e) => setLoginForm((s) => ({ ...s, username: e.target.value }))}
              placeholder="Felhasznalonev"
              className="w-full border p-2"
              autoComplete="username"
              required
            />
            <input
              name="password"
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
              placeholder="Jelszo"
              className="w-full border p-2"
              autoComplete="current-password"
              required
            />
            {authError ? <div className="text-sm text-red-600">{authError}</div> : null}
            <button type="submit" disabled={authLoading} className="w-full bg-rose-deep text-white py-2 rounded disabled:opacity-70">
              {authLoading ? 'Bejelentkezes...' : 'Bejelentkezes'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ivory font-jost">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-cormorant text-rose-deep">Admin - Termekek</h1>
          <button className="text-sm border rounded px-3 py-1 bg-white" onClick={() => handleLogout()}>
            Kijelentkezes
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it._id} className="p-3 bg-white border rounded flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-sm text-gray-500">{it.style}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-sm text-red-600" onClick={() => remove(it._id)}>Torles</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <aside>
            <form onSubmit={createProduct} className="space-y-3 bg-white p-4 border rounded">
              <input name="name" value={form.name} onChange={handleChange} placeholder="Nev" className="w-full border p-2" required />
              <input name="style" value={form.style} onChange={handleChange} placeholder="Stilus" className="w-full border p-2" required />
              <div>
                <label className="block text-sm mb-1">Kep</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files ? e.target.files[0] : null
                  setFile(f)
                  if (previewUrl) URL.revokeObjectURL(previewUrl)
                  setPreviewUrl(f ? URL.createObjectURL(f) : null)
                }} className="w-full" />
                {previewUrl && <img src={previewUrl} alt="Elozet" className="mt-2 max-h-40 w-full rounded object-contain" />}
                <div className="text-xs text-gray-500 mt-1">Vagy hagyd uresen, es hasznald az alatti kep URL mezot</div>
              </div>
              <input name="image" value={form.image} onChange={handleChange} placeholder="Vagy illeszd be a kep URL-t" className="w-full border p-2" />
              <button type="submit" disabled={loading} className="w-full bg-rose-deep text-white py-2 rounded">{loading ? 'Mentes…' : 'Letrehozas'}</button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  )
}
