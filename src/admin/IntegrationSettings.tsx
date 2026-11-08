import { useEffect, useState } from 'react'

type AdminFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type SettingsPayload = {
  cloudinary: {
    cloudName: string
    apiKey: string
    apiSecretMasked: string
    hasApiSecret: boolean
    updatedAt: string | null
    activeSource: 'admin' | 'env' | null
    activeCloudName: string | null
  }
  google: {
    clientId: string
    clientSecretMasked: string
    hasClientSecret: boolean
    connected: boolean
    connectedEmail: string
    connectedAt: string | null
    calendarId: string
    timeZone: string
    updatedAt: string | null
    redirectUri: string
    activeSource: 'admin' | 'env' | null
  }
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

async function readError(res: Response, fallback: string) {
  try {
    const payload = await res.json()
    if (payload?.error) return String(payload.error)
  } catch {
    // keep fallback
  }
  return fallback
}

function useSettings(adminFetch: AdminFetch) {
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    adminFetch('/api/admin/settings')
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'A beállítások nem tölthetők be.'))
        return res.json()
      })
      .then((data) => { if (!cancelled) setSettings(data) })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [adminFetch])

  return { settings, setSettings, loadError }
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null
  const cls = notice.kind === 'ok'
    ? 'border-green-300 bg-green-50 text-green-800'
    : 'border-red-300 bg-red-50 text-red-700'
  return <div className={`rounded border px-3 py-2 text-sm ${cls}`}>{notice.text}</div>
}

function SourceBadge({ source, label }: { source: 'admin' | 'env' | null; label?: string }) {
  if (source === 'admin') {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">Aktív: saját fiók{label ? ` (${label})` : ''}</span>
  }
  if (source === 'env') {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Aktív: régi szerverbeállítás (.env){label ? ` (${label})` : ''}</span>
  }
  return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Nincs beállítva</span>
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-rose-deep text-xs font-semibold text-white">{n}</span>
      <div className="text-sm leading-6 text-gray-700">{children}</div>
    </li>
  )
}

function Tutorial({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded border bg-white p-4" open>
      <summary className="cursor-pointer font-semibold text-rose-deep">{title}</summary>
      <ol className="mt-4 space-y-3">{children}</ol>
    </details>
  )
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-rose-deep underline">{children}</a>
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-1 flex gap-2">
      <input readOnly value={value} className="w-full border bg-gray-50 p-2 font-mono text-xs" onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="rounded border bg-white px-3 text-xs"
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }).catch(() => {})
        }}
      >
        {copied ? 'Másolva' : 'Másolás'}
      </button>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('hu-HU')
}

// ---------------------------------------------------------------------------

