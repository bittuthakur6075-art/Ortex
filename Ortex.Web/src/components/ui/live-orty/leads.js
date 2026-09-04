import { submitEnquiry } from "../../../lib/leads"

// ---- Lead capture: validation + persistence ---------------------------------

// Voice-captured details are unreliable: a name or WhatsApp number spoken over a
// call can arrive mis-heard, with words, spaces, a country code, or too many/few
// digits. Normalise the phone to a bare 10-digit Indian mobile and reject
// anything that clearly is not one, so Anu can read it back and re-ask instead of
// saving a dead lead.
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

// Returns { ok, name, phone, errors }. `phone` is the normalised 10-digit form.
export function validateLead(args = {}) {
  const errors = []
  const name = String(args.name || "").trim()
  const phone = normalizePhone(args.phone)

  // At least two letters (Latin or Devanagari) so a filler like "um" or a stray
  // digit run is not accepted as a name.
  if ((name.match(/[a-zA-Zऀ-ॿ]/g) || []).length < 2) {
    errors.push("name is missing or unclear")
  }
  // Indian mobile: exactly 10 digits, first digit 6-9.
  if (!/^[6-9]\d{9}$/.test(phone)) {
    errors.push("WhatsApp number is not a valid 10-digit Indian mobile")
  } else if (isFakePhone(phone)) {
    errors.push("WhatsApp number looks like a placeholder, not a real mobile")
  }
  return { ok: errors.length === 0, name, phone, errors }
}

// Persist a summarised voice lead into the shared enquiries backend (same table
// the Admin reads), tagged so it shows in the Admin "Voice Leads" section.
// An order is a list, not a single product: a customer who takes the lanyard
// cross-sell wants lanyards AND ID holders. Anu sends `items` for those, and the
// bare `product`/`quantity` pair for a one-line order, so fold both into the
// same shape and let the Admin render one list either way.
export function normalizeItems(args = {}) {
  const listed = (Array.isArray(args.items) ? args.items : [])
    .map((it) => ({
      product: String(it?.product || "").trim(),
      quantity: String(it?.quantity || "").trim(),
      notes: String(it?.notes || "").trim(),
    }))
    .filter((it) => it.product)
  if (listed.length) return listed
  const product = String(args.product || "").trim()
  return product ? [{ product, quantity: String(args.quantity || "").trim(), notes: "" }] : []
}

export function saveVoiceLead(args = {}) {
  const items = normalizeItems(args)
  // A one-line order keeps the original "Qty: x" suffix so the Admin's fallback
  // parse and every lead saved before `items` existed still read correctly.
  // Multi-item orders ride on the structured array and get a readable digest.
  const parts = [
    args.summary,
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
  const address = [args.address, args.city].map((v) => (v || "").trim()).filter(Boolean).join(", ")
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
  }).catch(() => { /* offline outbox handles retries */ })
}
