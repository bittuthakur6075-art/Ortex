// Edge Function: push-notify
//
// Sends a new lead to the phones of everyone allowed to see it, through Firebase
// Cloud Messaging, so it arrives even when the field-sales app is closed.
//
// Called by the `enquiries_push_notify` trigger (migration 0031) through pg_net
// with `{ table: "enquiries", id }` and an `x-push-secret` header; never by a
// browser. Deployed with --no-verify-jwt because pg_net sends no user JWT; the
// shared secret is the guard instead.
//
// WHO: active staff whose profile grants the lead's module (the console's own
// rule, has_module_access): `enquiries` for a website or IndiaMART lead,
// `voice-leads` for one of Anu's calls; admins get both. WHAT: the same words
// and the same notification id the app builds itself (Ortex.Mobile
// src/domain/notifications.ts: `enq-new-<id>`, `voice-new-<id>`), sent as the
// Android tag, so when the app is alive and posts its own richer copy (with
// Call / WhatsApp buttons), the two replace each other instead of stacking.
//
// Anu saves a call several times as it goes (each capture is a row), so a voice
// row rings only when it is the FIRST capture from that number in 15 minutes.
//
// Deploy:
//   supabase functions deploy push-notify --no-verify-jwt
//   supabase secrets set PUSH_NOTIFY_SECRET=<same value as the Vault secret>
//   supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { json } from "../_shared/http.ts"
import { sendToTokens, serviceAccount } from "../_shared/fcm.ts"

// Must equal VOICE_SOURCE in Ortex.Mobile/src/domain/voice.ts.
const VOICE_SOURCE = "Voice assistant (Anu)"
const CAPTURE_WINDOW_MS = 15 * 60 * 1000
// Must equal CHANNEL_LEADS in Ortex.Mobile/src/lib/push.ts.
const CHANNEL_LEADS = "leads_v3"

function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

const digits = (s: unknown) => String(s || "").replace(/\D/g, "").slice(-10)
const pretty = (d: string) => (d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d)
const clean = (s: unknown) => String(s || "").trim()

type Doc = Record<string, any>

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405)

  const expected = Deno.env.get("PUSH_NOTIFY_SECRET") || ""
  if (!expected || !secretsMatch(req.headers.get("x-push-secret") || "", expected)) {
    return json({ error: "unauthorised" }, 401)
  }
  const sa = serviceAccount()
  if (!sa) return json({ skipped: "FIREBASE_SERVICE_ACCOUNT is not set" })

  const { table, id } = (await req.json().catch(() => ({}))) as { table?: string; id?: string }
  if (table !== "enquiries" || !id) return json({ error: "expected { table: 'enquiries', id }" }, 400)

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  })

  const { data: row } = await db.from("enquiries").select("id, doc, created_at").eq("id", id).maybeSingle()
  if (!row) return json({ skipped: "not found" })
  const doc = (row.doc || {}) as Doc
  if ((doc.status || "new") !== "new") return json({ skipped: "not new" })

  const voice = doc.source === VOICE_SOURCE
  const phone = digits(doc.customer?.phone)

  if (voice && phone) {
    // An earlier capture of the same call already rang.
    const since = new Date(new Date(row.created_at).getTime() - CAPTURE_WINDOW_MS).toISOString()
    const { data: earlier } = await db
      .from("enquiries")
      .select("id, doc")
      .gte("created_at", since)
      .lt("created_at", row.created_at)
      .limit(50)
    const sameCall = (earlier || []).some(
      (r: { doc: Doc }) => r.doc?.source === VOICE_SOURCE && digits(r.doc?.customer?.phone) === phone,
    )
    if (sameCall) return json({ skipped: "later capture of a call already announced" })
  }

  // Who may see it.
  const module = voice ? "voice-leads" : "enquiries"
  const { data: people } = await db.from("profiles").select("id, role, modules, active")
  const allowed = (people || [])
    .filter((p: Doc) => p.active !== false)
    .filter((p: Doc) => p.role === "admin" || (Array.isArray(p.modules) && p.modules.includes(module)))
    .map((p: Doc) => p.id as string)
  if (!allowed.length) return json({ skipped: "nobody has access" })

  const { data: devices } = await db.from("push_devices").select("token").in("user_id", allowed)
  const tokens = [...new Set((devices || []).map((d: { token: string }) => d.token))]
  if (!tokens.length) return json({ skipped: "no registered phones" })

  // The words, as the app writes them.
  const name = clean(doc.customer?.name) || clean(doc.customer?.company) || "Unknown contact"
  const company = clean(doc.customer?.company)
  const wanted = clean(doc.productInterest) || "Nothing captured yet"
  const city = clean(doc.customer?.address).split(",")[0].trim()
  const detail = [wanted, phone ? pretty(phone) : "No number", voice ? "" : city, voice ? "" : clean(doc.source)]
    .filter(Boolean)
    .join(" · ")
  const title = voice
    ? `${name} spoke to Anu`
    : company && company !== name
      ? `New enquiry · ${name} (${company})`
      : `New enquiry · ${name}`
  const tag = voice ? `voice-new-${row.id}` : `enq-new-${row.id}`

  const results = await sendToTokens(sa, tokens, {
    title,
    body: detail,
    tag,
    channelId: CHANNEL_LEADS,
    // Read by Ortex.Mobile's response listener (lib/push.ts payloadFromResponse).
    data: {
      id: tag,
      targetScreen: voice ? "VoiceCallDetail" : "EnquiryDetail",
      targetId: String(row.id),
      phone,
      title,
      remote: "1",
    },
  })

  const gone = results.filter((r) => r.unregistered).map((r) => r.token)
  if (gone.length) await db.from("push_devices").delete().in("token", gone)

  return json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.unregistered).map((r) => r.error),
    removed: gone.length,
  })
})
