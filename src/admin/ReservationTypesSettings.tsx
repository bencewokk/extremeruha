import { useEffect, useState } from 'react'

type AdminFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type Faq = { title: string; text: string }

type ReservationType = {
  id: string
  enabled: boolean
  label: string
  durationMinutes: number
  heading: string
  description: string
  badges: string[]
  highlights: string[]
  notesPlaceholder: string
  eventTitle: string
  successLabel: string
  faqTitle: string
  faqs: Faq[]
}

// Local editing copy: lists are edited as "one item per line" text.
type EditableType = Omit<ReservationType, 'badges' | 'highlights'> & {
  key: string
  badgesText: string
  highlightsText: string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

const DURATION_OPTIONS = Array.from({ length: 32 }, (_, i) => (i + 1) * 15)

let keyCounter = 0
const nextKey = () => `t${++keyCounter}`

function toEditable(type: ReservationType): EditableType {
  const { badges, highlights, ...rest } = type
  return {
    ...rest,
    faqs: Array.isArray(type.faqs) ? type.faqs : [],
    key: nextKey(),
    badgesText: (badges || []).join('\n'),
    highlightsText: (highlights || []).join('\n'),
  }
}

function toPayload(type: EditableType): ReservationType {
  const { key, badgesText, highlightsText, ...rest } = type
  const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean)
  return { ...rest, badges: lines(badgesText), highlights: lines(highlightsText) }
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} perc`
  return m ? `${h} óra ${m} perc` : `${h} óra`
}

function blankType(): EditableType {
  return {
    key: nextKey(),
    id: '',
    enabled: true,
    label: '',
    durationMinutes: 60,
    heading: '',
    description: '',
    badgesText: '',
    highlightsText: '',
    notesPlaceholder: 'Megjegyzés',
    eventTitle: '',
    successLabel: '',
    faqTitle: '',
    faqs: [],
  }
}

async function readError(res: Response, fallback: string) {
  try {
    const payload = await res.json()
    if (payload?.error) return String(payload.error)
  } catch {
    // keep fallback
  }
  return fallback
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
    </label>
  )
}

export default function ReservationTypesSettings({ adminFetch }: { adminFetch: AdminFetch }) {
  const [types, setTypes] = useState<EditableType[] | null>(null)
  const [isDefault, setIsDefault] = useState(true)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  function applyPayload(payload: { types: ReservationType[]; isDefault: boolean }) {
    setTypes(payload.types.map(toEditable))
    setIsDefault(payload.isDefault)
    setDirty(false)
  }

  useEffect(() => {
    let cancelled = false
    adminFetch('/api/admin/reservation-types')
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'A foglalástípusok nem tölthetők be.'))
        return res.json()
      })
      .then((payload) => { if (!cancelled) applyPayload(payload) })
      .catch((err) => { if (!cancelled) setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) }) })
    return () => { cancelled = true }
  }, [adminFetch])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function update(key: string, patch: Partial<EditableType>) {
    setTypes((list) => list && list.map((t) => (t.key === key ? { ...t, ...patch } : t)))
    setDirty(true)
    setNotice(null)
  }

  function move(index: number, delta: number) {
    setTypes((list) => {
      if (!list) return list
      const next = [...list]
      const target = index + delta
      if (target < 0 || target >= next.length) return list
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setDirty(true)
  }

  function remove(type: EditableType) {
    if (!window.confirm(`Biztosan törlöd: „${type.label || 'névtelen típus'}”? (Mentés után végleges.)`)) return
    setTypes((list) => list && list.filter((t) => t.key !== type.key))
    setDirty(true)
  }

  function add() {
    const type = blankType()
    setTypes((list) => [...(list || []), type])
    setOpenKey(type.key)
    setDirty(true)
  }

  async function save() {
    if (!types) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/reservation-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: types.map(toPayload) }),
      })
      if (!res.ok) throw new Error(await readError(res, 'A mentés nem sikerült.'))
      applyPayload(await res.json())
      setOpenKey(null)
      setNotice({ kind: 'ok', text: 'Elmentve. A weboldalon azonnal az új foglalástípusok jelennek meg.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  async function resetToDefaults() {
    if (!window.confirm('Visszaállítod az eredeti 3 foglalástípust? A saját módosításaid elvesznek.')) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/reservation-types', { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'A visszaállítás nem sikerült.'))
      applyPayload(await res.json())
      setNotice({ kind: 'ok', text: 'Visszaállítva az alapértelmezett foglalástípusokra.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!types) {
    return notice
      ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{notice.text}</div>
      : <div className="text-sm text-gray-500">Betöltés…</div>
  }

  const input = 'mt-1 w-full border p-2'

  return (
    <div className="space-y-4">
      <div className="rounded border bg-white p-4">
        <h2 className="text-2xl font-cormorant text-rose-deep">Foglalástípusok</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Itt állítod be, milyen időpontokat lehet foglalni a weboldalon (pl. ruhapróba, konzultáció), és mennyi ideig tartanak.
          A sorrend a weboldalon is ugyanez lesz — az első az alapértelmezett. Amit kikapcsolsz, az eltűnik a weboldalról, de a beállításai megmaradnak.
          A változások csak a <b>Mentés</b> gomb után élnek.
        </p>
        {isDefault ? <p className="mt-2 text-xs text-gray-500">Jelenleg az eredeti, beépített foglalástípusok vannak érvényben.</p> : null}
      </div>

      {types.map((type, index) => {
        const open = openKey === type.key
        return (
          <div key={type.key} className={`rounded border bg-white ${type.enabled ? '' : 'opacity-70'}`}>
            <div className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex flex-col">
                <button type="button" className="px-2 text-gray-500 disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Feljebb">▲</button>
                <button type="button" className="px-2 text-gray-500 disabled:opacity-30" disabled={index === types.length - 1} onClick={() => move(index, 1)} aria-label="Lejjebb">▼</button>
              </div>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenKey(open ? null : type.key)}>
                <div className="font-semibold text-rose-deep">{type.label || 'Új foglalástípus'}</div>
                <div className="text-xs text-gray-500">
                  {formatDuration(type.durationMinutes)}{index === 0 ? ' • alapértelmezett' : ''}{type.enabled ? '' : ' • kikapcsolva'}
                </div>
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={type.enabled} onChange={(e) => update(type.key, { enabled: e.target.checked })} />
                Foglalható
              </label>
              <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setOpenKey(open ? null : type.key)}>{open ? 'Bezárás' : 'Szerkesztés'}</button>
              <button type="button" className="text-sm text-red-600" onClick={() => remove(type)}>Törlés</button>
            </div>

            {open ? (
              <div className="space-y-5 border-t p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Név (ez a gomb felirata)">
                    <input className={input} value={type.label} onChange={(e) => update(type.key, { label: e.target.value })} placeholder="pl. Ruhapróba" />
                  </Field>
                  <Field label="Időtartam" hint="Ennyi időre foglalja le a naptárat. Az időpontok 15 percenként indulhatnak.">
                    <select className={input} value={type.durationMinutes} onChange={(e) => update(type.key, { durationMinutes: Number(e.target.value) })}>
                      {DURATION_OPTIONS.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
                    </select>
                  </Field>
                </div>

                <fieldset className="space-y-3">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Foglalási rész a főoldalon</legend>
                  <Field label="Cím" hint="Üresen hagyva: „<Név> <időtartam> perces időpontban”.">
                    <input className={input} value={type.heading} onChange={(e) => update(type.key, { heading: e.target.value })} />
                  </Field>
                  <Field label="Leírás">
                    <textarea className={`${input} h-20`} value={type.description} onChange={(e) => update(type.key, { description: e.target.value })} />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Címkék (soronként egy)" hint="Kis „buborékok” a leírás alatt.">
                      <textarea className={`${input} h-24`} value={type.badgesText} onChange={(e) => update(type.key, { badgesText: e.target.value })} placeholder={'90 perces próba\nKényelmes cipő javasolt'} />
                    </Field>
                    <Field label="Tudnivalók (soronként egy, legfeljebb 6)" hint="Kártyák ikonokkal. Hármat érdemes megadni.">
                      <textarea className={`${input} h-24`} value={type.highlightsText} onChange={(e) => update(type.key, { highlightsText: e.target.value })} placeholder={'Érkezz pontosan.\nHozz inspirációs képeket.'} />
                    </Field>
                  </div>
                  <Field label="Megjegyzés mező súgószövege">
                    <input className={input} value={type.notesPlaceholder} onChange={(e) => update(type.key, { notesPlaceholder: e.target.value })} />
                  </Field>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Naptár és visszaigazolás</legend>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Esemény neve a Google Naptárban" hint="Üresen hagyva a típus neve.">
                      <input className={input} value={type.eventTitle} onChange={(e) => update(type.key, { eventTitle: e.target.value })} placeholder="pl. Menyasszonyi ruhapróba" />
                    </Field>
                    <Field label="Megnevezés a köszönőoldalon" hint="„…várunk a szalonban a ___ időpontodra.”">
                      <input className={input} value={type.successLabel} onChange={(e) => update(type.key, { successLabel: e.target.value })} placeholder="pl. ruhapróba" />
                    </Field>
                  </div>
                  <Field label="GYIK címe a köszönőoldalon">
                    <input className={input} value={type.faqTitle} onChange={(e) => update(type.key, { faqTitle: e.target.value })} placeholder="pl. Gyakori kérdések a ruhapróbákról" />
                  </Field>
                  <div className="space-y-3">
                    {type.faqs.map((faq, faqIndex) => (
                      <div key={faqIndex} className="rounded border bg-gray-50 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
                          <span>{faqIndex + 1}. kérdés</span>
                          <button type="button" className="text-red-600" onClick={() => update(type.key, { faqs: type.faqs.filter((_, i) => i !== faqIndex) })}>Törlés</button>
                        </div>
                        <input
                          className="w-full border p-2 text-sm"
                          value={faq.title}
                          placeholder="Kérdés"
                          onChange={(e) => update(type.key, { faqs: type.faqs.map((f, i) => (i === faqIndex ? { ...f, title: e.target.value } : f)) })}
                        />
                        <textarea
                          className="mt-2 h-20 w-full border p-2 text-sm"
                          value={faq.text}
                          placeholder="Válasz"
                          onChange={(e) => update(type.key, { faqs: type.faqs.map((f, i) => (i === faqIndex ? { ...f, text: e.target.value } : f)) })}
                        />
                      </div>
                    ))}
                    {type.faqs.length < 6 ? (
                      <button type="button" className="rounded border bg-white px-3 py-1 text-sm" onClick={() => update(type.key, { faqs: [...type.faqs, { title: '', text: '' }] })}>
                        + Kérdés hozzáadása
                      </button>
                    ) : null}
                  </div>
                </fieldset>
              </div>
            ) : null}
          </div>
        )
      })}

      <button type="button" onClick={add} className="w-full rounded border-2 border-dashed border-rose-deep/30 bg-white py-3 font-semibold text-rose-deep">
        + Új foglalástípus
      </button>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-ivory/95 py-3 backdrop-blur">
        <button type="button" disabled={busy || !dirty} onClick={save} className="rounded bg-rose-deep px-5 py-2 text-white disabled:opacity-50">
          {busy ? 'Mentés…' : 'Mentés'}
        </button>
        <button type="button" disabled={busy || isDefault} onClick={resetToDefaults} className="rounded border bg-white px-4 py-2 text-sm disabled:opacity-50">
          Eredeti típusok visszaállítása
        </button>
        {dirty ? <span className="text-sm text-amber-700">Nem mentett változások</span> : null}
        {notice ? (
          <span className={`text-sm ${notice.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</span>
        ) : null}
      </div>
    </div>
  )
}
