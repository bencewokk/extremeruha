import { useEffect, useMemo, useRef, useState } from 'react'

type AdminFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type Product = {
  _id: string
  name: string
  style: string
  image: string
  visible: boolean
  order: number | null
  updatedAt?: string | null
}

type Draft = {
  id: string | null // null = new dress
  name: string
  tags: string[]
  tagInput: string
  image: string // current image URL (existing or pasted)
  file: File | null
  filePreview: string | null
  visible: boolean
}

type Notice = { kind: 'ok' | 'error'; text: string } | null
type VisibilityFilter = 'all' | 'visible' | 'hidden'

const MAX_FILE_MB = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function splitTags(style: string) {
  return [...new Set(style.split(/[,/|]/).map((t) => t.trim()).filter(Boolean))]
}

function emptyDraft(): Draft {
  return { id: null, name: '', tags: [], tagInput: '', image: '', file: null, filePreview: null, visible: true }
}

function draftFromProduct(p: Product): Draft {
  return { id: p._id, name: p.name, tags: splitTags(p.style), tagInput: '', image: p.image, file: null, filePreview: null, visible: p.visible }
}

function draftKey(d: Draft) {
  return JSON.stringify([d.name.trim(), d.tags, d.image.trim(), Boolean(d.file), d.visible])
}

// Small Cloudinary thumbnail instead of the full-size image.
function thumb(url: string, width = 160, height = 200) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url
  return url.replace('/image/upload/', `/image/upload/c_fill,w_${width},h_${height},f_auto,q_auto/`)
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

