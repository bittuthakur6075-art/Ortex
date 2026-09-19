// Turns the website tracker's raw rows (user_activities) into VISITORS: one per
// device id, with a readable name, how interested they look, what they looked
// at, and their visits as a sequence of plain-English steps. Pure, so it is
// tested in visitors.test.js.
//
// The device id (usr_…) is minted once per browser and kept in localStorage by
// Ortex.Web/src/lib/tracker.js, so it is one browser on one device. Every
// enquiry the site saves is stamped with the same id (doc.tracking.userId in
// Ortex.Web/src/lib/leads.js), which is what lets a visitor be tied to the
// lead they became.
//
// Also imported by Ortex.WhatsApp.Bot (plain Node, through its src/loader.js),
// so keep it free of browser-only imports; the bot's npm test fails if not.

// A new visit starts after this much silence. sessionStorage ids are per TAB,
// so three tabs opened in the same minute are three "sessions" but one visit.
export const VISIT_GAP_MS = 30 * 60 * 1000

export const UNKNOWN_DEVICE = "Unknown device"

const time = (t) => new Date(t).getTime() || 0

// How interested a visitor looks, from their strongest single action.
export const INTEREST = {
  enquired: { label: "Sent an enquiry", tone: "emerald", rank: 3 },
  hot: { label: "Close to enquiring", tone: "amber", rank: 2 },
  interested: { label: "Looking at products", tone: "blue", rank: 1 },
  browsing: { label: "Just browsing", tone: "slate", rank: 0 },
}

const ENQUIRY_TYPES = new Set(["Quote request", "Contact form submission"])
const HOT_TYPES = new Set(["Quote builder visit", "Cart actions", "Contact page visit", "PDF download"])
const PRODUCT_TYPES = new Set(["Product page visit", "Product search", "Catalog view"])

function interestOf(type) {
  if (ENQUIRY_TYPES.has(type)) return "enquired"
  if (HOT_TYPES.has(type)) return "hot"
  if (PRODUCT_TYPES.has(type)) return "interested"
  return "browsing"
}

// "custom-mdf-award-trophy" -> "Custom mdf award trophy"
function unslug(slug = "") {
  let raw = String(slug)
  try { raw = decodeURIComponent(raw) } catch { /* keep it as typed */ }
  const text = raw.replace(/[-_]+/g, " ").trim()
  return text ? text[0].toUpperCase() + text.slice(1) : ""
}

// The product a row is about, if any: the tracker stores a name for ?product=
// links and "Product: <slug>" as the page of a /products/<cat>/<slug> URL.
export function productOf(act) {
  if (act.metadata?.productName && act.activityType !== "Quote request" && act.activityType !== "Contact form submission") {
    return act.metadata.productName
  }
  const page = act.metadata?.page || ""
  if (page.startsWith("Product: ")) return unslug(page.slice(9))
  return ""
}

function categoryOf(act) {
  const page = act.metadata?.page || ""
  return page.startsWith("Category: ") ? unslug(page.slice(10)) : ""
}

// One action as a sentence a salesperson can read aloud.
export function stepLabel(act) {
  const meta = act.metadata || {}
  switch (act.activityType) {
    case "Home page visit": return "Opened the home page"
    case "Catalog view": {
      const cat = categoryOf(act)
      return cat ? `Browsed ${cat}` : "Browsed the product catalogue"
    }
    case "Product page visit": return `Viewed ${productOf(act) || "a product"}`
    case "Product search": return meta.searchQuery ? `Searched for "${meta.searchQuery}"` : "Searched the catalogue"
    case "Quote builder visit": return "Opened the quote builder"
    case "Quote request": return "Sent a quote request"
    case "Contact form submission": return "Sent the contact form"
    case "Contact page visit": return "Opened the contact page"
    case "Cart actions": {
      const what = meta.productName || "an item"
      const qty = meta.quantity ? ` (${meta.quantity} pcs)` : ""
      return meta.action === "remove" ? `Removed ${what} from the quote` : `Added ${what}${qty} to the quote`
    }
    case "PDF download": return meta.fileName ? `Downloaded ${meta.fileName}` : "Downloaded the catalogue"
    case "Not found page visit": return `Landed on a missing page (${act.pageUrl || "unknown"})`
    case "Policy page visit": return `Read the ${(meta.page || "policy").toLowerCase()}`
    default: {
      const page = meta.page || act.pageUrl
      return page ? `Opened ${page}` : act.activityType || "Visited the site"
    }
  }
}

