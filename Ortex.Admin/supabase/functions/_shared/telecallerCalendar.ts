// Date awareness for the telecaller: what day and time it is in India right
// now, and which festivals, corporate seasons and regional occasions are
// coming up, so the agent can pitch the right gifting at the right moment.
//
// Fixed-date occasions recur every year. Lunar / solar-calendar festivals move,
// so their dates are listed per year below; extend the table each year (the
// Agent tab's "Occasions" box can also add or override entries at any time).
// Dates for 2026 are verified against published calendars; treat 2027 as
// provisional and re-check before the season.

export type Occasion = {
  name: string
  date: string // YYYY-MM-DD
  /** Regions / languages this matters most for (empty = all India). */
  regions?: string[]
  /** What to pitch and to whom. */
  pitch: string
  /** How many days before the date orders should be locked (artwork + production + dispatch). */
  leadDays?: number
}

const FIXED: (Omit<Occasion, "date"> & { md: string })[] = [
  { md: "01-01", name: "New Year", pitch: "Client and employee New Year gifts: diaries, planners, calendars, pen sets, desk items with the year printed.", leadDays: 21 },
  { md: "01-14", name: "Makar Sankranti / Pongal / Lohri", regions: ["ta", "te", "kn", "gu", "pa", "chennai", "hyderabad", "bengaluru", "ahmedabad", "punjab"], pitch: "Festive gift sets and branded kites/hampers in Gujarat, Pongal gifts in Tamil Nadu, Lohri gifts in Punjab.", leadDays: 18 },
  { md: "01-26", name: "Republic Day", pitch: "Badges, flags, banners, event kits for schools, institutions and corporate celebrations.", leadDays: 14 },
  { md: "03-08", name: "Women's Day", pitch: "Employee appreciation gifts: personalised keychains, desk plants in branded pots, planners.", leadDays: 14 },
  { md: "03-31", name: "Financial year end", pitch: "Companies use remaining budgets before 31 March: push pending corporate orders to close now.", leadDays: 20 },
  { md: "04-01", name: "New financial year", pitch: "Fresh diaries, planners, ID cards and joining kits for the new year and new hires.", leadDays: 14 },
  { md: "05-01", name: "Labour Day", pitch: "Worker appreciation: safety badges, ID cards, caps, water bottles.", leadDays: 14 },
  { md: "06-15", name: "School reopening season", pitch: "Examination pads, clipboards, ID cards, lanyards, badges for schools and coaching institutes.", leadDays: 21 },
  { md: "07-01", name: "Doctors' Day", pitch: "Gifts for hospital staff and pharma outreach: name badges, desk items, pen sets.", leadDays: 14 },
  { md: "08-15", name: "Independence Day", pitch: "Badges, flags, banners, event kits and tricolour-themed keychains for offices and schools.", leadDays: 14 },
  { md: "09-05", name: "Teachers' Day", pitch: "Trophies, plaques, personalised pens and diaries for schools and colleges.", leadDays: 14 },
  { md: "09-15", name: "Engineers' Day", pitch: "Desk standees, plaques and tech-company employee gifts.", leadDays: 14 },
  { md: "11-14", name: "Children's Day", pitch: "School gifting: keychains, badges, fridge magnets, popsockets.", leadDays: 14 },
  { md: "12-25", name: "Christmas", pitch: "Year-end client hampers and employee gifts, combined with New Year.", leadDays: 21 },
]

