// Edge Function: indiamart-pull
//
// Pulls buyer enquiries from IndiaMART's Lead Manager Pull API (v2) and files
// them into the `enquiries` table (source = "IndiaMART"), de-duplicated on
// UNIQUE_QUERY_ID. One IndiaMART account per company (migration 0075): the CRM
// key, enable flag and last pull of each live in the admin-only settings row at
// integrations.indiamartByCompany[<company id>] = { crmKey, enabled, lastPull,
// lastResult }. The older single block, integrations.indiamart, is Ortex's
// account until indiamartByCompany.ortex exists. Each company's enquiries are
// filed under its own company_id.
//
// Callable by (a) an admin from the "Sync now" button, or (b) the scheduler
// (pg_cron) which passes the service-role key. Every enabled account is pulled
// unless the request names one: ?company=<id> or { "company": "<id>" } in the
// body. Deploy normally (verify_jwt on).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { json } from "../_shared/http.ts"
import type { Db } from "../_shared/auth.ts"

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
      authorized = (prof?.role === "admin" || prof?.role === "super_admin") && prof?.active
    }
  }
  if (!authorized) return json({ error: "Admin access required" }, 403)

  const db = createClient(url, service, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))
  const only = String(new URL(req.url).searchParams.get("company") || body?.company || "").trim()

  const { data: settingsRow } = await db.from("settings").select("doc").eq("id", true).maybeSingle()
  const { data: companies } = await db.from("companies").select("id")
  const known = new Set((companies || []).map((c: { id: string }) => c.id))
  if (only && !known.has(only)) return json({ error: `Unknown company "${only}"` }, 400)

  const due = accounts(settingsRow?.doc || {}).filter(
    (a) => known.has(a.company) && (!only || a.company === only) && a.im.enabled && a.im.crmKey,
  )
  if (!due.length) {
    return json({ skipped: true, reason: `IndiaMART sync is disabled or the key is missing${only ? ` for ${only}` : ""}` })
  }

  const end = new Date()
  const results: Record<string, PullResult> = {}
  for (const a of due) results[a.company] = await pullOne(db, a, end)

  const list = Object.values(results)
  const sum = (k: "total" | "inserted" | "duplicates") => list.reduce((n, r) => n + (r[k] || 0), 0)
  const errors = Object.entries(results).filter(([, r]) => r.error).map(([co, r]) => `${co}: ${r.error}`)
  return json({
    ok: errors.length < list.length,
    total: sum("total"),
    inserted: sum("inserted"),
    duplicates: sum("duplicates"),
    ...(errors.length ? { error: errors.join("; ") } : {}),
    results,
  })
})

type ImConfig = { crmKey?: string; enabled?: boolean; lastPull?: string; lastResult?: string }
type Account = { company: string; im: ImConfig; legacy: boolean }
type PullResult = { total?: number; inserted?: number; duplicates?: number; error?: string }

// Every configured account. The legacy single block is Ortex's until
// indiamartByCompany.ortex exists.
// deno-lint-ignore no-explicit-any
function accounts(doc: Record<string, any>): Account[] {
  const integrations = doc.integrations || {}
  const byCompany = (integrations.indiamartByCompany || {}) as Record<string, ImConfig>
  const out: Account[] = Object.entries(byCompany).map(([company, im]) => ({ company, im: im || {}, legacy: false }))
  if (!byCompany.ortex && integrations.indiamart) out.push({ company: "ortex", im: integrations.indiamart, legacy: true })
  return out
}

async function pullOne(db: Db, a: Account, end: Date): Promise<PullResult> {
  const start = a.im.lastPull ? new Date(a.im.lastPull) : new Date(end.getTime() - 7 * 86400000)
  const apiUrl = `https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=${encodeURIComponent(a.im.crmKey || "")}&start_time=${encodeURIComponent(imTime(start))}&end_time=${encodeURIComponent(imTime(end))}`

  let payload: Record<string, unknown>
  try {
    payload = await (await fetch(apiUrl)).json()
  } catch (e) {
    // Not saved: the next run retries the same window.
    return { error: `IndiaMART request failed: ${(e as Error).message}` }
  }

  // IndiaMART returns CODE 200 on success; anything else is an error/no-data.
  if (Number(payload.CODE) !== 200) {
    const msg = String(payload.MESSAGE || payload.STATUS || "IndiaMART returned no data")
    await saveResult(db, a, end, `Error: ${msg}`)
    return { error: msg }
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
    const { error } = await db.from("enquiries").insert({ company_id: a.company, doc: toEnquiryDoc(lead) })
    if (!error) inserted++
  }

  await saveResult(db, a, end, `Pulled ${leads.length}, added ${inserted}, ${duplicates} dup`)
  return { total: leads.length, inserted, duplicates }
}

// Persist this account's last pull and a short human result. Re-reads the row
// first and replaces only this account's block, so other keys stay as they are.
// ponytail: read-then-write, a settings save landing in the same instant can be
// lost; a jsonb_set RPC on settings (like doc_merge) closes that gap.
async function saveResult(db: Db, a: Account, end: Date, result: string) {
  const { data } = await db.from("settings").select("doc").eq("id", true).maybeSingle()
  if (!data) return
  const doc = data.doc || {}
  const integrations = doc.integrations || {}
  const stamp = { lastPull: end.toISOString(), lastResult: result }
  const nextIntegrations = a.legacy
    ? { ...integrations, indiamart: { ...(integrations.indiamart || {}), ...stamp } }
    : {
        ...integrations,
        indiamartByCompany: {
          ...(integrations.indiamartByCompany || {}),
          [a.company]: { ...(integrations.indiamartByCompany?.[a.company] || {}), ...stamp },
        },
      }
  await db.from("settings").update({ doc: { ...doc, integrations: nextIntegrations } }).eq("id", true)
}
