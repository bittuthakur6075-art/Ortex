// Website lead capture → shared backend.
//
// Contact form and Quote calculator submissions are inserted into the same
// `enquiries` table the admin console reads, so they show up live in the
// back-office (source tags them "Website contact form" / "Quote calculator").
// RLS allows anonymous inserts into enquiries only.
//
// A lead is never dropped for a reason that can pass. When the insert fails
// because the backend is not configured, the browser is offline, the request
// stalled or the rate limit refused it, the enquiry goes to an outbox and is
// replayed on the next page load and whenever the browser comes back online.
// Callers receive `queued` instead of `ok` so they can tell the customer the
// truth and offer WhatsApp as an immediate channel. A row the database refuses
// for good (too long, a broken rule) is never queued, since it would fail on
// every replay: callers receive `failed` and ask for another channel.
//
// Every row carries a reference minted here, and the database keeps references
// unique (Admin migration 0079), so a retry of an insert that did land is
// answered 23505 and counts as saved instead of making a second row.

import { supabase, hasSupabase } from "./supabaseClient"
import { trackActivity, getTrackingIds } from "./tracker"

const OUTBOX_KEY = "ortex_pending_enquiries"
// Cap the outbox so a permanently misconfigured deploy can't grow unbounded.
const OUTBOX_LIMIT = 25
// Voice leads carry a caller's name and number from a call that may have been
// on a shared computer, so they wait in sessionStorage (gone with the tab, like
// the call memory) and are given up after two hours.
const VOICE_OUTBOX_MAX_AGE_MS = 2 * 60 * 60 * 1000
const RETRY_DELAY_MS = 900
const INSERT_TIMEOUT_MS = 20000

// Crockford base32 — no I, L, O or U, so a reference read aloud over the phone
// can't be transcribed wrong. 256 is divisible by 32, so `byte % 32` is unbiased.
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

/**
 * Short, phone-friendly id stored on the enquiry itself, so a customer quoting
 * it can actually be found in the admin console.
 *
 * A coarse timestamp prefix keeps references roughly sortable; the seven random
 * characters carry the uniqueness. It doubles as the outbox dedupe key and the
 * artwork storage folder, so a collision would drop a lead — hence the CSPRNG
 * rather than Math.random().
 */
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
// PostgREST answers PGRST202 (404) for an RPC the database does not have.
const missingFunction = (error) =>
  error.code === "PGRST202" || /could not find the function/i.test(error.message || "")

const PERMANENT_CODES = /^(42501|23514|23502|22\w{3}|PGRST1\d\d)$/

/**
 * One insert attempt. Resolves to null on success, or { message, permanent }.
 * A unique-reference conflict (23505) means an earlier attempt that we gave up
 * on did land, so it counts as saved.
 */
async function insertEnquiry(doc) {
  if (!hasSupabase) return { message: "Backend not configured", permanent: false }
  // A stalled connection must not leave the visitor watching a spinner: after
  // 20 s the request is aborted and the outbox takes over. Aborting matters, as
  // a request left running could still land after the retry.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), INSERT_TIMEOUT_MS)
  try {
    // A voice call keeps one row (Admin migration 0081): its first save inserts
    // and every later save updates that row through save_voice_lead. P0409 means
    // the row can no longer be updated (staff picked it up, or it is over two
    // hours old), so the caller starts a fresh one.
    const request = doc.call
      ? supabase.rpc("save_voice_lead", { p_doc: doc })
      : supabase.from("enquiries").insert({ doc })
    let { error } = await request.abortSignal(controller.signal)
    // A database without 0081 has no save_voice_lead: save the row the old way
    // (one row per save) rather than lose the lead.
    if (error && doc.call && missingFunction(error)) {
      const retry = await supabase.from("enquiries").insert({ doc }).abortSignal(controller.signal)
      error = retry.error
    }
    if (!error || error.code === "23505") return null
    if (error.code === "P0409") return { message: error.message, permanent: true, stale: true }
    return { message: error.message || "Insert failed", permanent: PERMANENT_CODES.test(error.code || "") }
  } catch (err) {
    return { message: err?.message || "Network error", permanent: false }
  } finally {
    clearTimeout(timer)
  }
}

// One replay at a time: the `online` event during a flush, or a second call
// from a double effect, would otherwise send every queued enquiry twice.
let flushing = null

/**
 * Replay queued enquiries. Safe to call repeatedly: each success (or refusal
 * for good) drops its entry, each passing failure leaves it for the next trigger.
 */
export function flushOutbox() {
  if (!hasSupabase) return Promise.resolve()
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
  source,
  customer,
  productInterest = "",
  items = [],
  message = "",
  notes = "",
  // Voice calls only: { id, recording, confirmed, complete } from live-orty,
  // tying every row of one conversation to its recording.
  call = null,
  // Quote calculator only: { path, fileName } of the artwork it uploads right
  // after this insert. The storage policy accepts that one file only when a
  // fresh enquiry names it (Admin migration 0079).
  artwork = null,
  reference = newReference(),
}) {
  // Stamp the visitor's tracking ids so the admin Growth dashboard can join this
  // enquiry back to the browsing session that produced it (deterministic
  // attribution instead of guessing by email/phone).
  const { userId, sessionId } = getTrackingIds()

  const doc = {
    reference,
    source,
    status: "new",
    starred: false,
    owner: "",
    customer,
    productInterest,
    // Every product on the order, each with its own quantity. `productInterest`
    // stays the flat comma-joined string every existing screen and search box
    // already reads; `items` is what a multi-line order actually rides on.
    items,
    message,
    notes,
    ...(call ? { call } : {}),
    ...(artwork ? { artwork } : {}),
    submittedAt: new Date().toISOString(),
    tracking: { userId, sessionId },
  }

  // Asynchronously track the submission activity. Not for a voice call: Anu
  // saves on every capture_lead, which logged one "Contact form submission"
  // (with the caller's name and number) per detail she heard. The lead row
  // itself is the record of the call.
  const isQuote = source === "Quote calculator"
  if (!call) {
    trackActivity({
      activityType: isQuote ? "Quote request" : "Contact form submission",
      productId: productInterest,
      metadata: { customer, productName: productInterest, message, reference },
    }).catch((err) => console.error("Tracking failed:", err))
  }

  let error = await insertEnquiry(doc)
  if (error && !error.permanent && hasSupabase) {
    // One retry covers the common case: a network blip mid-submit.
    await sleep(RETRY_DELAY_MS)
    error = await insertEnquiry(doc)
  }

  if (!error) return { ok: true, reference }
  if (error.permanent) return { failed: true, reference, error: error.message, ...(error.stale ? { stale: true } : {}) }

  enqueue(doc)
  return { queued: true, reference, error: error.message }
}
