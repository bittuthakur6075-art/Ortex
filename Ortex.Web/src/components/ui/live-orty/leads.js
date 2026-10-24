import { submitEnquiry } from "../../../lib/leads"
import { ASSISTANT_NAME } from "./shared"

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

// Above this a quantity is repeated back rather than trusted (one lakh pieces,
// the same line the prompt's "PRODUCTS AND QUANTITY" rule draws).
const MAX_SANE_QTY = 100000

// How an off-catalogue line is marked for the sales desk, in the notes rather
// than a field of its own, so it shows up wherever notes are already read.
const CUSTOM_NOTE = "Custom item (not in catalogue)"

// Latin or Devanagari letters, so a filler or a digit run is not taken as a word.
const letterCount = (s) => (String(s).match(/[a-zA-Zऀ-ॿ]/g) || []).length

// Normalise the phone to a bare 10-digit Indian mobile.
export function normalizePhone(raw = "") {
  let digits = String(raw).replace(/\D+/g, "")
  if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4) // 0091
  else if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3) // 091
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2) // +91 / 91
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
// Spoken small numbers, English and Hindi, so "do hazaar" or "five hundred"
// that slips through as words is read rather than sent back as "not a number"
// (which made Anu ask again for a quantity the customer had already given).
//
// The whole spoken number is added up, part by part, the way it is said:
// "1 lakh 50 thousand" is 150000, "teen hazaar paanch sau" 3500, "twenty five
// hundred" 2500. Reading only the first number and unit saved 100000, 3000 and
// 500 for those, which passed validation and seeded a wrong quotation. Only the
// FIRST number in the answer counts ("500 to 1000" is 500). A lone number word
// with no unit ("I do need 500") is not taken as a number, so "do" and "five"
// count only with a unit or another number word next to them.
const NUMBER_WORDS = {
  one: 1, ek: 1, two: 2, do: 2, three: 3, teen: 3, four: 4, char: 4, chaar: 4, five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, chhah: 6, seven: 7, saat: 7, eight: 8, aath: 8, nine: 9, nau: 9, ten: 10, das: 10,
  eleven: 11, gyarah: 11, twelve: 12, barah: 12, thirteen: 13, terah: 13, fourteen: 14, chaudah: 14,
  fifteen: 15, pandrah: 15, sixteen: 16, solah: 16, seventeen: 17, satrah: 17, eighteen: 18, atharah: 18,
  nineteen: 19, unnis: 19, pachees: 25, pachchis: 25,
  dedh: 1.5, dhai: 2.5, adhai: 2.5,
}
// Tens may take a single digit after them ("twenty five"). "saath" (60) is left
// out on purpose: it also means "with" ("logo ke saath 300 keychains").
const TENS = {
  twenty: 20, bees: 20, thirty: 30, tees: 30, forty: 40, chalis: 40, chaalis: 40, fifty: 50, pachaas: 50, pachas: 50,
  sixty: 60, seventy: 70, sattar: 70, eighty: 80, assi: 80, ninety: 90, nabbe: 90,
}
const UNITS = {
  hundred: 100, sau: 100, so: 100,
  k: 1000, thousand: 1000, hazaar: 1000, hazar: 1000, hajar: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000,
  crore: 10000000, crores: 10000000, karod: 10000000, karor: 10000000,
}
// Joining words inside one number: "1 lakh and 50 thousand", "ek lakh aur pachaas hazaar".
const JOINERS = new Set(["and", "aur"])

