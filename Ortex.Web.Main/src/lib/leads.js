// Contact form -> the Admin console's `enquiries` table.
//
// The Horizons site this replaces "sent" its form by writing the enquiry into
// the visitor's own localStorage and showing a success toast, so no enquiry
// ever reached Ortex. Here the row goes to the same table Ortex.Web writes, and
// the console lists it as a new lead (source "Website contact form", with
// `site` telling the two websites apart). RLS allows anonymous inserts only,
// capped at 32 KB with field limits (Admin migration 0050).
//
// A lead is never dropped for a reason that can pass. When the insert fails
// (backend not configured, browser offline, a stalled request, the rate limit)
// the enquiry goes to an outbox that is replayed on the next page load and
// whenever the browser comes back online. Callers receive `queued` instead of
// `ok`, so the visitor is told the truth and offered WhatsApp straight away. A
// row the database refuses for good is never queued: callers receive `failed`.
// References are unique in the database (Admin migration 0079), so a retry of
// an insert that did land answers 23505 and counts as saved.
//
// The reference format, outbox and retry match Ortex.Web/src/lib/leads.js.

// The Supabase client (~200 KB) is imported on demand: only a form submit or a
// non-empty outbox needs it, so no other page download carries it.
const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
const getClient = () => import("./supabaseClient").then((m) => m.supabase)

const OUTBOX_KEY = "ortex_main_pending_enquiries"
const OUTBOX_LIMIT = 25
// Voice leads carry a caller's name and number from a call that may have been
// on a shared computer, so they wait in sessionStorage and expire after 2 hours.
const VOICE_OUTBOX_MAX_AGE_MS = 2 * 60 * 60 * 1000
const RETRY_DELAY_MS = 900
const INSERT_TIMEOUT_MS = 20000

export const SITE_TAG = "ortexindustries.in"

// Crockford base32: no I, L, O or U, so a reference read out over the phone
// cannot be written down wrong.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function randomChars(count) {
  const bytes = new Uint8Array(count)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < count; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("")
}

function encodeBase32(value, length) {
  let out = ""
  let n = value
  while (n > 0) {
    out = ALPHABET[n % 32] + out
    n = Math.floor(n / 32)
  }
  return out.slice(-length).padStart(length, "0")
}

/** Short, phone-friendly id stored on the enquiry, so staff can find it. */
export function newReference() {
  return `ORT-${encodeBase32(Date.now(), 4)}${randomChars(7)}`
}

// Storage access itself throws where site data is blocked.
function storage(kind) {
  try {
    return kind === "session" ? globalThis.sessionStorage : globalThis.localStorage
  } catch {
    return null
  }
}

const storeFor = (doc) => storage(doc?.call ? "session" : "local")

function readList(store) {
  try {
    const parsed = JSON.parse(store?.getItem(OUTBOX_KEY) || "[]")
    return Array.isArray(parsed) ? parsed.filter((d) => d && typeof d.reference === "string") : []
  } catch {
    return []
  }
}

function writeList(store, list) {
  try {
    if (list.length) store?.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_LIMIT)))
    else store?.removeItem(OUTBOX_KEY)
  } catch (err) {
    console.warn("Enquiry outbox write failed:", err)
  }
}

const readOutbox = () => [...readList(storage("local")), ...readList(storage("session"))]

const isStale = (doc) =>
  Boolean(doc.call) && Date.now() - (Date.parse(doc.submittedAt) || 0) > VOICE_OUTBOX_MAX_AGE_MS

// A voice call saves the same reference again as the details grow, so a newer
// save replaces the queued one instead of being dropped as a repeat.
function enqueue(doc) {
  const store = storeFor(doc)
  const list = readList(store).filter((d) => d.reference !== doc.reference)
  list.push(doc)
  writeList(store, list)
}

// From both stores: voice rows queued before they moved to sessionStorage
// still sit in localStorage.
function dequeue(doc) {
  for (const store of [storage("local"), storage("session")]) {
    const list = readList(store)
    const rest = list.filter((d) => d.reference !== doc.reference)
    if (rest.length !== list.length) writeList(store, rest)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Postgres refusals that will never pass on a retry: a row-level policy (field
// limits, the 32 KB cap), a CHECK, bad data, a malformed request. The rate
// limit (P0429) and everything else may pass later.
const PERMANENT_CODES = /^(42501|23514|23502|22\w{3}|PGRST1\d\d)$/

/** One insert attempt. Resolves to null on success, or { message, permanent }. */
async function insertEnquiry(doc) {
  if (!hasSupabase) return { message: "Backend not configured", permanent: false }
  // A stalled connection must not leave the visitor watching a spinner: after
  // 20 s the request is aborted (so it cannot land behind the retry) and the
  // outbox takes over.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), INSERT_TIMEOUT_MS)
  try {
    const supabase = await getClient()
    // A voice call keeps one row (Admin migration 0081): its first save inserts
    // and every later save updates that row through save_voice_lead. P0409 means
    // the row can no longer be updated (staff picked it up, or it is over two
    // hours old), so the caller starts a fresh one.
    const request = doc.call
      ? supabase.rpc("save_voice_lead", { p_doc: doc })
      : supabase.from("enquiries").insert({ doc })
    const { error } = await request.abortSignal(controller.signal)
    if (!error || error.code === "23505") return null
    if (error.code === "P0409") return { message: error.message, permanent: true, stale: true }
    return { message: error.message || "Insert failed", permanent: PERMANENT_CODES.test(error.code || "") }
  } catch (err) {
    return { message: err?.message || "Network error", permanent: false }
  } finally {
    clearTimeout(timer)
  }
}

// One replay at a time: the `online` event during a flush would otherwise send
// every queued enquiry twice.
let flushing = null

/** Replay queued enquiries. Safe to call repeatedly. */
export function flushOutbox() {
  if (!hasSupabase || !readOutbox().length) return Promise.resolve()
  if (!flushing) {
    flushing = (async () => {
      for (const doc of readOutbox()) {
        if (isStale(doc)) {
          dequeue(doc)
          continue
        }
        const error = await insertEnquiry(doc)
        if (!error || error.permanent) dequeue(doc)
      }
    })().finally(() => {
      flushing = null
    })
  }
  return flushing
}

/**
 * @returns {Promise<{ok: true, reference: string} | {queued: true, reference: string, error: string} | {failed: true, reference: string, error: string, stale?: true}>}
 */
export async function submitEnquiry({
  customer,
  productInterest = "",
  message = "",
  // Anu (components/ui/live-orty/leads.js, identical to Ortex.Web's) sends her
  // own source, the order's items and { id, recording, confirmed, complete };
  // the contact form sends none of them.
  source = "Website contact form",
  items = [],
  call = null,
  reference = newReference(),
}) {
  // status/starred/owner must be exactly these for the anonymous insert policy.
  const doc = {
    reference,
    source,
    site: SITE_TAG,
    status: "new",
    starred: false,
    owner: "",
    customer,
    productInterest,
    items,
    message,
    notes: "",
    ...(call ? { call } : {}),
    submittedAt: new Date().toISOString(),
  }

  let error = await insertEnquiry(doc)
  if (error && !error.permanent && hasSupabase) {
    // One retry covers the common case, a network blip mid-submit.
    await sleep(RETRY_DELAY_MS)
    error = await insertEnquiry(doc)
  }

  if (!error) return { ok: true, reference }
  if (error.permanent) return { failed: true, reference, error: error.message, ...(error.stale ? { stale: true } : {}) }

  enqueue(doc)
  return { queued: true, reference, error: error.message }
}
