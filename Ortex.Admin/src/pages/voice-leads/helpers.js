import { newLine } from "../../data/domain/schema"
import { formatDateTime } from "../../lib/format"

// Leads captured by Anu, the website AI voice assistant. They live in the shared
// `enquiries` collection tagged with this source (see Ortex.Web LiveOrty
// saveVoiceLead), so this page is a focused view over that one slice.
//
// The important wrinkle: Anu calls `capture_lead` every time the picture firms
// up during a call, and each call is a separate INSERT. One three-minute
// conversation therefore lands as three rows with three references, each a
// slightly better version of the last. Showing them as three leads (which is
// what the raw list did) triple-counts the pipeline and invites three people to
// ring the same customer. So rows are folded into CALLS here: same phone, gap
// under SESSION_GAP_MS. The newest row in a call is the truth; the earlier ones
// become its timeline.
export const VOICE_SOURCE = "Voice assistant (Anu)"

const MINUTE_MS = 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_GAP_MS = 45 * MINUTE_MS

export const RANGES = [
  { key: "all", label: "All time", days: null },
  { key: "1", label: "Today", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
]

// Anu is told to route complaints and order problems to a human, but she still
// saves them through the same tool, so they arrive looking exactly like buying
// intent. Pitching a quotation at someone trying to cancel is the worst outcome
// this page can produce, so those calls get flagged and can be filtered out.
const SUPPORT_RE =
  /\b(cancel|cancell?ation|complain|complaint|refund|return|bad behaviou?r|rude|angry|upset|not happy|dissatisf|poor service|damaged|defect|wrong (item|product|order)|delay(ed)? (order|delivery)|escalat)/i

// Callers routinely quote a quantity the mouth runs away with ("2 crore", with a
// 200 rupee budget in the same breath). Treated as real these dominate every
// sort and every total, so they are flagged for a human to confirm rather than
// silently trusted or silently dropped.
const BIG_QTY_RE = /\bcrore\b|\bkarod\b/i
const LAKH_RE = /(\d+(?:\.\d+)?)\s*(lakh|lac|lakhs)/i

// A name is only useful if someone can open a call with it. Anu falls back to
// filler when the customer never gives one, and `validateLead` on the website
// only checks for two letters, so these come through as real names.
const PLACEHOLDER_NAMES = new Set([
  "customer", "grahak", "sir", "madam", "unknown", "caller", "test", "testing",
  "na", "n/a", "none", "anonymous", "user", "client", "aap", "ji",
])

const URGENT_RE = /\b(urgent|urgently|asap|immediate|immediately|jaldi|turant|emergency|same day|tomorrow|kal chahiye)/i

// ---- parsing ---------------------------------------------------------------

// The website packs summary, quantity and timeline into one `message` string
// ("summary · Qty: x · Timeline: y") because `enquiries` has no columns for
// them. Split them back out so each reads as its own field. Rows saved before
// those suffixes existed come back as a summary with both fields empty, which is
// exactly right.
export function parseMessage(message = "") {
  let quantity = ""
  let timeline = ""
  let itemsLine = ""
  const rest = []
  for (const part of String(message).split(" · ")) {
    const p = part.trim()
    if (/^qty:/i.test(p)) quantity = p.replace(/^qty:\s*/i, "")
    else if (/^timeline:/i.test(p)) timeline = p.replace(/^timeline:\s*/i, "")
    else if (/^items:/i.test(p)) itemsLine = p.replace(/^items:\s*/i, "")
    else if (p) rest.push(p)
  }
  return { summary: rest.join(" · "), quantity, timeline, itemsLine }
}

// An order is a list of products, one per thing the customer agreed to, including
// every cross-sell they accepted mid-call. Newer leads carry a structured
// `items` array. Older ones carry only the flat `productInterest` string plus a
// single quantity, so rebuild a one-line list from those rather than showing
// nothing. The "Items: 1000 x Diaries; 500 x Pens" digest is the last fallback,
// for a row whose array was lost but whose message survived.
export function itemsFor(row) {
  const structured = (Array.isArray(row.items) ? row.items : [])
    .map((it) => ({
      product: String(it?.product || "").trim(),
      quantity: String(it?.quantity || "").trim(),
      notes: String(it?.notes || "").trim(),
    }))
    .filter((it) => it.product)
  if (structured.length) return structured

  if (row.itemsLine) {
    return row.itemsLine
      .split(";")
      .map((chunk) => {
        const m = chunk.trim().match(/^(.*?)\s+x\s+(.*)$/i)
        return m ? { product: m[2].trim(), quantity: m[1].trim(), notes: "" } : { product: chunk.trim(), quantity: "", notes: "" }
      })
      .filter((it) => it.product)
  }

  // `productInterest` is comma-joined when several products were captured, so a
  // legacy multi-product row still splits into a list. The single quantity we
  // have can only be attributed when there is exactly one product.
  const names = String(row.productInterest || "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!names.length) return []
  return names.map((product) => ({
    product,
    quantity: names.length === 1 ? row.quantity || "" : "",
    notes: "",
  }))
}

// Spoken quantities are prose, not numbers: "1000", "90 lakhs total", "2 crore",
// "Not specified, assuming MOQ". Pull out a usable integer where one exists so a
// quotation line can be seeded, and return null when it genuinely is not a
// number so nothing is invented.
export function parseQuantity(text = "") {
  const t = String(text)
  if (!t.trim()) return null
  const lakh = t.match(LAKH_RE)
  if (lakh) return Math.round(Number(lakh[1]) * 100000)
  const crore = t.match(/(\d+(?:\.\d+)?)\s*(crore|karod)/i)
  if (crore) return Math.round(Number(crore[1]) * 10000000)
  const plain = t.replace(/,/g, "").match(/\b(\d{1,9})\b/)
  return plain ? Number(plain[1]) : null
}

// Digits only, so the same caller is recognised whether Anu stored 10 digits,
// a leading zero, or a country code.
export function phoneKey(phone = "") {
  const d = String(phone).replace(/\D/g, "")
  return d.length > 10 ? d.slice(-10) : d
}

// wa.me needs a full international number, but leads are normalised to a bare
// 10-digit Indian mobile before saving, so add the country code.
export function waNumber(phone = "") {
  const d = String(phone).replace(/\D/g, "")
  if (d.length === 10) return `91${d}`
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`
  return d
}

export function prettyPhone(phone = "") {
  const ten = phoneKey(phone)
  return ten.length === 10 ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : phone || ""
}

export function displayName(raw = "") {
  const name = String(raw).trim()
  if (!name) return { name: "Unnamed caller", named: false }
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return { name: "Unnamed caller", named: false }
  return { name, named: true }
}

// Fold every row of a call into the flags that decide how it is presented and
// sorted. Deliberately conservative: these are hints for a human, never a
// classification the page acts on by itself.
export function flagsFor(call) {
  const haystack = call.rows.map((r) => `${r.summary} ${r.quantity} ${r.timeline} ${r.productInterest}`).join(" ")
  const biggest = Math.max(0, ...call.itemsList.map((i) => parseQuantity(i.quantity) || 0), parseQuantity(call.quantity) || 0)
  // An item with no quantity cannot be priced, so the call is not yet quotable
  // even though it looks complete at a glance.
  const missingQty = call.itemsList.some((i) => !i.quantity)
  return {
    support: SUPPORT_RE.test(haystack),
    urgent: URGENT_RE.test(haystack) || URGENT_RE.test(call.timeline || ""),
    hugeQty: BIG_QTY_RE.test(haystack) || (LAKH_RE.test(haystack) && biggest >= 1000000),
    incomplete: !call.itemsList.length || missingQty,
  }
}

// ---- grouping --------------------------------------------------------------

// rows (newest first) -> calls (newest first). Within a call the newest row wins
// every field, but an older row fills a gap the customer mentioned early and Anu
// dropped from a later capture, so nothing said on the call is lost.
export function groupIntoCalls(rows) {
  const byPhone = new Map()
  for (const r of rows) {
    const key = phoneKey(r.customer?.phone) || `anon:${r.id}`
    if (!byPhone.has(key)) byPhone.set(key, [])
    byPhone.get(key).push(r)
  }

  const calls = []
  for (const [key, list] of byPhone) {
    // list is newest first; walk it and cut a new call whenever the gap widens.
    let bucket = []
    const flush = () => {
      if (!bucket.length) return
      const newest = bucket[0]
      const oldest = bucket[bucket.length - 1]
      // Newest non-empty value across the call, newest row first.
      const pick = (get) => bucket.map(get).map((v) => (v || "").trim()).find(Boolean) || ""
      calls.push({
        id: newest.id,
        phoneKey: key,
        rows: bucket,
        captures: bucket.length,
        startedAt: oldest.createdAt,
        endedAt: newest.createdAt,
        status: newest.status || "new",
        reference: newest.reference,
        customer: {
          name: pick((r) => r.customer?.name),
          phone: pick((r) => r.customer?.phone),
          email: pick((r) => r.customer?.email),
          company: pick((r) => r.customer?.company),
          address: pick((r) => r.customer?.address),
        },
        // Newest capture that listed any item wins outright, rather than merging
        // across captures. Anu is instructed to re-send the complete order every
        // time, so the latest list is the order as it actually stands, and an
        // item the customer dropped mid-call stays dropped. Every capture's own
        // list still shows in the call timeline, so nothing becomes invisible.
        itemsList: bucket.map((r) => r.itemsList).find((l) => l && l.length) || [],
        productInterest: pick((r) => r.productInterest),
        quantity: pick((r) => r.quantity),
        timeline: pick((r) => r.timeline),
        summary: pick((r) => r.summary),
      })
      bucket = []
    }
    for (const r of list) {
      if (!bucket.length) { bucket = [r]; continue }
      const prev = bucket[bucket.length - 1]
      const gap = new Date(prev.createdAt).getTime() - new Date(r.createdAt).getTime()
      if (gap <= SESSION_GAP_MS) bucket.push(r)
      else { flush(); bucket = [r] }
    }
    flush()
  }

  calls.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))

  // Number each caller's calls once the full set is known, so "Call 2 of 3"
  // means the second time this person rang, not the second capture in one call.
  const totals = new Map()
  for (const c of calls) totals.set(c.phoneKey, (totals.get(c.phoneKey) || 0) + 1)
  const seen = new Map()
  for (let i = calls.length - 1; i >= 0; i--) {
    const n = (seen.get(calls[i].phoneKey) || 0) + 1
    seen.set(calls[i].phoneKey, n)
    calls[i].callIndex = n
    calls[i].callTotal = totals.get(calls[i].phoneKey)
  }
  return calls
}

// ---- quotation hand-off ----------------------------------------------------

// The `fromEnquiry` state handed to the quotation editor, pre-filled from the
// call. The product and quantity Anu captured seed the first line; the rate is
// left at zero because a voice call never produces a price worth trusting.
export function buildQuotationState(call) {
  // One quotation line per item, so an order the customer grew during the call
  // arrives as the order they actually agreed to, cross-sells included.
  const lines = call.itemsList.length
    ? call.itemsList.map((it) => {
        const n = parseQuantity(it.quantity)
        return newLine({
          description: [it.product, it.notes].filter(Boolean).join(", "),
          quantity: n && n > 0 ? n : 1,
        })
      })
    : [newLine({ description: call.productInterest || "", quantity: parseQuantity(call.quantity) || 1 })]

  const context = [
    call.summary,
    call.timeline ? `Timeline: ${call.timeline}` : "",
    `Captured by Anu on ${formatDateTime(call.endedAt)} (${call.reference})`,
  ].filter(Boolean).join(" · ")

  return {
    id: call.rows[0].id,
    customer: {
      name: call.named ? call.customer.name : "",
      company: call.customer.company,
      email: call.customer.email,
      phone: call.customer.phone,
      address: call.customer.address,
    },
    lines,
    message: context,
  }
}