// "Mobile" + "Android" -> "Android phone". Plain words, not a UA taxonomy.
export function deviceLabel(act = {}) {
  const os = act.operatingSystem || ""
  const kind = act.device || ""
  if (/ipad/i.test(os) || (kind === "Tablet" && /ios/i.test(os))) return "iPad"
  if (kind === "Tablet") return os && !/unknown/i.test(os) ? `${os} tablet` : "Tablet"
  if (kind === "Mobile") {
    if (/ios|iphone/i.test(os)) return "iPhone"
    if (/android/i.test(os)) return "Android phone"
    return "Phone"
  }
  if (/windows/i.test(os)) return "Windows computer"
  if (/mac/i.test(os)) return "Mac"
  if (/linux/i.test(os)) return "Linux computer"
  return "Computer"
}

export const isMobile = (act = {}) => act.device === "Mobile" || act.device === "Tablet"

const NOT_A_PLACE = new Set(["", "not collected", "unknown", "unknown city"])

// The town, or "" when the visitor did not consent to location.
export function placeOf(act = {}) {
  const city = (act.city || (act.location || "").split(",")[0] || "").trim()
  return NOT_A_PLACE.has(city.toLowerCase()) ? "" : city
}

// Full place for the detail view: "New Delhi, Delhi, India 110098".
export function fullPlaceOf(act = {}) {
  if (!placeOf(act)) return ""
  const base = act.location || [act.city, act.region, act.country].filter(Boolean).join(", ")
  return act.postal ? `${base} ${act.postal}` : base
}

// Where the visit came from, in words: "Google", "Direct", "facebook.com".
export function sourceOf(ref) {
  if (!ref || ref === "Direct") return "Direct"
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "")
    if (/(^|\.)google\./.test(host)) return "Google"
    if (/(^|\.)bing\.com$/.test(host)) return "Bing"
    if (/(^|\.)(facebook|fb)\.com$/.test(host)) return "Facebook"
    if (/(^|\.)instagram\.com$/.test(host)) return "Instagram"
    if (/(^|\.)linkedin\.com$|lnkd\.in$/.test(host)) return "LinkedIn"
    if (/(^|\.)whatsapp\.com$|wa\.me$/.test(host)) return "WhatsApp"
    if (/(^|\.)indiamart\.com$/.test(host)) return "IndiaMART"
    if (/ortexindustries\.in$/.test(host)) return "Direct"
    return host
  } catch {
    // The tracker also writes labels such as "Google Search" or "Home page link".
    return /link|page|results/i.test(ref) ? "Direct" : ref
  }
}

export function formatDuration(ms) {
  const mins = Math.round(ms / 60000)
  if (mins < 1) return "under a minute"
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Actions (any order) -> visits, newest first, each with its steps oldest
// first. An immediate repeat of the same step (a reload, a second tab) is
// folded into one step with a count rather than listed twice.
export function visitsOf(actions) {
  const asc = [...actions].sort((a, b) => time(a.timestamp) - time(b.timestamp))
  const visits = []
  let current = null
  for (const act of asc) {
    const t = time(act.timestamp)
    if (!current || t - current.end > VISIT_GAP_MS) {
      current = { start: t, end: t, steps: [], source: sourceOf(act.referrer) }
      visits.push(current)
    }
    current.end = t
    const label = stepLabel(act)
    const last = current.steps[current.steps.length - 1]
    if (last && last.label === label) last.count += 1
    else current.steps.push({ id: act.id, at: t, label, act, count: 1, interest: interestOf(act.activityType) })
  }
  return visits
    .map((v) => ({ ...v, duration: v.end - v.start }))
    .reverse()
}

// Count occurrences, most frequent first, keeping first-seen order on ties.
function ranked(values) {
  const counts = new Map()
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }))
}