export function parseQuantity(raw) {
  const tokens = String(raw ?? "").toLowerCase().replace(/,/g, "").match(/\d+(?:\.\d+)?|[a-z]+/g) || []
  let total = 0, current = 0, started = false, digits = false, unit = false, words = 0, prev = ""
  const reset = () => { total = 0; current = 0; started = false; digits = false; unit = false; words = 0; prev = "" }
  // A group that is one bare number word ("do", "five") is not a quantity.
  const weak = () => !digits && !unit && words < 2
  for (const tok of tokens) {
    const isDigit = /^\d/.test(tok)
    const n = isDigit ? Number(tok) : (NUMBER_WORDS[tok] ?? TENS[tok])
    if (n !== undefined) {
      const follows = prev === "unit" || (prev === "tens" && n > 0 && n < 10)
      if (started && !follows) {
        if (!weak()) break
        reset()
      }
      started = true
      current += n
      if (isDigit) digits = true
      else words += 1
      prev = TENS[tok] ? "tens" : isDigit ? "digit" : "num"
    } else if (UNITS[tok] && !(tok === "so" && prev !== "num")) {
      // "so" is "sau" only straight after a number word ("paanch so"), never in
      // English ("500 so please").
      if (!started) continue
      const u = UNITS[tok]
      unit = true
      if (u === 100) current = (current || 1) * 100
      else { total += (current || 1) * u; current = 0 }
      prev = "unit"
    } else if (started && JOINERS.has(tok) && prev === "unit") {
      continue
    } else if (started) {
      if (!weak()) break
      reset()
    }
  }
  if (!started || weak()) return null
  return Math.round(total + current)
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
    // A custom request is marked in the notes rather than a field of its own,
    // so it shows up wherever the console and the phone already read notes.
    const notes = String(it?.notes || "").trim()
    // An item can come back through here more than once in a call (the page
    // re-validates the accumulated order on every capture), and its notes
    // already carry the marker. Without this guard the same line grew a
    // "Custom item" prefix per capture.
    const marked = notes.includes(CUSTOM_NOTE)
    return {
      product: String(it?.product || "").trim(),
      quantity: n && n > 0 ? String(n) : quantity,
      notes: it?.custom && !marked ? [CUSTOM_NOTE, notes].filter(Boolean).join(" · ") : notes,
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
  const errorFields = new Set()
  const problems = []
  const missing = new Set()

  const name = String(args.name || "").trim()
  const phone = normalizePhone(args.phone)
  const city = String(args.city || "").trim()
  const timeline = String(args.timeline || "").trim()
  const items = normalizeItems(args)

  if (letterCount(name) < 2 || PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    errors.push("the name is missing, unclear, or a placeholder such as 'sir' or 'customer'")
    errorFields.add("name")
  }
  // Indian mobile: exactly 10 digits, first digit 6-9.
  if (!/^[6-9]\d{9}$/.test(phone)) {
    errors.push("the WhatsApp number is not a valid 10-digit Indian mobile")
    errorFields.add("phone")
  } else if (isFakePhone(phone)) {
    errors.push("the WhatsApp number looks like a placeholder, not a real mobile")
    errorFields.add("phone")
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
  // Which of the two blocking fields failed, so the reply can ask about that
  // one alone. Told "confirm the name and read the number back" when only the
  // number was mis-heard, Anu makes the customer repeat a name she already had.
  const badName = errorFields.has("name")
  const badPhone = errorFields.has("phone")
  return { ok, name, phone, city, timeline, items, errors, problems, badName, badPhone, missing: ordered, complete: ok && ordered.length === 0 }
}

// Persist a voice lead into the shared enquiries backend (same table the Admin
// reads), tagged so it shows in the Admin "Voice calls" section. `call` names
// the conversation and points at its recording: { id, recording, confirmed,
// complete }. Every save of one conversation passes the same `reference`, so
// it updates one row instead of adding another (Admin migration 0081).
export function saveVoiceLead(args = {}, call = null, reference = undefined) {
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
  // Returned so the recording upload can wait for this row (its bucket policy
  // needs it to exist).
  return submitEnquiry({
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
    message: parts.join(" · ") || `Voice lead captured by ${ASSISTANT_NAME}.`,
    call,
    reference,
  }).catch(() => null) // offline outbox handles retries
}
