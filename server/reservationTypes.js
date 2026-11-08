// Booking types the site offers ("Ruhapróba", consultations, ...).
// The owner edits them in /admin → Foglalástípusok; these are the defaults
// used until he saves his own list.

export const SLOT_STEP_MINUTES = 15
const MAX_TYPES = 12
const MAX_LIST_ITEMS = 6

export const DEFAULT_RESERVATION_TYPES = [
  {
    id: 'ruhaproba',
    enabled: true,
    label: 'Ruhapróba',
    durationMinutes: 90,
    heading: 'Ruhapróba 90 perces, privát időpontban',
    description: 'A ruhapróba 90 perces, előre foglalt, privát időpontban történik, ezért kérjük, pontosan érkezz.',
    badges: ['90 perces próba', 'Kényelmes cipő javasolt', 'Inspirációs képek hasznosak'],
    highlights: [
      'Érkezz pontosan a nyugodt, privát próbára.',
      'Hozz kényelmes cipőt és inspirációs képeket.',
      'Egy közeli hozzátartozó vagy barátnő elkísérhet.',
    ],
    notesPlaceholder: 'Megjegyzés (stílus, méret, egyéb)',
    eventTitle: 'Menyasszonyi ruhapróba',
    successLabel: 'ruhapróba',
    faqTitle: 'Gyakori kérdések a ruhapróbákról',
    faqs: [
      {
        title: 'Hogyan zajlik egy menyasszonyi ruhapróba az extremeruha szalonban?',
        text: 'A ruhapróba 90 perces, előre foglalt privát időpontban történik. A szalon csapata stílus, szabásvonal és a nagy nap hangulata alapján segít kiválasztani a hozzád illő ruhákat, valamint kölcsönzésben, értékesítésben és igazításban is segít.',
      },
      {
        title: 'Milyen stílusú menyasszonyi ruhák érhetők el Miskolcon?',
        text: 'A kollekcióban letisztult, romantikus, csipkés, minimal és modern vonalvezetésű menyasszonyi ruhák szerepelnek. Az aktuális darabok a kollekció részben és az admin felületen feltöltött modellekből jönnek.',
      },
      {
        title: 'Mit érdemes magaddal hozni a ruhapróbára?',
        text: 'Hasznos lehet testszínű alsóruházat, kényelmes cipő, valamint inspirációs képek. Ha szeretnéd, egy közeli hozzátartozó vagy barátnő is elkísérhet az időpontra.',
      },
    ],
  },
  {
    id: 'kolcsonzesi-konzultacio',
    enabled: true,
    label: 'Kölcsönzési konzultáció',
    durationMinutes: 60,
    heading: 'Kölcsönzési konzultáció 60 perces időpontban',
    description: 'Átbeszéljük a kölcsönzési igényeket, a szóba jöhető modelleket és a nagy nap időzítését egy személyes konzultáción.',
    badges: ['60 perces konzultáció', 'Költségkeret egyeztetés', 'Elérhető modellek áttekintése'],
    highlights: [
      'Érkezz pontosan, hogy a teljes konzultáció rendelkezésedre álljon.',
      'Hasznos, ha hozol inspirációs képeket és az esküvő dátumát.',
      'A kölcsönzési lehetőségeket és a következő lépéseket együtt átbeszéljük.',
    ],
    notesPlaceholder: 'Megjegyzés (elképzelt fazon, dátum, költségkeret)',
    eventTitle: 'Menyasszonyi ruhakölcsönzési konzultáció',
    successLabel: 'kölcsönzési konzultáció',
    faqTitle: 'Gyakori kérdések a kölcsönzési konzultációról',
    faqs: [
      {
        title: 'Miről szól egy kölcsönzési konzultáció?',
        text: 'A konzultáció alatt átbeszéljük, milyen stílusú ruhát keresel, mikor lesz az esküvő, és mely modellek jöhetnek szóba kölcsönzésre a szalon kínálatából.',
      },
      {
        title: 'Mit érdemes előre átgondolni a konzultáció előtt?',
        text: 'Hasznos, ha tudod az esküvő dátumát, a tervezett költségkeretet és azt, milyen fazonok vagy hangulatok állnak hozzád közel.',
      },
      {
        title: 'Lesz szó az igazításról és a következő lépésekről is?',
        text: 'Igen. A személyes konzultáció során átbeszéljük a kölcsönzési folyamatot, a szükséges igazításokat és azt is, milyen következő egyeztetésekre lehet szükség.',
      },
    ],
  },
  {
    id: 'vasarlasi-konzultacio',
    enabled: true,
    label: 'Vásárlási konzultáció',
    durationMinutes: 60,
    heading: 'Vásárlási konzultáció 60 perces időpontban',
    description: 'Segítünk végignézni a megvásárolható ruhákat, a méret- és fazonválasztást, valamint az egyedi igényeket.',
    badges: ['60 perces konzultáció', 'Megvásárolható ruhák', 'Méret és fazon egyeztetés'],
    highlights: [
      'Érkezz pontosan, hogy legyen idő a modellek összehasonlítására.',
      'Inspirációs képek és elképzelt stílus nagy segítség a választásnál.',
      'A vásárlási opciókat és az igazítási lehetőségeket is átbeszéljük.',
    ],
    notesPlaceholder: 'Megjegyzés (kedvelt stílus, méret, fontos szempontok)',
    eventTitle: 'Menyasszonyi ruhavásárlási konzultáció',
    successLabel: 'vásárlási konzultáció',
    faqTitle: 'Gyakori kérdések a vásárlási konzultációról',
    faqs: [
      {
        title: 'Mit nézünk át egy vásárlási konzultáción?',
        text: 'A megvásárolható modelleket, a megfelelő méretet, a számodra előnyös szabásvonalakat és azt, mely ruhák illenek legjobban az elképzelt esküvői hangulathoz.',
      },
      {
        title: 'Érdemes inspirációt vagy konkrét elképzelést hozni?',
        text: 'Igen. Fotók, kedvelt fazonok, nyakkivágások vagy anyagok említése nagyban felgyorsítja a választást és segít szűkíteni a lehetőségeket.',
      },
      {
        title: 'A vásárlás mellett igazításról is kapok információt?',
        text: 'Igen. A konzultáció része, hogy átbeszéljük az esetleges igazításokat, az egyedi igényeket és a ruha véglegesítésének folyamatát is.',
      },
    ],
  },
]