// enquiries: the console's `enquiries` rows (web enquiries and Anu voice
// captures). Only rows carrying doc.tracking.userId can be joined.
export function buildVisitors(activities, enquiries = []) {
  const leadsByDevice = new Map()
  for (const e of enquiries) {
    const id = e.tracking?.userId
    if (!id) continue
    if (!leadsByDevice.has(id)) leadsByDevice.set(id, [])
    leadsByDevice.get(id).push(e)
  }
  for (const list of leadsByDevice.values()) {
    list.sort((a, b) => time(b.submittedAt || b.createdAt) - time(a.submittedAt || a.createdAt))
  }

  const byDevice = new Map()
  for (const act of activities) {
    const id = act.userId || UNKNOWN_DEVICE
    if (!byDevice.has(id)) byDevice.set(id, [])
    byDevice.get(id).push(act)
  }

  return [...byDevice.entries()]
    .map(([id, list]) => {
      const actions = [...list].sort((a, b) => time(b.timestamp) - time(a.timestamp))
      const latest = actions[0]
      const first = actions[actions.length - 1]
      const leads = id === UNKNOWN_DEVICE ? [] : leadsByDevice.get(id) || []
      const visits = visitsOf(actions)

      // Strongest signal wins. A joined enquiry counts even when the
      // submission row itself fell outside the loaded window.
      let interest = leads.length ? "enquired" : "browsing"
      for (const a of actions) {
        const level = interestOf(a.activityType)
        if (INTEREST[level].rank > INTEREST[interest].rank) interest = level
      }

      // Consent can arrive part-way through, so the newest row is not always
      // the one that knows where the device is.
      const located = actions.find((a) => placeOf(a)) || null
      const lead = leads[0] || null
      const leadName = lead ? (lead.customer?.name || lead.customer?.company || "").trim() : ""
      const place = located ? placeOf(located) : ""
      const device = deviceLabel(latest)

      return {
        id,
        name: leadName || (place ? `${device} in ${place}` : device),
        device,
        mobile: isMobile(latest),
        place,
        fullPlace: located ? fullPlaceOf(located) : "",
        located,
        latest,
        first,
        lastSeen: time(latest.timestamp),
        firstSeen: time(first.timestamp),
        actions,
        visits,
        returning: visits.length > 1,
        interest,
        leads,
        lead,
        source: sourceOf(first.referrer),
        products: ranked(actions.map(productOf)),
        searches: ranked(actions.map((a) => a.activityType === "Product search" ? a.metadata?.searchQuery : "")),
        pages: ranked(actions.map((a) => a.metadata?.page || a.pageUrl)),
      }
    })
    .sort((a, b) => b.lastSeen - a.lastSeen)
}

// The one line under a visitor's name that says why they matter.
export function headline(v) {
  if (v.lead) {
    const what = v.lead.productInterest ? ` for ${v.lead.productInterest}` : ""
    return `Sent an enquiry${what}`
  }
  if (v.interest === "enquired") return "Submitted a form on the website"
  if (v.products.length) {
    const top = v.products[0].value
    const more = v.products.length > 1 ? ` and ${v.products.length - 1} more` : ""
    return `Viewed ${top}${more}`
  }
  if (v.searches.length) return `Searched for "${v.searches[0].value}"`
  if (v.interest === "hot") return "Opened the quote builder or contact page"
  const pages = v.pages.length
  return pages > 1 ? `Looked at ${pages} pages` : `Looked at ${v.pages[0]?.value || "one page"}`
}

export function summarise(visitors) {
  return {
    total: visitors.length,
    enquired: visitors.filter((v) => v.interest === "enquired").length,
    hot: visitors.filter((v) => v.interest === "hot").length,
    returning: visitors.filter((v) => v.returning).length,
    mobile: visitors.filter((v) => v.mobile).length,
  }
}

export const VISITOR_FILTERS = [
  { value: "all", label: "Everyone", test: () => true },
  { value: "enquired", label: "Sent an enquiry", test: (v) => v.interest === "enquired" },
  { value: "hot", label: "Close to enquiring", test: (v) => v.interest === "hot" },
  { value: "interested", label: "Looking at products", test: (v) => v.interest === "interested" },
  { value: "returning", label: "Came back", test: (v) => v.returning },
]

export const PERIODS = [
  { value: "1", label: "Today", days: 1 },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "all", label: "All", days: null },
]

// Start of the window: "Today" means since local midnight, not the last 24h.
export function periodStart(value, now = Date.now()) {
  const p = PERIODS.find((x) => x.value === value)
  if (!p || !p.days) return 0
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (p.days - 1))
  return d.getTime()
}