export function CloudinarySettings({ adminFetch }: { adminFetch: AdminFetch }) {
  const { settings, setSettings, loadError } = useSettings(adminFetch)
  const [form, setForm] = useState({ cloudName: '', apiKey: '', apiSecret: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    if (!settings) return
    setForm({ cloudName: settings.cloudinary.cloudName, apiKey: settings.cloudinary.apiKey, apiSecret: '' })
  }, [settings])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/settings/cloudinary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await readError(res, 'A mentés nem sikerült.'))
      setSettings(await res.json())
      setNotice({ kind: 'ok', text: 'Elmentve és ellenőrizve. Az új képek mostantól a saját Cloudinary fiókodba kerülnek.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/settings/cloudinary/test', { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'A teszt nem sikerült.'))
      const payload = await res.json()
      setNotice({ kind: 'ok', text: payload.message })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <NoticeBox notice={{ kind: 'error', text: loadError }} />
  if (!settings) return <div className="text-sm text-gray-500">Betöltés…</div>

  const c = settings.cloudinary

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded border bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-cormorant text-rose-deep">Képtárhely (Cloudinary)</h2>
            <SourceBadge source={c.activeSource} label={c.activeCloudName || undefined} />
          </div>
          <p className="mb-4 text-sm text-gray-600">
            Ide kerülnek a termékképek, amiket az adminban feltöltesz. Írd be a saját Cloudinary fiókod adatait — mentéskor a rendszer azonnal ellenőrzi, hogy jók-e.
          </p>
          <form onSubmit={save} className="space-y-3">
            <label className="block text-sm">
              Cloud name
              <input value={form.cloudName} onChange={(e) => setForm((s) => ({ ...s, cloudName: e.target.value }))} className="mt-1 w-full border p-2" placeholder="pl. dxyz123ab" required />
            </label>
            <label className="block text-sm">
              API Key
              <input value={form.apiKey} onChange={(e) => setForm((s) => ({ ...s, apiKey: e.target.value }))} className="mt-1 w-full border p-2" placeholder="pl. 123456789012345" required />
            </label>
            <label className="block text-sm">
              API Secret
              <input
                type="password"
                value={form.apiSecret}
                onChange={(e) => setForm((s) => ({ ...s, apiSecret: e.target.value }))}
                className="mt-1 w-full border p-2"
                placeholder={c.hasApiSecret ? `Elmentve (${c.apiSecretMasked}) — hagyd üresen, ha nem változik` : 'API Secret'}
                required={!c.hasApiSecret}
                autoComplete="off"
              />
            </label>
            <NoticeBox notice={notice} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="rounded bg-rose-deep px-4 py-2 text-white disabled:opacity-60">{busy ? 'Folyamatban…' : 'Mentés és ellenőrzés'}</button>
              <button type="button" disabled={busy} onClick={test} className="rounded border bg-white px-4 py-2 disabled:opacity-60">Kapcsolat tesztelése</button>
            </div>
            {c.updatedAt ? <div className="text-xs text-gray-500">Utoljára mentve: {formatDate(c.updatedAt)}</div> : null}
          </form>
        </div>
      </div>

      <Tutorial title="Útmutató: így szerzed meg a Cloudinary adatokat">
        <Step n={1}>
          Menj a <ExtLink href="https://cloudinary.com/users/register_free">cloudinary.com</ExtLink> oldalra, és regisztrálj egy <b>ingyenes</b> fiókot (a Free csomag bőven elég a szalon képeihez). Lehet Google-fiókkal is.
        </Step>
        <Step n={2}>
          Ha a regisztráció kérdez valamit (pl. mire használod), bármit választhatsz — ez nem befolyásolja a működést.
        </Step>
        <Step n={3}>
          Bejelentkezés után nyisd meg a <ExtLink href="https://console.cloudinary.com/settings/api-keys">Settings → API Keys</ExtLink> oldalt (bal alul a fogaskerék ikon, majd <b>API Keys</b>).
        </Step>
        <Step n={4}>
          Az oldal tetején látod a <b>Cloud name</b>-et (pl. <code>dxyz123ab</code>). Lent a táblázatban van az <b>API Key</b> (számsor) és az <b>API Secret</b> — ez utóbbit a szem ikonnal tudod megjeleníteni.
        </Step>
        <Step n={5}>
          Másold be mindhármat a bal oldali mezőkbe, és kattints a <b>Mentés és ellenőrzés</b> gombra. Ha zöld üzenetet kapsz, kész is vagy.
        </Step>
        <Step n={6}>
          Próbáld ki: a <b>Termékek</b> fülön tölts fel egy új ruhát képpel. A kép meg fog jelenni a Cloudinary fiókodban a <b>Media Library → extremeruha</b> mappában.
        </Step>
        <li className="rounded bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <b>Fontos:</b> a korábban feltöltött képek a régi fiókban vannak. Amíg az létezik, továbbra is látszanak, de érdemes a meglévő ruhákat egyszer újra feltölteni (törlés, majd újra létrehozás), hogy minden a saját fiókodban legyen. Az API Secretet senkivel ne oszd meg.
        </li>
      </Tutorial>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function GoogleCalendarSettings({ adminFetch, initialNotice }: { adminFetch: AdminFetch; initialNotice?: Notice }) {
  const { settings, setSettings, loadError } = useSettings(adminFetch)
  const [form, setForm] = useState({ clientId: '', clientSecret: '', calendarId: 'primary', timeZone: 'Europe/Budapest' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(initialNotice || null)

  useEffect(() => {
    if (!settings) return
    setForm({
      clientId: settings.google.clientId,
      clientSecret: '',
      calendarId: settings.google.calendarId,
      timeZone: settings.google.timeZone,
    })
  }, [settings])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/settings/google', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await readError(res, 'A mentés nem sikerült.'))
      const next: SettingsPayload = await res.json()
      setSettings(next)
      setNotice({
        kind: 'ok',
        text: next.google.connected
          ? 'Elmentve.'
          : 'Elmentve. Most kattints a „Google-fiók csatlakoztatása” gombra.',
      })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/settings/google/auth-url', { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'Nem sikerült elindítani a csatlakoztatást.'))
      const { url } = await res.json()
      window.location.href = url
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/settings/google/test', { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'A teszt nem sikerült.'))
      const payload = await res.json()
      setNotice({ kind: 'ok', text: payload.message })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <NoticeBox notice={{ kind: 'error', text: loadError }} />
  if (!settings) return <div className="text-sm text-gray-500">Betöltés…</div>

  const g = settings.google
  const canConnect = Boolean(g.clientId && g.hasClientSecret)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded border bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-cormorant text-rose-deep">Google Naptár</h2>
            <SourceBadge source={g.activeSource} label={g.activeSource === 'admin' ? g.connectedEmail || undefined : undefined} />
          </div>
          <p className="mb-4 text-sm text-gray-600">
            A weboldal ebből a naptárból nézi a szabad időpontokat, és ide írja be az új foglalásokat. Három lépés: adatok beírása → mentés → Google-fiók csatlakoztatása.
          </p>

          <div className="mb-4 text-sm">
            <div className="font-semibold">Átirányítási URI (ezt kell beírni a Google-nál):</div>
            <CopyField value={g.redirectUri} />
          </div>

          <form onSubmit={save} className="space-y-3">
            <label className="block text-sm">
              Client ID
              <input value={form.clientId} onChange={(e) => setForm((s) => ({ ...s, clientId: e.target.value }))} className="mt-1 w-full border p-2" placeholder="…apps.googleusercontent.com" required />
            </label>
            <label className="block text-sm">
              Client secret
              <input
                type="password"
                value={form.clientSecret}
                onChange={(e) => setForm((s) => ({ ...s, clientSecret: e.target.value }))}
                className="mt-1 w-full border p-2"
                placeholder={g.hasClientSecret ? `Elmentve (${g.clientSecretMasked}) — hagyd üresen, ha nem változik` : 'GOCSPX-…'}
                required={!g.hasClientSecret}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              Naptár azonosító
              <input value={form.calendarId} onChange={(e) => setForm((s) => ({ ...s, calendarId: e.target.value }))} className="mt-1 w-full border p-2" placeholder="primary" />
              <span className="text-xs text-gray-500">„primary” = a Google-fiók fő naptára. Külön naptárhoz lásd a 9. lépést.</span>
            </label>
            <label className="block text-sm">
              Időzóna
              <input value={form.timeZone} onChange={(e) => setForm((s) => ({ ...s, timeZone: e.target.value }))} className="mt-1 w-full border p-2" placeholder="Europe/Budapest" />
            </label>
            <NoticeBox notice={notice} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="rounded bg-rose-deep px-4 py-2 text-white disabled:opacity-60">{busy ? 'Folyamatban…' : 'Mentés'}</button>
              <button type="button" disabled={busy || !canConnect} onClick={connect} className="rounded border border-rose-deep bg-white px-4 py-2 text-rose-deep disabled:opacity-50">
                {g.connected ? 'Újracsatlakoztatás' : 'Google-fiók csatlakoztatása'}
              </button>
              <button type="button" disabled={busy || g.activeSource === null} onClick={test} className="rounded border bg-white px-4 py-2 disabled:opacity-50">Kapcsolat tesztelése</button>
            </div>
            <div className="text-xs text-gray-500">
              {g.connected
                ? <>Csatlakoztatva{g.connectedEmail ? `: ${g.connectedEmail}` : ''}{g.connectedAt ? ` (${formatDate(g.connectedAt)})` : ''}</>
                : 'Még nincs saját Google-fiók csatlakoztatva.'}
            </div>
          </form>
        </div>
      </div>

      <Tutorial title="Útmutató: így kapcsolod össze a saját Google Naptárad">
        <Step n={1}>
          Jelentkezz be azzal a Google-fiókkal, amelyiknek a naptárába a foglalásokat szeretnéd, és nyisd meg a <ExtLink href="https://console.cloud.google.com/projectcreate">Google Cloud Console</ExtLink>-t. Hozz létre egy új projektet (név pl. <b>extremeruha</b>) → <b>Create</b>. Ez ingyenes, bankkártya nem kell.
        </Step>
        <Step n={2}>
          Ellenőrizd, hogy fent az új projekt van kiválasztva, majd nyisd meg a <ExtLink href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com">Google Calendar API</ExtLink> oldalt, és kattints az <b>Enable</b> (Engedélyezés) gombra.
        </Step>
        <Step n={3}>
          Menj a <ExtLink href="https://console.cloud.google.com/auth/overview">Google Auth Platform</ExtLink> oldalra → <b>Get started</b>. Töltsd ki:
          <ul className="mt-1 list-disc pl-5">
            <li>App name: <b>extremeruha</b></li>
            <li>User support email: a saját email címed</li>
            <li>Audience: <b>External</b></li>
            <li>Contact email: a saját email címed</li>
          </ul>
          Fogadd el a feltételeket → <b>Create</b>.
        </Step>
        <Step n={4}>
          Bal oldalt <ExtLink href="https://console.cloud.google.com/auth/audience">Audience</ExtLink> → <b>Publish app</b> → <b>Confirm</b>, hogy a státusz <b>In production</b> legyen.
          <div className="mt-1 rounded bg-amber-50 p-2 text-amber-900"><b>Ezt ne hagyd ki!</b> „Testing” módban a Google 7 nap után megszakítja a kapcsolatot, és leállnak a foglalások.</div>
        </Step>
        <Step n={5}>
          Bal oldalt <ExtLink href="https://console.cloud.google.com/auth/clients">Clients</ExtLink> → <b>Create client</b>:
          <ul className="mt-1 list-disc pl-5">
            <li>Application type: <b>Web application</b></li>
            <li>Name: pl. <b>extremeruha weboldal</b></li>
            <li><b>Authorized redirect URIs</b> → <b>Add URI</b> → másold be a bal oldalt látható <b>Átirányítási URI</b>-t, pontosan úgy, ahogy van.</li>
          </ul>
          Majd <b>Create</b>.
        </Step>
        <Step n={6}>
          Megjelenik a <b>Client ID</b> és a <b>Client secret</b>. Másold be mindkettőt ide a mezőkbe, és kattints a <b>Mentés</b> gombra. (A secretet később már nem mutatja meg a Google, de bármikor csinálhatsz újat.)
        </Step>
        <Step n={7}>
          Kattints a <b>Google-fiók csatlakoztatása</b> gombra, és válaszd ki a Google-fiókodat. Megjelenik egy figyelmeztetés: „A Google nem ellenőrizte ezt az alkalmazást” — ez normális, mert ez a saját alkalmazásod. Kattints a <b>Speciális</b> (Advanced) → <b>Ugrás az extremeruha oldalra</b> linkre, majd pipáld be a naptár-hozzáférést és kattints a <b>Folytatás</b> / <b>Engedélyezés</b> gombra.
        </Step>
        <Step n={8}>
          Visszakerülsz ide, és zöld üzenetet látsz. Kattints a <b>Kapcsolat tesztelése</b> gombra — ha kiírja a naptárad nevét, a foglalások mostantól a te naptáradba kerülnek. Érdemes egy próbafoglalást is csinálni a weboldalon.
        </Step>
        <Step n={9}>
          <i>Opcionális — külön naptár a foglalásoknak:</i> a <ExtLink href="https://calendar.google.com/calendar/r/settings/createcalendar">Google Naptárban</ExtLink> hozz létre egy új naptárt (pl. „Szalon foglalások”), nyisd meg a beállításait → <b>Naptár integrálása</b> → másold ki a <b>Naptárazonosítót</b> (…@group.calendar.google.com), írd be a „Naptár azonosító” mezőbe, és mentsd el.
        </Step>
        <li className="rounded bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <b>Ha valami nem megy:</b> „redirect_uri_mismatch” hiba esetén az 5. lépésben beírt URI nem egyezik pontosan a fentivel (figyelj a https-re és a végére). Ha a kapcsolat valaha megszakad, elég az <b>Újracsatlakoztatás</b> gomb.
        </li>
      </Tutorial>
    </div>
  )
}
