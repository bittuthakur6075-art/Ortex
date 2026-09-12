import { submitEnquiry } from "../../../lib/leads"

// ---- Lead capture: validation + persistence ---------------------------------
//
// Voice-captured details are unreliable: a name or WhatsApp number spoken over a
// call can arrive mis-heard, with words, spaces, a country code, or too many or
// too few digits, and a model left to itself will happily save "sir" as a name
// or "around five hundred" as a quantity. So the page checks every capture
// itself and tells Anu, through the tool reply, exactly what is missing or wrong.

// The five details every call has to end with, in the order Anu asks for them.
// The first missing one is what she is told to ask next.
export const REQUIRED_FIELDS = ["name", "phone", "items", "timeline", "city"]

// How each field is named back to Anu in a tool reply.
export const SPOKEN_FIELD = {
  name: "customer's name",
  phone: "WhatsApp number",
  items: "products with a quantity for each",
  timeline: "timeline",
  city: "delivery city",
}

// Stand-ins used instead of a name. Mirrors PLACEHOLDER_NAMES in
// Ortex.Admin/src/pages/voice-leads/helpers.js, which flags the same words.
const PLACEHOLDER_NAMES = new Set([
  "customer", "grahak", "sir", "madam", "unknown", "caller", "test", "testing",
  "na", "n/a", "none", "anonymous", "user", "client", "aap", "ji",
])

// Above this a quantity is repeated back rather than trusted (10 lakh pieces).
const MAX_SANE_QTY = 1000000

// Latin or Devanagari letters, so a filler or a digit run is not taken as a word.
const letterCount = (s) => (String(s).match(/[a-zA-Zऀ-ॿ]/g) || []).length

// Normalise the phone to a bare 10-digit Indian mobile.
export function normalizePhone(raw = "") {
  let digits = String(raw).replace(/\D+/g, "")
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2) // +91 / 91
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1) // leading 0
  return digits
}

// A correctly-formatted number can still be an obvious placeholder a customer
// rattles off to dodge the question: all-same digits (9999999999), or a straight
// run up or down the keypad (1234567890, 9876543210, 9123456789...). Reject those
// so a junk lead never reaches the Admin.
export function isFakePhone(digits) {
  if (/^(\d)\1{9}$/.test(digits)) return true // all identical, e.g. 9999999999
  // Longest run that steps +1 (up the keypad) or -1 (down), wrapping at 9/0. A
  // real mobile never has an 8-long ladder, so this catches 1234567890,
  // 9876543210, 9123456789 and the like without flagging genuine numbers.
  let asc = 1, desc = 1, maxAsc = 1, maxDesc = 1
  for (let i = 1; i < digits.length; i++) {
    const cur = Number(digits[i]), prev = Number(digits[i - 1])
    asc = cur === (prev + 1) % 10 ? asc + 1 : 1
    desc = cur === (prev + 9) % 10 ? desc + 1 : 1
    maxAsc = Math.max(maxAsc, asc)
    maxDesc = Math.max(maxDesc, desc)
  }
  return maxAsc >= 8 || maxDesc >= 8
}

// Anu is told to send digits, but a quantity still arrives as "500 pieces",
// "5,000", "2k", "2 hazaar", "1.5 lakh" or "2 crore". Pull out the number, or
// null when there genuinely is none, so nothing is invented. The Indian units
// are checked first: read as a plain number, "2 crore" would become 2 pieces.
export function parseQuantity(raw) {
  const t = String(raw ?? "").toLowerCase().replace(/,/g, "").trim()
  if (!t) return null
  const crore = t.match(/(\d+(?:\.\d+)?)\s*(crore|crores|karod|karor)\b/)
  if (crore) return Math.round(Number(crore[1]) * 10000000)
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|lakhs)\b/)
  if (lakh) return Math.round(Number(lakh[1]) * 100000)
  const thousand = t.match(/(\d+(?:\.\d+)?)\s*(k|thousand|hazaar|hazar|hajar)\b/)
  if (thousand) return Math.round(Number(thousand[1]) * 1000)
  const plain = t.match(/\d+(?:\.\d+)?/)
  return plain ? Math.round(Number(plain[0])) : null
}

// An order is a list, not a single product: a customer who takes the lanyard
// cross-sell wants lanyards AND ID holders. Anu sends `items` for those, and the
// bare `product`/`quantity` pair for a one-line order, so fold both into the
// same shape and let the Admin render one list either way. A quantity that
// parses is stored as plain digits, so the console seeds quotation lines from it.
export function normalizeItems(args = {}) {
  const tidy = (it) => {
    const quantity = String(it?.quantity ?? "").trim()
    const n = parseQuantity(quantity)
    return {
      product: String(it?.product || "").trim(),
      quantity: n && n > 0 ? String(n) : quantity,
      notes: String(it?.notes || "").trim(),
    }
  }
  const listed = (Array.isArray(args.items) ? args.items : []).map(tidy).filter((it) => it.product)
  if (listed.length) return listed
  const one = tidy({ product: args.product, quantity: args.quantity })
  return one.product ? [one] : []
}