// Movable festivals by year (Indian lunar / solar calendars).
const MOVABLE: Record<string, Occasion[]> = {
  "2026": [
    { name: "Holi", date: "2026-03-04", pitch: "Colourful merch and employee celebration kits: caps, t-shirt branding, sweets-box branding.", leadDays: 18 },
    { name: "Gudi Padwa / Ugadi", date: "2026-03-19", regions: ["mr", "te", "kn", "mumbai", "pune", "hyderabad", "bengaluru"], pitch: "New-year gifts for Maharashtra, Telangana, Andhra and Karnataka clients.", leadDays: 18 },
    { name: "Eid ul-Fitr", date: "2026-03-20", pitch: "Festive hampers and sweet-box branding for clients and staff.", leadDays: 18 },
    { name: "Baisakhi", date: "2026-04-14", regions: ["pa", "punjab", "chandigarh", "ludhiana"], pitch: "Punjab harvest festival gifting.", leadDays: 14 },
    { name: "Akshaya Tritiya", date: "2026-04-19", pitch: "Jewellers and retailers: branded gift boxes, keychains, promotional items for buyers.", leadDays: 18 },
    { name: "Eid al-Adha", date: "2026-05-27", pitch: "Festive hampers for clients and staff.", leadDays: 18 },
    { name: "Onam", date: "2026-08-26", regions: ["ml", "kerala", "kochi", "thiruvananthapuram"], pitch: "Kerala clients: Onam gift sets and employee hampers.", leadDays: 18 },
    { name: "Raksha Bandhan", date: "2026-08-28", pitch: "Rakhi gift hampers, personalised keychains and chocolates-box branding for retailers and corporates.", leadDays: 18 },
    { name: "Janmashtami", date: "2026-09-04", pitch: "Temple and community event merch: badges, lanyards, flags.", leadDays: 14 },
    { name: "Ganesh Chaturthi", date: "2026-09-14", regions: ["mr", "mumbai", "pune", "nagpur", "hyderabad"], pitch: "Maharashtra: mandal sponsorship banners, badges, keychains, idol-shaped fridge magnets.", leadDays: 18 },
    { name: "Navratri / Durga Puja", date: "2026-10-11", regions: ["gu", "bn", "ahmedabad", "surat", "kolkata"], pitch: "Gujarat garba event kits (badges, lanyards, wristbands); Bengal Durga Puja sponsor branding and gifts.", leadDays: 18 },
    { name: "Dussehra", date: "2026-10-20", pitch: "Start of the Diwali gifting run: lock Diwali orders now.", leadDays: 14 },
    { name: "Karwa Chauth", date: "2026-10-29", pitch: "Retail gifting: personalised keychains and gift boxes.", leadDays: 14 },
    { name: "Diwali", date: "2026-11-08", pitch: "THE biggest B2B gifting season: hampers (steel bottle + diary + pen + keychain), acrylic and MDF decor items, brass-look idols on acrylic bases, dry-fruit box branding. Book early: production slots fill up.", leadDays: 28 },
    { name: "Bhai Dooj", date: "2026-11-10", pitch: "Retail gift sets.", leadDays: 14 },
    { name: "Chhath Puja", date: "2026-11-15", regions: ["bihar", "patna", "jharkhand", "purvanchal"], pitch: "Bihar / UP east clients: community event branding.", leadDays: 14 },
    { name: "Guru Nanak Jayanti", date: "2026-11-24", regions: ["pa", "punjab", "delhi", "chandigarh"], pitch: "Community event kits and gifts.", leadDays: 14 },
  ],
  "2027": [
    { name: "Eid ul-Fitr", date: "2027-03-09", pitch: "Festive hampers and sweet-box branding.", leadDays: 18 },
    { name: "Holi", date: "2027-03-22", pitch: "Colourful merch and employee celebration kits.", leadDays: 18 },
    { name: "Gudi Padwa / Ugadi", date: "2027-04-07", regions: ["mr", "te", "kn"], pitch: "Regional new-year gifts.", leadDays: 18 },
    { name: "Akshaya Tritiya", date: "2027-05-08", pitch: "Jewellers and retailers: branded gift boxes and promo items.", leadDays: 18 },
    { name: "Raksha Bandhan", date: "2027-08-17", pitch: "Rakhi hampers and personalised gifts.", leadDays: 18 },
    { name: "Ganesh Chaturthi", date: "2027-09-04", regions: ["mr", "mumbai", "pune"], pitch: "Mandal branding, badges, keychains, magnets.", leadDays: 18 },
    { name: "Onam", date: "2027-09-14", regions: ["ml", "kerala"], pitch: "Kerala gifting.", leadDays: 18 },
    { name: "Navratri / Durga Puja", date: "2027-09-30", regions: ["gu", "bn"], pitch: "Garba kits; Durga Puja sponsor branding.", leadDays: 18 },
    { name: "Dussehra", date: "2027-10-09", pitch: "Lock Diwali orders now.", leadDays: 14 },
    { name: "Diwali", date: "2027-10-29", pitch: "Biggest gifting season: hampers, decor, dry-fruit box branding. Book early.", leadDays: 28 },
    { name: "Bhai Dooj", date: "2027-10-31", pitch: "Retail gift sets.", leadDays: 14 },
  ],
}

// Always-on business seasons (month ranges), pitched when inside the window.
const SEASONS: { from: string; to: string; name: string; pitch: string }[] = [
  { from: "10-15", to: "02-28", name: "Wedding season", pitch: "Return gifts, personalised keychains, fridge magnets and welcome kits for event planners and families." },
  { from: "01-01", to: "03-15", name: "Exhibition and trade-fair season", pitch: "Exhibitor kits: badges, lanyards, standees, banners, giveaway keychains and popsockets." },
  { from: "04-01", to: "07-31", name: "Joining season (new hires, interns)", pitch: "Joining kits: diary, pen, ID card + lanyard, keychain, bottle with company logo." },
  { from: "11-15", to: "01-15", name: "Year-end and annual-day season", pitch: "Trophies, plaques, awards, annual-day badges and employee recognition gifts." },
]

const pad = (n: number) => String(n).padStart(2, "0")

/** Current date/time in Asia/Kolkata as parts. */
export function nowInIndia(at = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(at)
  const get = (t: string) => f.find((p) => p.type === t)?.value || ""
  const hour = Number(get("hour"))
  const partOfDay = hour < 12 ? "morning" : hour < 16 ? "afternoon" : hour < 20 ? "evening" : "night"
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(at) // YYYY-MM-DD
  return { text: `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} IST`, ymd, hour, partOfDay, weekday: get("weekday") }
}