function str(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function strList(value, max = 300) {
  if (!Array.isArray(value)) return []
  return value.map((item) => str(item, max)).filter(Boolean).slice(0, MAX_LIST_ITEMS)
}

export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// Validates the list sent from /admin. Returns { types } or { error }.
export function sanitizeReservationTypes(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: 'Legalább egy foglalástípus szükséges.' }
  }
  if (input.length > MAX_TYPES) {
    return { error: `Legfeljebb ${MAX_TYPES} foglalástípus lehet.` }
  }

  const usedIds = new Set()
  const types = []

  for (const [index, raw] of input.entries()) {
    const label = str(raw?.label, 60)
    if (!label) return { error: `A(z) ${index + 1}. típusnak nincs neve.` }

    const durationMinutes = Number(raw?.durationMinutes)
    if (!Number.isInteger(durationMinutes) || durationMinutes < SLOT_STEP_MINUTES || durationMinutes > 480 || durationMinutes % SLOT_STEP_MINUTES !== 0) {
      return { error: `„${label}”: az időtartam ${SLOT_STEP_MINUTES} és 480 perc között legyen, ${SLOT_STEP_MINUTES} perces lépésekben.` }
    }

    // Keep existing ids stable (old links and calendar events use them).
    let id = slugify(raw?.id) || slugify(label) || `tipus-${index + 1}`
    const baseId = id
    let suffix = 2
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`
    usedIds.add(id)

    const faqs = Array.isArray(raw?.faqs)
      ? raw.faqs
        .map((faq) => ({ title: str(faq?.title, 200), text: str(faq?.text, 1000) }))
        .filter((faq) => faq.title && faq.text)
        .slice(0, MAX_LIST_ITEMS)
      : []

    types.push({
      id,
      enabled: raw?.enabled !== false,
      label,
      durationMinutes,
      heading: str(raw?.heading, 120),
      description: str(raw?.description, 600),
      badges: strList(raw?.badges, 60),
      highlights: strList(raw?.highlights, 200),
      notesPlaceholder: str(raw?.notesPlaceholder, 120),
      eventTitle: str(raw?.eventTitle, 120),
      successLabel: str(raw?.successLabel, 60),
      faqTitle: str(raw?.faqTitle, 120),
      faqs,
    })
  }

  if (!types.some((type) => type.enabled)) {
    return { error: 'Legalább egy foglalástípusnak bekapcsolva kell lennie.' }
  }

  return { types }
}

// Fields left empty in /admin get a sensible text derived from name/duration,
// computed on read so renaming a type also updates them.
export function withDerivedDefaults(type) {
  return {
    ...type,
    heading: type.heading || `${type.label} ${type.durationMinutes} perces időpontban`,
    notesPlaceholder: type.notesPlaceholder || 'Megjegyzés',
    eventTitle: type.eventTitle || type.label,
    successLabel: type.successLabel || type.label.toLowerCase(),
  }
}
