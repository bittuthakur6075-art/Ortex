// Website lead capture → shared backend.
//
// Contact form and Quote calculator submissions are inserted into the same
// `enquiries` table the admin console reads, so they show up live in the
// back-office (source tags them "Website contact form" / "Quote calculator").
// RLS allows anonymous inserts into enquiries only.
//
// A lead is never dropped. When the insert fails — backend not configured,
// browser offline, transient error — the enquiry goes to a localStorage outbox
// and is replayed on the next page load and whenever the browser comes back
// online. Callers receive `queued` instead of `ok` so they can tell the
// customer the truth and offer WhatsApp as an immediate channel.

import { supabase, hasSupabase } from "./supabaseClient"
import { trackActivity, getTrackingIds } from "./tracker"

const OUTBOX_KEY = "ortex_pending_enquiries"
// Cap the outbox so a permanently misconfigured deploy can't grow unbounded.
const OUTBOX_LIMIT = 25
const RETRY_DELAY_MS = 900

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

export function pendingEnquiryCount() {
  return readOutbox().length
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One insert attempt. Resolves to null on success, or an error message. */
async function insertEnquiry(doc) {
  if (!hasSupabase) return "Backend not configured"
  try {
    const { error } = await supabase.from("enquiries").insert({ doc })
    return error ? error.message : null
  } catch (err) {
    return err?.message || "Network error"
  }
}

/**
 * Replay queued enquiries. Safe to call repeatedly — each success drops its
 * entry, each failure leaves it for the next trigger.
 */
export async function flushOutbox() {
  if (!hasSupabase) return
  for (const doc of readOutbox()) {
    const error = await insertEnquiry(doc)
    if (!error) dequeue(doc.reference)
  }
}

/**
 * @returns {Promise<{ok: true, reference: string} | {queued: true, reference: string, error: string}>}
 */
export async function submitEnquiry({
  source,
  customer,
  productInterest = "",
  message = "",
  notes = "",
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
    message,
    notes,
    submittedAt: new Date().toISOString(),
    tracking: { userId, sessionId },
  }

  // Asynchronously track the submission activity
  const isQuote = source === "Quote calculator"
  trackActivity({
    activityType: isQuote ? "Quote request" : "Contact form submission",
    productId: productInterest,
    metadata: { customer, productName: productInterest, message, reference },
  }).catch((err) => console.error("Tracking failed:", err))

  let error = await insertEnquiry(doc)
  if (error && hasSupabase) {
    // One retry covers the common case — a network blip mid-submit.
    await sleep(RETRY_DELAY_MS)
    error = await insertEnquiry(doc)
  }

  if (!error) return { ok: true, reference }

  enqueue(doc)
  return { queued: true, reference, error }
}