function daysBetween(fromYmd: string, toYmd: string) {
  return Math.round((Date.parse(toYmd + "T00:00:00Z") - Date.parse(fromYmd + "T00:00:00Z")) / 86400000)
}

/** Parse the team's own "YYYY-MM-DD Name — pitch" lines from settings. */
export function parseCustomOccasions(text: string | undefined): Occasion[] {
  const out: Occasion[] = []
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{4}-\d{2}-\d{2})\s+([^—\-:]+?)(?:\s*[—\-:]\s*(.+))?$/)
    if (m) out.push({ name: m[2].trim(), date: m[1], pitch: (m[3] || "").trim() || "Team-added occasion.", leadDays: 14 })
  }
  return out
}

/**
 * Occasions in the next `horizonDays`, most relevant first. `hints` are
 * lower-cased strings from the customer's city / language / company used to
 * boost regional festivals.
 */
export function upcomingOccasions(opts: { at?: Date; horizonDays?: number; hints?: string[]; custom?: Occasion[]; max?: number } = {}) {
  const at = opts.at || new Date()
  const horizon = opts.horizonDays ?? 75
  const hints = (opts.hints || []).map((h) => String(h || "").toLowerCase()).filter(Boolean)
  const { ymd } = nowInIndia(at)
  const year = Number(ymd.slice(0, 4))

  const pool: Occasion[] = []
  for (const y of [year, year + 1]) {
    for (const f of FIXED) pool.push({ ...f, date: `${y}-${f.md}` })
    for (const m of MOVABLE[String(y)] || []) pool.push(m)
  }
  for (const c of opts.custom || []) pool.push(c)

  const scored = pool
    .map((o) => ({ ...o, daysAway: daysBetween(ymd, o.date) }))
    .filter((o) => o.daysAway >= -1 && o.daysAway <= horizon)
    .map((o) => {
      const regional = (o.regions || []).some((r) => hints.some((h) => h.includes(r) || r.includes(h)))
      const national = !o.regions || o.regions.length === 0
      // Skip regional festivals that do not match the customer at all, unless
      // nothing is known about them.
      const relevant = national || regional || hints.length === 0
      const bookBy = new Date(Date.parse(o.date + "T00:00:00Z") - (o.leadDays || 14) * 86400000).toISOString().slice(0, 10)
      const bookDays = daysBetween(ymd, bookBy)
      // Still makeable? Inside half the lead window there is no honest pitch left.
      const makeable = o.daysAway >= Math.ceil((o.leadDays || 14) / 2)
      // Best moment to pitch: the order window is open now or opens within a month.
      const timing = bookDays >= 0 && bookDays <= 30 ? 30 : bookDays < 0 ? 15 : Math.max(0, 30 - (bookDays - 30) / 2)
      return { ...o, regional, relevant: relevant && makeable, bookBy, bookDays, score: (regional ? 30 : 0) + (national ? 10 : 0) + timing + (o.name === "Diwali" ? 25 : 0) }
    })
    .filter((o) => o.relevant)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.max ?? 4)

  const mmdd = ymd.slice(5)
  const seasons = SEASONS.filter((s) => (s.from <= s.to ? mmdd >= s.from && mmdd <= s.to : mmdd >= s.from || mmdd <= s.to))
  return { occasions: scored, seasons }
}

/** Prompt block describing today and what is coming up. */
export function calendarBrief(opts: { at?: Date; hints?: string[]; custom?: Occasion[] } = {}): string {
  const now = nowInIndia(opts.at)
  const { occasions, seasons } = upcomingOccasions({ at: opts.at, hints: opts.hints, custom: opts.custom })
  const lines = [
    `Right now it is ${now.text} (${now.partOfDay}). Greet accordingly (${now.partOfDay === "morning" ? "Good morning / Suprabhat" : now.partOfDay === "afternoon" ? "Good afternoon / Namaste" : "Good evening / Namaste"}). ${now.weekday === "Saturday" ? "It is Saturday: many offices close early; keep it brief." : ""}`.trim(),
  ]
  if (occasions.length) {
    lines.push("Upcoming occasions to bring up naturally (never as a list; pick the one or two that fit this customer):")
    for (const o of occasions) {
      const when = o.daysAway <= 0 ? "today" : o.daysAway === 1 ? "tomorrow" : `in ${o.daysAway} days (${o.date})`
      const book = o.bookDays <= 0 ? "the order window is closing: confirm this week to make it in time" : `orders should be confirmed by ${o.bookBy}, about ${o.bookDays} days from now`
      lines.push(`- ${o.name}${o.regional ? " (important in this customer's region)" : ""}: ${when}. ${o.pitch} Lead time: ${book}.`)
    }
  }
  if (seasons.length) {
    lines.push("Business seasons running now: " + seasons.map((s) => `${s.name} (${s.pitch})`).join(" | "))
  }
  lines.push("Use these to ask what is coming up for THEM and to create honest urgency: production slots fill up before big festivals, and artwork approval starts the clock. Never invent a festival date; if unsure, say the team will confirm.")
  return lines.join("\n")
}
