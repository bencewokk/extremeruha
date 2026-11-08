// When people can book: weekly opening hours, closed dates (holidays),
// minimum notice and how far ahead. Edited in /admin → Foglalások.
// All dates/times are wall-clock times in the salon's time zone, so the
// result is the same whether the server runs in Budapest or in UTC (Vercel).

export const SCHEDULE_TIME_ZONE = 'Europe/Budapest'
export const WEEKDAY_NAMES = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
export const WEEKDAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const WEEKDAY_ADVERBS = ['Hétfőnként', 'Keddenként', 'Szerdánként', 'Csütörtökönként', 'Péntekenként', 'Szombatonként', 'Vasárnaponként']
const MAX_CLOSED_RANGES = 100

// weekly[0] = Monday … weekly[6] = Sunday
export const DEFAULT_BOOKING_SCHEDULE = {
  weekly: [
    { open: true, from: '10:00', to: '17:00' },
    { open: true, from: '10:00', to: '17:00' },
    { open: true, from: '10:00', to: '17:00' },
    { open: true, from: '10:00', to: '17:00' },
    { open: true, from: '10:00', to: '17:00' },
    { open: true, from: '09:00', to: '13:00' },
    { open: false, from: '10:00', to: '17:00' },
  ],
  closedDates: [],
  minNoticeHours: 2,
  maxDaysAhead: 180,
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/

function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

// 0 = Monday … 6 = Sunday
export function weekdayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

function zoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

function zoneOffsetMs(date, timeZone) {
  const p = zoneParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - (date.getTime() - date.getMilliseconds())
}

// "2026-11-10" + "10:00" in Europe/Budapest → the matching UTC instant (DST-safe)
export function zonedTimeToDate(dateStr, timeStr, timeZone = SCHEDULE_TIME_ZONE) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let result = guess - zoneOffsetMs(new Date(guess), timeZone)
  result = guess - zoneOffsetMs(new Date(result), timeZone)
  return new Date(result)
}

export function dateStringInZone(date, timeZone = SCHEDULE_TIME_ZONE) {
  const p = zoneParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function findClosedRange(schedule, dateStr) {
  return (schedule.closedDates || []).find((range) => range.from <= dateStr && dateStr <= range.to) || null
}

// Opening window for one day, or { closed: true, message } explaining why not.
export function getDayWindow(schedule, dateStr, now = new Date()) {
  if (!isValidDateString(dateStr)) return { closed: true, message: 'Érvénytelen dátum.' }

  const today = dateStringInZone(now)
  if (dateStr < today) return { closed: true, message: 'Múltbeli napra nem lehet foglalni.' }

  const lastDate = addDays(today, schedule.maxDaysAhead)
  if (dateStr > lastDate) {
    return { closed: true, message: `Legfeljebb ${schedule.maxDaysAhead} nappal előre lehet foglalni.` }
  }

  const closedRange = findClosedRange(schedule, dateStr)
  if (closedRange) {
    return { closed: true, message: closedRange.note ? `Ezen a napon zárva vagyunk (${closedRange.note}).` : 'Ezen a napon zárva vagyunk.' }
  }

  const day = schedule.weekly[weekdayIndex(dateStr)]
  if (!day?.open) return { closed: true, message: `${WEEKDAY_ADVERBS[weekdayIndex(dateStr)]} zárva vagyunk.` }

  return {
    closed: false,
    from: zonedTimeToDate(dateStr, day.from),
    to: zonedTimeToDate(dateStr, day.to),
  }
}

// Earliest moment a new booking may start (now + minimum notice).
export function earliestBookableStart(schedule, now = new Date()) {
  return new Date(now.getTime() + schedule.minNoticeHours * 60 * 60 * 1000)
}

export function normalizeSchedule(stored) {
  if (!stored || !Array.isArray(stored.weekly) || stored.weekly.length !== 7) return DEFAULT_BOOKING_SCHEDULE
  return {
    weekly: stored.weekly,
    closedDates: Array.isArray(stored.closedDates) ? stored.closedDates : [],
    minNoticeHours: Number.isFinite(stored.minNoticeHours) ? stored.minNoticeHours : DEFAULT_BOOKING_SCHEDULE.minNoticeHours,
    maxDaysAhead: Number.isFinite(stored.maxDaysAhead) ? stored.maxDaysAhead : DEFAULT_BOOKING_SCHEDULE.maxDaysAhead,
  }
}

// Validates what /admin sends. Returns { schedule } or { error }.
export function sanitizeSchedule(input, now = new Date()) {
  if (!input || !Array.isArray(input.weekly) || input.weekly.length !== 7) {
    return { error: 'Hiányzik a heti nyitvatartás.' }
  }

  const weekly = []
  for (const [index, raw] of input.weekly.entries()) {
    const open = Boolean(raw?.open)
    const from = String(raw?.from || '')
    const to = String(raw?.to || '')
    if (open) {
      if (!TIME_RE.test(from) || !TIME_RE.test(to)) {
        return { error: `${WEEKDAY_NAMES[index]}: az időpontok óra:perc formátumúak legyenek, 15 perces lépésekben (pl. 09:30).` }
      }
      if (timeToMinutes(from) >= timeToMinutes(to)) {
        return { error: `${WEEKDAY_NAMES[index]}: a nyitás legyen korábban, mint a zárás.` }
      }
    }
    weekly.push({ open, from: TIME_RE.test(from) ? from : '10:00', to: TIME_RE.test(to) ? to : '17:00' })
  }

  if (!weekly.some((day) => day.open)) {
    return { error: 'Legalább egy napon nyitva kell lenni.' }
  }

  const rawClosed = Array.isArray(input.closedDates) ? input.closedDates : []
  // Ranges that ended more than a month ago are dropped automatically.
  const cutoff = addDays(dateStringInZone(now), -31)
  const closedDates = []
  for (const raw of rawClosed) {
    const from = String(raw?.from || '')
    const to = String(raw?.to || raw?.from || '')
    const note = typeof raw?.note === 'string' ? raw.note.trim().slice(0, 80) : ''
    if (!from && !to && !note) continue
    if (!isValidDateString(from) || !isValidDateString(to)) {
      return { error: 'Zárva tartott napok: minden sorban adj meg egy érvényes kezdő dátumot.' }
    }
    if (to < from) {
      return { error: `Zárva tartott napok: a(z) ${from} sorban a záró dátum korábbi, mint a kezdő.` }
    }
    if (to < cutoff) continue
    closedDates.push({ from, to, note })
  }
  if (closedDates.length > MAX_CLOSED_RANGES) {
    return { error: `Legfeljebb ${MAX_CLOSED_RANGES} zárva tartott időszak adható meg.` }
  }
  closedDates.sort((a, b) => a.from.localeCompare(b.from))

  const minNoticeHours = Number(input.minNoticeHours)
  if (!Number.isFinite(minNoticeHours) || minNoticeHours < 0 || minNoticeHours > 336) {
    return { error: 'A minimum előzetes foglalási idő 0 és 336 óra (2 hét) között legyen.' }
  }

  const maxDaysAhead = Number(input.maxDaysAhead)
  if (!Number.isInteger(maxDaysAhead) || maxDaysAhead < 1 || maxDaysAhead > 730) {
    return { error: 'Az előre foglalható napok száma 1 és 730 között legyen.' }
  }

  return { schedule: { weekly, closedDates, minNoticeHours, maxDaysAhead } }
}
