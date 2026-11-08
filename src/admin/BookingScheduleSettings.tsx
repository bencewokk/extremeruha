import { useEffect, useState } from 'react'

type AdminFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type ScheduleDay = { open: boolean; from: string; to: string }
type ClosedRange = { from: string; to: string; note: string }
type Schedule = {
  weekly: ScheduleDay[]
  closedDates: ClosedRange[]
  minNoticeHours: number
  maxDaysAhead: number
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

const DAY_NAMES = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']

// 06:00 … 22:00 in 15-minute steps
const TIME_OPTIONS = Array.from({ length: (22 - 6) * 4 + 1 }, (_, i) => {
  const minutes = 6 * 60 + i * 15
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

const NOTICE_OPTIONS = [
  { value: 0, label: 'Nincs korlát (akár azonnal)' },
  { value: 1, label: '1 óra' },
  { value: 2, label: '2 óra' },
  { value: 4, label: '4 óra' },
  { value: 12, label: '12 óra' },
  { value: 24, label: '1 nap' },
  { value: 48, label: '2 nap' },
  { value: 72, label: '3 nap' },
  { value: 168, label: '1 hét' },
]

const HORIZON_OPTIONS = [
  { value: 14, label: '2 hét' },
  { value: 30, label: '1 hónap' },
  { value: 60, label: '2 hónap' },
  { value: 90, label: '3 hónap' },
  { value: 180, label: '6 hónap' },
  { value: 365, label: '1 év' },
]

function todayString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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

type Option = { value: number; label: string }

// Keeps a saved value selectable even if it isn't one of the presets.
function withOption(options: Option[], value: number, label: string): Option[] {
  return options.some((o) => o.value === value) ? options : [...options, { value, label }].sort((a, b) => a.value - b.value)
}

export default function BookingScheduleSettings({ adminFetch }: { adminFetch: AdminFetch }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    let cancelled = false
    adminFetch('/api/admin/booking-schedule')
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'A nyitvatartás nem tölthető be.'))
        return res.json()
      })
      .then((payload) => { if (!cancelled) setSchedule(payload) })
      .catch((err) => { if (!cancelled) setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) }) })
    return () => { cancelled = true }
  }, [adminFetch])

  function change(patch: Partial<Schedule>) {
    setSchedule((s) => (s ? { ...s, ...patch } : s))
    setDirty(true)
    setNotice(null)
  }

  function changeDay(index: number, patch: Partial<ScheduleDay>) {
    if (!schedule) return
    change({ weekly: schedule.weekly.map((day, i) => (i === index ? { ...day, ...patch } : day)) })
  }

  function changeClosed(index: number, patch: Partial<ClosedRange>) {
    if (!schedule) return
    change({
      closedDates: schedule.closedDates.map((range, i) => {
        if (i !== index) return range
        const next = { ...range, ...patch }
        // Moving the start past the end drags the end along.
        if (patch.from && next.to < next.from) next.to = next.from
        return next
      }),
    })
  }

  async function save() {
    if (!schedule) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await adminFetch('/api/admin/booking-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
      })
      if (!res.ok) throw new Error(await readError(res, 'A mentés nem sikerült.'))
      setSchedule(await res.json())
      setDirty(false)
      setNotice({ kind: 'ok', text: 'Elmentve. A weboldal mostantól ezek szerint kínál időpontokat.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!schedule) {
    return notice
      ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{notice.text}</div>
      : <div className="text-sm text-gray-500">Betöltés…</div>
  }

  const today = todayString()

  return (
    <div className="space-y-4 rounded border bg-white p-4">
      <div>
        <h2 className="text-2xl font-cormorant text-rose-deep">Mikor lehet foglalni?</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          A weboldal csak a nyitvatartáson belül kínál időpontot, és csak ott, ahol a Google Naptárad szabad.
          Ha egy napra vagy pár órára nem akarsz foglalást (pl. orvos, magánprogram), elég beírni a Google Naptáradba — az a sáv automatikusan foglaltnak számít.
          Ugyanez a nyitvatartás jelenik meg a főoldalon és a Kapcsolat oldalon is.
        </p>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Heti nyitvatartás</h3>
        <div className="divide-y rounded border">
          {schedule.weekly.map((day, index) => (
            <div key={DAY_NAMES[index]} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="w-24 font-medium">{DAY_NAMES[index]}</span>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={day.open} onChange={(e) => changeDay(index, { open: e.target.checked })} />
                Nyitva
              </label>
              {day.open ? (
                <div className="flex items-center gap-2 text-sm">
                  <select className="border p-1" value={day.from} onChange={(e) => changeDay(index, { from: e.target.value })} aria-label={`${DAY_NAMES[index]} nyitás`}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span>–</span>
                  <select className="border p-1" value={day.to} onChange={(e) => changeDay(index, { to: e.target.value })} aria-label={`${DAY_NAMES[index]} zárás`}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ) : (
                <span className="text-sm text-gray-400">Zárva — nem lehet foglalni</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">Egy foglalás csak akkor jelenik meg, ha zárásig be is fejeződik (pl. 17:00-s zárásnál a 90 perces ruhapróba legkésőbb 15:30-kor kezdődhet).</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Zárva tartott napok (szabadság, ünnepek)</h3>
        {schedule.closedDates.length === 0 ? (
          <p className="text-sm text-gray-500">Nincs megadva zárva tartott nap.</p>
        ) : (
          <div className="space-y-2">
            {schedule.closedDates.map((range, index) => (
              <div key={index} className={`flex flex-wrap items-center gap-2 rounded border p-2 text-sm ${range.to < today ? 'opacity-50' : ''}`}>
                <input type="date" className="border p-1" value={range.from} onChange={(e) => changeClosed(index, { from: e.target.value })} aria-label="Kezdete" />
                <span>–</span>
                <input type="date" className="border p-1" value={range.to} min={range.from} onChange={(e) => changeClosed(index, { to: e.target.value })} aria-label="Vége" />
                <input className="min-w-[10rem] flex-1 border p-1" value={range.note} placeholder="Megjegyzés (pl. Karácsony) — megjelenik a weboldalon" maxLength={80} onChange={(e) => changeClosed(index, { note: e.target.value })} />
                <button type="button" className="text-red-600" onClick={() => change({ closedDates: schedule.closedDates.filter((_, i) => i !== index) })}>Törlés</button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="mt-2 rounded border bg-white px-3 py-1 text-sm"
          onClick={() => change({ closedDates: [...schedule.closedDates, { from: today, to: today, note: '' }] })}
        >
          + Zárva tartott nap / időszak
        </button>
        <p className="mt-1 text-xs text-gray-500">Egy napnál a kezdő és a záró dátum ugyanaz. A régi, lejárt időszakok egy hónap után maguktól eltűnnek.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Legalább ennyivel előre kell foglalni</span>
          <select className="mt-1 w-full border p-2" value={schedule.minNoticeHours} onChange={(e) => change({ minNoticeHours: Number(e.target.value) })}>
            {withOption(NOTICE_OPTIONS, schedule.minNoticeHours, `${schedule.minNoticeHours} óra`).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="mt-1 block text-xs text-gray-500">Pl. 1 nap: ma délután már nem lehet holnap reggelre foglalni.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Legfeljebb ennyivel előre lehet foglalni</span>
          <select className="mt-1 w-full border p-2" value={schedule.maxDaysAhead} onChange={(e) => change({ maxDaysAhead: Number(e.target.value) })}>
            {withOption(HORIZON_OPTIONS, schedule.maxDaysAhead, `${schedule.maxDaysAhead} nap`).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <button type="button" disabled={busy || !dirty} onClick={save} className="rounded bg-rose-deep px-5 py-2 text-white disabled:opacity-50">
          {busy ? 'Mentés…' : 'Nyitvatartás mentése'}
        </button>
        {dirty ? <span className="text-sm text-amber-700">Nem mentett változások</span> : null}
        {notice ? <span className={`text-sm ${notice.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</span> : null}
      </div>
    </div>
  )
}