function Thumb({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (!src || broken) {
    return <div className={`${className} flex items-center justify-center bg-gray-100 text-center text-[10px] leading-tight text-gray-400`}>{src ? 'A kép nem tölthető be' : 'Nincs kép'}</div>
  }
  return <img src={src} alt={alt} className={`${className} object-cover`} loading="lazy" onError={() => setBroken(true)} />
}

export default function ProductsManager({ adminFetch }: { adminFetch: AdminFetch }) {
  const [items, setItems] = useState<Product[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<VisibilityFilter>('all')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftBaseline, setDraftBaseline] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  async function load() {
    setLoadError('')
    try {
      const res = await adminFetch('/api/admin/products')
      if (!res.ok) throw new Error(await readError(res, 'A ruhák nem tölthetők be.'))
      setItems(await res.json())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFetch])

  // Free the local preview URL when it's replaced.
  useEffect(() => () => { if (draft?.filePreview) URL.revokeObjectURL(draft.filePreview) }, [draft?.filePreview])

  const dirty = draft ? draftKey(draft) !== draftBaseline : false

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of items || []) for (const tag of splitTags(p.style)) counts.set(tag, (counts.get(tag) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
  }, [items])

  const filtering = search.trim() !== '' || visibility !== 'all'
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (items || []).filter((p) => {
      if (visibility === 'visible' && !p.visible) return false
      if (visibility === 'hidden' && p.visible) return false
      return !q || p.name.toLowerCase().includes(q) || p.style.toLowerCase().includes(q)
    })
  }, [items, search, visibility])

  function confirmDiscard() {
    return !dirty || window.confirm('A megnyitott ruhán nem mentett változások vannak. Elveted őket?')
  }

  function openEditor(next: Draft) {
    if (!confirmDiscard()) return
    setDraft(next)
    setDraftBaseline(draftKey(next))
    setFormError('')
    setNotice(null)
    // On phones the editor is below the list: bring it into view.
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function closeEditor() {
    if (!confirmDiscard()) return
    setDraft(null)
    setFormError('')
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setFormError('')
  }

  function addTag(raw: string) {
    if (!draft) return
    const newTags = raw.split(/[,/|]/).map((t) => t.trim()).filter(Boolean)
    const tags = [...draft.tags]
    for (const tag of newTags) {
      if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag)
    }
    updateDraft({ tags, tagInput: '' })
  }

  function pickFile(file: File | null) {
    if (!draft || !file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFormError('Csak JPG, PNG, WEBP vagy GIF kép tölthető fel.')
      return
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFormError(`A kép túl nagy (${(file.size / 1024 / 1024).toFixed(1)} MB). Legfeljebb ${MAX_FILE_MB} MB lehet — telefonnal készült képnél válaszd a kisebb méretet, vagy küldd el magadnak e-mailben.`)
      return
    }
    updateDraft({ file, filePreview: URL.createObjectURL(file) })
  }

  async function uploadImage(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await adminFetch('/api/upload', { method: 'POST', body: fd })
    if (!res.ok) throw new Error(await readError(res, 'A kép feltöltése nem sikerült.'))
    const json = await res.json()
    return String(json.url)
  }

  function discardUpload(url: string) {
    adminFetch('/api/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(() => {})
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || saving) return

    const pendingTag = draft.tagInput.trim()
    const tags = pendingTag ? [...draft.tags, ...splitTags(pendingTag)] : draft.tags
    if (!draft.name.trim()) return setFormError('Add meg a ruha nevét.')
    if (!draft.file && !draft.image.trim()) return setFormError('Válassz egy képet, vagy illessz be egy képlinket.')

    setSaving(true)
    setFormError('')
    let uploadedUrl = ''
    try {
      if (draft.file) uploadedUrl = await uploadImage(draft.file)

      const body = {
        name: draft.name.trim(),
        style: tags.join(', '),
        image: uploadedUrl || draft.image.trim(),
        visible: draft.visible,
      }
      const res = draft.id
        ? await adminFetch(`/api/products/${draft.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await adminFetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await readError(res, 'A mentés nem sikerült.'))
      const saved: Product = await res.json()

      setItems((list) => {
        if (!list) return [saved]
        return draft.id ? list.map((p) => (p._id === saved._id ? saved : p)) : [saved, ...list]
      })
      setNotice({ kind: 'ok', text: draft.id ? `„${saved.name}” elmentve.` : `„${saved.name}” hozzáadva a kollekció elejére.` })
      setDraft(null)
    } catch (err) {
      if (uploadedUrl) discardUpload(uploadedUrl)
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function setBusy(id: string, busy: boolean) {
    setBusyIds((s) => {
      const next = new Set(s)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function toggleVisible(p: Product) {
    setBusy(p._id, true)
    setNotice(null)
    try {
      const res = await adminFetch(`/api/products/${p._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !p.visible }),
      })
      if (!res.ok) throw new Error(await readError(res, 'A módosítás nem sikerült.'))
      const saved: Product = await res.json()
      setItems((list) => list && list.map((x) => (x._id === saved._id ? saved : x)))
      setNotice({ kind: 'ok', text: saved.visible ? `„${saved.name}” újra látszik a weboldalon.` : `„${saved.name}” elrejtve a weboldalon (itt megmarad).` })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(p._id, false)
    }
  }

  async function remove(p: Product) {
    if (!window.confirm(`Biztosan törlöd: „${p.name}”?\n\nA képe is törlődik, és ez nem vonható vissza. Ha csak ideiglenesen nem akarod mutatni, használd inkább az „Elrejtés” gombot.`)) return
    setBusy(p._id, true)
    setNotice(null)
    try {
      const res = await adminFetch(`/api/products/${p._id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(await readError(res, 'A törlés nem sikerült.'))
      setItems((list) => list && list.filter((x) => x._id !== p._id))
      if (draft?.id === p._id) setDraft(null)
      setNotice({ kind: 'ok', text: `„${p.name}” törölve.` })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(p._id, false)
    }
  }

  async function move(index: number, delta: number) {
    if (!items) return
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const previous = items
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next) // optimistic
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/products/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((p) => p._id) }),
      })
      if (!res.ok) throw new Error(await readError(res, 'A sorrend mentése nem sikerült.'))
      setItems(await res.json())
    } catch (err) {
      setItems(previous)
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
      if (err instanceof Error && err.message.includes('közben megváltozott')) load()
    }
  }

  if (!items) {
    return loadError ? (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {loadError}
        <button type="button" className="ml-3 rounded border bg-white px-3 py-1 text-gray-700" onClick={load}>Újra</button>
      </div>
    ) : <div className="text-sm text-gray-500">Ruhák betöltése…</div>
  }

  const visibleCount = items.filter((p) => p.visible).length
  const previewSrc = draft?.filePreview || draft?.image.trim() || ''
  const suggestions = draft ? allTags.filter((t) => !draft.tags.some((x) => x.toLowerCase() === t.toLowerCase())).slice(0, 12) : []

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* ---- List ---- */}
      <div className="space-y-3 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-cormorant text-rose-deep">Ruhák</h2>
            <p className="text-xs text-gray-500">{items.length} ruha, ebből {visibleCount} látszik a weboldalon</p>
          </div>
          <button type="button" onClick={() => openEditor(emptyDraft())} className="rounded-full bg-rose-deep px-4 py-2 text-sm font-semibold text-white">
            + Új ruha
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Keresés név vagy címke alapján…"
            className="min-w-[12rem] flex-1 border bg-white p-2 text-sm"
          />
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as VisibilityFilter)} className="border bg-white p-2 text-sm" aria-label="Szűrés">
            <option value="all">Mind</option>
            <option value="visible">Látható</option>
            <option value="hidden">Rejtett</option>
          </select>
        </div>

        {notice ? (
          <div className={`rounded border px-3 py-2 text-sm ${notice.kind === 'ok' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-700'}`}>{notice.text}</div>
        ) : null}

        {filtering ? <p className="text-xs text-gray-500">Szűrés közben a sorrend nem módosítható.</p> : <p className="text-xs text-gray-500">A sorrend ugyanaz, mint a weboldalon. A nyilakkal rendezheted.</p>}

        {items.length === 0 ? (
          <div className="rounded border border-dashed bg-white p-8 text-center text-sm text-gray-500">
            Még nincs feltöltött ruha. Kattints az „+ Új ruha” gombra.
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded border bg-white p-6 text-center text-sm text-gray-500">Nincs a keresésnek megfelelő ruha.</div>
        ) : (
          <ul className="space-y-2">
            {shown.map((p) => {
              const index = items.findIndex((x) => x._id === p._id)
              const busy = busyIds.has(p._id)
              const editing = draft?.id === p._id
              return (
                <li key={p._id} className={`flex items-center gap-3 rounded border bg-white p-2 ${editing ? 'border-rose-deep ring-1 ring-rose-deep/40' : ''} ${p.visible ? '' : 'bg-gray-50'}`}>
                  <div className="flex flex-col">
                    <button type="button" className="px-1 text-gray-500 disabled:opacity-25" disabled={filtering || index === 0} onClick={() => move(index, -1)} aria-label="Feljebb">▲</button>
                    <button type="button" className="px-1 text-gray-500 disabled:opacity-25" disabled={filtering || index === items.length - 1} onClick={() => move(index, 1)} aria-label="Lejjebb">▼</button>
                  </div>
                  <Thumb src={thumb(p.image)} alt={p.name} className={`h-20 w-16 flex-none rounded ${p.visible ? '' : 'opacity-50'}`} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditor(draftFromProduct(p))}>
                    <div className="truncate font-semibold text-gray-800">{p.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {splitTags(p.style).map((tag) => (
                        <span key={tag} className="rounded-full bg-rose-deep/10 px-2 py-0.5 text-[11px] text-rose-deep">{tag}</span>
                      ))}
                      {!p.visible ? <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">Rejtett</span> : null}
                    </div>
                  </button>
                  <div className="flex flex-none flex-col items-end gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
                    <button type="button" disabled={busy} className="text-rose-deep disabled:opacity-40" onClick={() => openEditor(draftFromProduct(p))}>Szerkesztés</button>
                    <button type="button" disabled={busy} className="text-gray-600 disabled:opacity-40" onClick={() => toggleVisible(p)}>{p.visible ? 'Elrejtés' : 'Megjelenítés'}</button>
                    <button type="button" disabled={busy} className="text-red-600 disabled:opacity-40" onClick={() => remove(p)}>Törlés</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ---- Editor ---- */}
      <div ref={editorRef} className="lg:col-span-2">
        {draft ? (
          <form onSubmit={save} className="space-y-4 rounded border bg-white p-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-cormorant text-rose-deep">{draft.id ? 'Ruha szerkesztése' : 'Új ruha'}</h3>
              <button type="button" className="text-sm text-gray-500" onClick={closeEditor}>Mégse</button>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">Név</span>
              <input className="mt-1 w-full border p-2" value={draft.name} maxLength={100} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="pl. Bliss Ivory Lace A-Line" autoFocus />
            </label>

            <div className="text-sm">
              <span className="font-medium text-gray-700">Stílus címkék</span>
              <div className="mt-1 flex flex-wrap items-center gap-1 border p-1.5">
                {draft.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-rose-deep/10 px-2 py-0.5 text-xs text-rose-deep">
                    {tag}
                    <button type="button" aria-label={`${tag} eltávolítása`} onClick={() => updateDraft({ tags: draft.tags.filter((t) => t !== tag) })}>×</button>
                  </span>
                ))}
                <input
                  className="min-w-[8rem] flex-1 p-1 outline-none"
                  value={draft.tagInput}
                  onChange={(e) => {
                    const value = e.target.value
                    if (/[,]$/.test(value)) addTag(value)
                    else updateDraft({ tagInput: value })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draft.tagInput.trim()) { e.preventDefault(); addTag(draft.tagInput) }
                    if (e.key === 'Backspace' && !draft.tagInput && draft.tags.length) updateDraft({ tags: draft.tags.slice(0, -1) })
                  }}
                  placeholder={draft.tags.length ? '' : 'pl. A-Line, Csipkés — Enter vagy vessző'}
                />
              </div>
              {suggestions.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {suggestions.map((tag) => (
                    <button key={tag} type="button" className="rounded-full border border-dashed border-rose-deep/30 px-2 py-0.5 text-[11px] text-rose-deep" onClick={() => addTag(tag)}>+ {tag}</button>
                  ))}
                </div>
              ) : null}
              <span className="mt-1 block text-xs text-gray-500">A weboldalon ezek alapján lehet szűrni a kollekciót.</span>
            </div>

            <div className="text-sm">
              <span className="font-medium text-gray-700">Kép</span>
              <div
                className={`mt-1 flex cursor-pointer items-center gap-3 rounded border-2 border-dashed p-3 ${dragOver ? 'border-rose-deep bg-rose-deep/5' : 'border-gray-300'}`}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0] || null) }}
              >
                <Thumb src={previewSrc ? (draft.filePreview ? previewSrc : thumb(previewSrc, 240, 300)) : ''} alt="Előnézet" className="h-28 w-24 flex-none rounded" />
                <div className="text-xs text-gray-600">
                  <div className="font-semibold text-rose-deep">{previewSrc ? 'Kép cseréje' : 'Kép kiválasztása'}</div>
                  <div>Kattints, vagy húzd ide a képet.</div>
                  <div className="text-gray-400">JPG, PNG, WEBP · max. {MAX_FILE_MB} MB · álló kép mutat a legjobban</div>
                  {draft.file ? <div className="mt-1 text-gray-700">Kiválasztva: {draft.file.name} — mentéskor töltődik fel.</div> : null}
                </div>
                <input ref={fileInput} type="file" accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={(e) => { pickFile(e.target.files?.[0] || null); e.target.value = '' }} />
              </div>
              {draft.file ? (
                <button type="button" className="mt-1 text-xs text-gray-500 underline" onClick={() => updateDraft({ file: null, filePreview: null })}>Kiválasztott fájl elvetése</button>
              ) : (
                <details className="mt-1 text-xs text-gray-500">
                  <summary className="cursor-pointer">Vagy képlink beillesztése</summary>
                  <input className="mt-1 w-full border p-2 text-sm" value={draft.image} onChange={(e) => updateDraft({ image: e.target.value })} placeholder="https://…" />
                </details>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.visible} onChange={(e) => updateDraft({ visible: e.target.checked })} />
              Megjelenik a weboldalon
            </label>

            {formError ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div> : null}

            <div className="flex gap-2">
              <button type="submit" disabled={saving || (!dirty && Boolean(draft.id))} className="flex-1 rounded bg-rose-deep py-2 font-semibold text-white disabled:opacity-50">
                {saving ? (draft.file ? 'Kép feltöltése és mentés…' : 'Mentés…') : draft.id ? 'Változások mentése' : 'Ruha hozzáadása'}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded border border-dashed bg-white p-6 text-center text-sm text-gray-500 lg:sticky lg:top-4">
            Válassz egy ruhát a listából a szerkesztéshez,<br />vagy adj hozzá egy újat.
          </div>
        )}
      </div>
    </div>
  )
}
