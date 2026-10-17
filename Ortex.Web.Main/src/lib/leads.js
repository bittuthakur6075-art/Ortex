// Contact form -> the Admin console's `enquiries` table.
//
// The Horizons site this replaces "sent" its form by writing the enquiry into
// the visitor's own localStorage and showing a success toast, so no enquiry
// ever reached Ortex. Here the row goes to the same table Ortex.Web writes, and
// the console lists it as a new lead (source "Website contact form", with
// `site` telling the two websites apart). RLS allows anonymous inserts only,
// capped at 32 KB with field limits (Admin migration 0050).
//
// A lead is never dropped. When the insert fails (backend not configured,
// browser offline, a transient error) the enquiry goes to a localStorage outbox
// that is replayed on the next page load and whenever the browser comes back
// online. Callers receive `queued` instead of `ok`, so the visitor is told the
// truth and offered WhatsApp straight away.
//
// The reference format, outbox and retry match Ortex.Web/src/lib/leads.js.

// The Supabase client (~200 KB) is imported on demand: only a form submit or a
// non-empty outbox needs it, so no other page download carries it.
const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
const getClient = () => import("./supabaseClient").then((m) => m.supabase)

const OUTBOX_KEY = "ortex_main_pending_enquiries"
const OUTBOX_LIMIT = 25
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

function readOutbox() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOutbox(list) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_LIMIT)))
  } catch (err) {
    console.warn("Enquiry outbox write failed:", err)
  }
}

function enqueue(doc) {
  const list = readOutbox()
  if (!list.some((d) => d.reference === doc.reference)) {
    list.push(doc)
    writeOutbox(list)
  }
}

function dequeue(reference) {
  writeOutbox(readOutbox().filter((d) => d.reference !== reference))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One insert attempt. Resolves to null on success, or an error message. */
async function insertEnquiry(doc) {
  if (!hasSupabase) return "Backend not configured"
  try {
    // A stalled connection must not leave the visitor watching a spinner.
    const supabase = await getClient()
    const { error } = await Promise.race([
      supabase.from("enquiries").insert({ doc }),
      new Promise((resolve) => setTimeout(() => resolve({ error: { message: "Timed out" } }), INSERT_TIMEOUT_MS)),
    ])
    return error ? error.message : null
  } catch (err) {
    return err?.message || "Network error"
  }
}

/** Replay queued enquiries. Safe to call repeatedly. */
export async function flushOutbox() {
  if (!hasSupabase || !readOutbox().length) return
  for (const doc of readOutbox()) {
    const error = await insertEnquiry(doc)
    if (!error) dequeue(doc.reference)
  }
}

/**
 * @returns {Promise<{ok: true, reference: string} | {queued: true, reference: string, error: string}>}
 */
export async function submitEnquiry({ customer, productInterest = "", message = "", reference = newReference() }) {
  // status/starred/owner must be exactly these for the anonymous insert policy.
  const doc = {
    reference,
    source: "Website contact form",
    site: SITE_TAG,
    status: "new",
    starred: false,
    owner: "",
    customer,
    productInterest,
    items: [],
    message,
    notes: "",
    submittedAt: new Date().toISOString(),
  }

  let error = await insertEnquiry(doc)
  if (error && hasSupabase) {
    // One retry covers the common case, a network blip mid-submit.
    await sleep(RETRY_DELAY_MS)
    error = await insertEnquiry(doc)
  }

  if (!error) return { ok: true, reference }

  enqueue(doc)
  return { queued: true, reference, error }
}
