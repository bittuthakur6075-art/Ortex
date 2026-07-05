// Edge Function: indiamart-pull
//
// Pulls buyer enquiries from IndiaMART's Lead Manager Pull API (v2) and files
// them into the `enquiries` table (source = "IndiaMART"), de-duplicated on
// UNIQUE_QUERY_ID. The IndiaMART CRM key + enable flag + last-pull timestamp
// live in the settings row (integrations.indiamart), edited from the admin's
// Settings page — so the non-technical setup is just "paste your key".
//
// Callable by (a) an admin from the "Sync now" button, or (b) the scheduler
// (pg_cron) which passes the service-role key. Deploy normally (verify_jwt on).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const pad = (n: number) => String(n).padStart(2, "0")
// IndiaMART Pull v2 timestamp format: DD-Mon-YYYYHH:MM:SS
const imTime = (d: Date) =>
  `${pad(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`

function toEnquiryDoc(q: Record<string, string>) {
  return {
    source: "IndiaMART",
    status: "new",
    starred: false,
    owner: "",
    customer: {
      name: q.SENDER_NAME || "",
      company: q.SENDER_COMPANY || "",
      email: q.SENDER_EMAIL || "",
      phone: q.SENDER_MOBILE || q.SENDER_PHONE || "",
      city: q.SENDER_CITY || "",
      state: q.SENDER_STATE || "",
      address: q.SENDER_ADDRESS || "",
    },
    productInterest: q.QUERY_PRODUCT_NAME || q.QUERY_MCAT_NAME || "",
    message: q.QUERY_MESSAGE || q.SUBJECT || "",
    notes: "",
    indiamart: { queryId: q.UNIQUE_QUERY_ID || q.QUERY_ID || null, queryTime: q.QUERY_TIME || null, raw: q },
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok")

  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "")

  // Authorize: the scheduler passes the service-role key; a human must be admin.
  let authorized = bearer === service
  if (!authorized) {
    const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${bearer}` } } })
    const { data: u } = await caller.auth.getUser()
    if (u?.user) {
      const { data: prof } = await caller.from("profiles").select("role, active").eq("id", u.user.id).maybeSingle()
      authorized = prof?.role === "admin" && prof?.active
    }
  }
  if (!authorized) return json({ error: "Admin access required" }, 403)

  const db = createClient(url, service, { auth: { persistSession: false } })

  // Read the IndiaMART config out of settings.
  const { data: settingsRow } = await db.from("settings").select("doc").eq("id", true).maybeSingle()
  const doc = settingsRow?.doc || {}
  const im = doc.integrations?.indiamart || {}
  if (!im.enabled || !im.crmKey) return json({ skipped: true, reason: "IndiaMART sync is disabled or the key is missing" })

  const end = new Date()
  const start = im.lastPull ? new Date(im.lastPull) : new Date(end.getTime() - 7 * 86400000)
  const apiUrl = `https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=${encodeURIComponent(im.crmKey)}&start_time=${encodeURIComponent(imTime(start))}&end_time=${encodeURIComponent(imTime(end))}`

  let payload: Record<string, unknown>
  try {
    const r = await fetch(apiUrl)
    payload = await r.json()
  } catch (e) {
    return json({ error: `IndiaMART request failed: ${(e as Error).message}` }, 502)
  }

  // IndiaMART returns CODE 200 on success; anything else is an error/no-data.
  if (Number(payload.CODE) !== 200) {
    const msg = String(payload.MESSAGE || payload.STATUS || "IndiaMART returned no data")
    await saveResult(db, doc, end, `Error: ${msg}`)
    return json({ error: msg, code: payload.CODE }, 200)
  }

  const leads = Array.isArray(payload.RESPONSE) ? (payload.RESPONSE as Record<string, string>[]) : []
  let inserted = 0
  let duplicates = 0
  for (const lead of leads) {
    const qid = lead.UNIQUE_QUERY_ID || lead.QUERY_ID
    if (qid) {
      const { data: existing } = await db.from("enquiries").select("id").eq("doc->indiamart->>queryId", qid).maybeSingle()
      if (existing) {
        duplicates++
        continue
      }
    }
    const { error } = await db.from("enquiries").insert({ doc: toEnquiryDoc(lead) })
    if (!error) inserted++
  }

  await saveResult(db, doc, end, `Pulled ${leads.length}, added ${inserted}, ${duplicates} dup`)
  return json({ ok: true, total: leads.length, inserted, duplicates })
})

// Persist the last-pull timestamp + a short human result back into settings.
async function saveResult(db: ReturnType<typeof createClient>, doc: Record<string, unknown>, end: Date, result: string) {
  const integrations = (doc.integrations as Record<string, unknown>) || {}
  const indiamart = (integrations.indiamart as Record<string, unknown>) || {}
  const nextDoc = {
    ...doc,
    integrations: { ...integrations, indiamart: { ...indiamart, lastPull: end.toISOString(), lastResult: result } },
  }
  await db.from("settings").update({ doc: nextDoc }).eq("id", true)
}