// Returns
//   ok        name and phone are valid, so the lead can be saved
//   errors    why it cannot be saved (name or phone)
//   missing   REQUIRED_FIELDS still absent or unusable, in asking order
//   problems  specific things to check with the customer, in plain words
//   complete  saveable and nothing missing
// plus the normalised name, phone, city, timeline and items.
export function validateLead(args = {}) {
  const errors = []
  const problems = []
  const missing = new Set()

  const name = String(args.name || "").trim()
  const phone = normalizePhone(args.phone)
  const city = String(args.city || "").trim()
  const timeline = String(args.timeline || "").trim()
  const items = normalizeItems(args)

  if (letterCount(name) < 2 || PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    errors.push("the name is missing, unclear, or a placeholder such as 'sir' or 'customer'")
  }
  // Indian mobile: exactly 10 digits, first digit 6-9.
  if (!/^[6-9]\d{9}$/.test(phone)) {
    errors.push("the WhatsApp number is not a valid 10-digit Indian mobile")
  } else if (isFakePhone(phone)) {
    errors.push("the WhatsApp number looks like a placeholder, not a real mobile")
  }

  if (!items.length) missing.add("items")
  for (const it of items) {
    const n = parseQuantity(it.quantity)
    if (!it.quantity) {
      missing.add("items")
      problems.push(`there is no quantity yet for ${it.product}`)
    } else if (n === null || n <= 0) {
      missing.add("items")
      problems.push(`the quantity for ${it.product} ("${it.quantity}") is not a number`)
    } else if (n > MAX_SANE_QTY) {
      problems.push(`${n} pieces of ${it.product} is unusually large, so repeat the figure back to confirm it`)
    }
  }

  if (!timeline) missing.add("timeline")

  if (!city) missing.add("city")
  else if (letterCount(city) < 2) {
    missing.add("city")
    problems.push(`"${city}" does not sound like a city name`)
  }

  const ordered = REQUIRED_FIELDS.filter((k) => missing.has(k))
  const ok = errors.length === 0
  return { ok, name, phone, city, timeline, items, errors, problems, missing: ordered, complete: ok && ordered.length === 0 }
}

// Persist a voice lead into the shared enquiries backend (same table the Admin
// reads), tagged so it shows in the Admin "Voice calls" section. `call` ties
// every row of one conversation together and points at its recording:
// { id, recording, confirmed, complete }.
export function saveVoiceLead(args = {}, call = null) {
  const items = normalizeItems(args)
  // A one-line order keeps the original "Qty: x" suffix so the Admin's fallback
  // parse and every lead saved before `items` existed still read correctly.
  // Multi-item orders ride on the structured array and get a readable digest.
  // Anu often writes the same phrase into both `summary` and `use_case`
  // ("Company annual event"), so the digest would read it back twice.
  const summary = String(args.summary || "").trim()
  const useCase = String(args.use_case || "").trim()
  const parts = [
    summary,
    useCase && !summary.toLowerCase().includes(useCase.toLowerCase()) ? `For: ${useCase}` : "",
    items.length > 1
      ? `Items: ${items.map((i) => [i.quantity, i.product].filter(Boolean).join(" x ")).join("; ")}`
      : "",
    items.length === 1 && items[0].quantity ? `Qty: ${items[0].quantity}` : "",
    args.timeline ? `Timeline: ${args.timeline}` : "",
  ].filter(Boolean)
  // Address and company go into the standard `customer` fields the Admin already
  // renders everywhere, so a voice lead converts to a customer record without
  // anyone re-keying the delivery address. City is folded into the address line
  // because a call rarely yields a clean two-part address.
  // A caller who says only "Pune" often reaches us as both address and city;
  // appending blindly wrote "Pune, Pune" onto the customer record.
  const addressLine = String(args.address || "").trim()
  const cityLine = String(args.city || "").trim()
  const address = [addressLine, cityLine && !addressLine.toLowerCase().includes(cityLine.toLowerCase()) ? cityLine : ""]
    .filter(Boolean).join(", ")
  submitEnquiry({
    source: "Voice assistant (Anu)",
    customer: {
      name: (args.name || "").trim(),
      phone: (args.phone || "").trim(),
      email: (args.email || "").trim(),
      company: (args.company || "").trim(),
      address,
    },
    items,
    productInterest: items.map((i) => i.product).join(", "),
    message: parts.join(" · ") || "Voice lead captured by Anu.",
    call,
  }).catch(() => { /* offline outbox handles retries */ })
}
