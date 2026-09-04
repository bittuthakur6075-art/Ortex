// Trigger events a rule can actually fire on. These are exactly the eventTypes
// Ortex.Web's tracker.js emits AND the automation-engine accepts — a rule on
// anything else can never run. Keep in sync with ALLOWED_EVENTS in
// supabase/functions/automation-engine/index.ts.
export const TRIGGER_EVENTS = [
  { value: "quote_requested", label: "quote_requested (Quote Builder Submission)" },
  { value: "contact_form_submitted", label: "contact_form_submitted (Contact Inquiry)" },
  { value: "product_visited", label: "product_visited (Product Page View)" },
  { value: "search_performed", label: "search_performed (Product Search)" },
  { value: "cart_added", label: "cart_added (Added to Quote Cart)" },
  { value: "pdf_downloaded", label: "pdf_downloaded (Catalogue Download)" },
]

// user_activities and event_logs accept anonymous inserts from the public site
// and grow without bound. We load a recent window rather than the whole table,
// render it a page at a time, and say so on screen when the window is smaller
// than the table — silently analysing "the newest N rows" is how a dashboard
// starts lying. Rows per page in the two log tables.
export const LOG_WINDOW = 5000
export const PAGE_SIZE = 50

// Opening wa.me hands a pre-filled chat to WhatsApp Web; nothing reports back.
// So "delivered"/"read" are only ever written by the demo seed and the local
// mock — against Supabase a log goes queued -> sent and stops. Scoring success
// as delivered/read therefore pinned the headline metric at 0% and made every
// message the admin actually sent vanish from the queue tiles (`sent` matched
// none of them). We report dispatch, which is the thing this integration knows.
export const WA_DISPATCHED = ["sent", "delivered", "read"]
export const WA_PENDING = ["queued", "sending"]

export const EVENT_TONES = {
  quote_requested: "amber",
  contact_form_submitted: "blue",
  cart_added: "cyan",
  cart_removed: "rose",
  product_visited: "slate",
  search_performed: "slate",
  pdf_downloaded: "slate",
}

// PII masking. Both helpers work off digit/character positions rather than
// matching an expected format, and mask *everything* when the value can't be
// parsed. The previous phone mask was a single regex over `+dd-ddd dddd ddd`,
// so a bare 10-digit number — what visitors actually type — matched nothing and
// String.replace returned it untouched: the UI claimed PII was hidden while
// rendering it in full. A mask that fails open is worse than no mask at all.
export const maskPhone = (phone, mask = true) => {
  if (!phone) return ""
  const s = String(phone)
  if (!mask) return s
  const digitCount = (s.match(/\d/g) || []).length
  if (digitCount <= 4) return s.replace(/\d/g, "•")
  const keepFrom = digitCount - 4
  let seen = 0
  return s.replace(/\d/g, (d) => (seen++ >= keepFrom ? d : "•"))
}

export const maskEmail = (email, mask = true) => {
  if (!email) return ""
  const s = String(email)
  if (!mask) return s
  const at = s.lastIndexOf("@")
  if (at < 1) return "•".repeat(s.length)
  return `${s[0]}${"•".repeat(at - 1)}${s.slice(at)}`
}
