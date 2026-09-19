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
  if (!id || !["enquiries", "leave_requests", "regularisations"].includes(table || "")) {
    return json({ error: "expected { table: 'enquiries' | 'leave_requests' | 'regularisations', id }" }, 400)
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  })

  if (table === "leave_requests" || table === "regularisations") {
    return json(await attendanceApproval(db, sa, table, id))
  }

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
  // has_module_access(), in TS: admins reach everything; everyone else gets
  // their role's grants (migration 0032, role_permissions) plus their own extras.
  const { data: people } = await db.from("profiles").select("id, role, modules, active")
  const { data: grants } = await db.from("role_permissions").select("role, modules")
  const byRole = new Map<string, string[]>(
    (grants || []).map((g: Doc) => [g.role as string, Array.isArray(g.modules) ? g.modules : []]),
  )
  const allowed = (people || [])
    .filter((p: Doc) => p.active !== false)
    .filter(
      (p: Doc) =>
        p.role === "admin" ||
        p.role === "super_admin" ||
        (Array.isArray(p.modules) && p.modules.includes(module)) ||
        (byRole.get(p.role) || []).includes(module),
    )
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

// ---- attendance approvals (migration 0038) ------------------------------------------------------
//
// A new leave request or correction goes to the admins (never to the person
// who asked); a decision goes to the person who asked. The tag is the same id
// the phone uses when it posts these itself from realtime, so the two copies
// replace each other.

const REMINDERS_CHANNEL = "reminders_v3" // Ortex.Mobile/src/lib/push.ts CHANNEL_REMINDERS
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const dayWords = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
const clockIST = (ts: string) => {
  const d = new Date(new Date(ts).getTime() + 330 * 60000)
  const h = d.getUTCHours()
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

// deno-lint-ignore no-explicit-any
async function attendanceApproval(db: any, sa: any, table: string, id: string) {
  const { data: row } = await db.from(table).select("*").eq("id", id).maybeSingle()
  if (!row) return { skipped: "not found" }

  const { data: people } = await db.from("profiles").select("id, name, email, role, active")
  // deno-lint-ignore no-explicit-any
  const person = (people || []).find((p: any) => p.id === row.user_id)
  const who = clean(person?.name) || clean(person?.email).split("@")[0] || "Someone"

  const isLeave = table === "leave_requests"
  let recipients: string[]
  let title: string
  let body: string
  let targetScreen: string
  const targetId = String(row.id)

  if (row.status === "pending") {
    // To the admins, never the requester.
    recipients = (people || [])
      // deno-lint-ignore no-explicit-any
      .filter((p: any) => p.active !== false && (p.role === "admin" || p.role === "super_admin") && p.id !== row.user_id)
      // deno-lint-ignore no-explicit-any
      .map((p: any) => p.id)
    targetScreen = "AttendanceApprovals"
    if (isLeave) {
      const range = row.from_day === row.to_day ? dayWords(row.from_day) : `${dayWords(row.from_day)} to ${dayWords(row.to_day)}`
      title = `Leave request · ${who}`
      body = `${row.type_code} · ${Number(row.days)} ${Number(row.days) === 1 ? "day" : "days"} · ${range}. ${clean(row.reason)}`
    } else {
      const times = [row.in_at ? `in ${clockIST(row.in_at)}` : "", row.out_at ? `out ${clockIST(row.out_at)}` : ""].filter(Boolean).join(", ")
      title = `Correction request · ${who}`
      body = `${dayWords(row.day)}: ${times}. ${clean(row.reason)}`
    }
  } else if (["approved", "rejected", "cancelled"].includes(row.status) && row.decided_by && row.decided_by !== row.user_id) {
    // To the person who asked, when someone else decided.
    recipients = [row.user_id]
    const verdict = row.status === "approved" ? "approved" : row.status === "rejected" ? "not approved" : "cancelled"
    if (isLeave) {
      const range = row.from_day === row.to_day ? dayWords(row.from_day) : `${dayWords(row.from_day)} to ${dayWords(row.to_day)}`
      title = `Your leave was ${verdict}`
      body = `${row.type_code} · ${range}${row.decision_note ? `. ${clean(row.decision_note)}` : ""}`
      targetScreen = "LeaveRequest"
    } else {
      title = `Your correction was ${verdict}`
      body = `${dayWords(row.day)}${row.decision_note ? `. ${clean(row.decision_note)}` : ""}`
      targetScreen = "AttendanceDay"
    }
  } else {
    return { skipped: "nothing to announce" }
  }

  if (!recipients.length) return { skipped: "nobody to tell" }
  const { data: devices } = await db.from("push_devices").select("token").in("user_id", recipients)
  const tokens = [...new Set((devices || []).map((d: { token: string }) => d.token))]
  if (!tokens.length) return { skipped: "no registered phones" }

  const tag = `${isLeave ? "leave" : "corr"}-${row.status}-${row.id}`
  const results = await sendToTokens(sa, tokens as string[], {
    title,
    body,
    tag,
    channelId: REMINDERS_CHANNEL,
    data: {
      id: tag,
      targetScreen,
      // AttendanceDay is keyed by day, the others by id.
      targetId: targetScreen === "AttendanceDay" ? String(row.day) : targetId,
      phone: "",
      title,
      remote: "1",
    },
  })
  const gone = results.filter((r) => r.unregistered).map((r) => r.token)
  if (gone.length) await db.from("push_devices").delete().in("token", gone)
  return { sent: results.filter((r) => r.ok).length, removed: gone.length }
}
