// Edge Function: indiamart-lead
//
// Receives IndiaMART Lead Manager **Push API** callbacks and files each buyer
// enquiry into the `enquiries` table (source = "IndiaMART"), so IndiaMART leads
// land in the admin alongside website leads. De-duplicates on IndiaMART's
// UNIQUE_QUERY_ID so repeated/retried pushes don't create duplicates.
//
// Auth: IndiaMART can't send a Supabase JWT, so this is deployed with
// --no-verify-jwt and instead guarded by a shared secret — the configured push
// URL must include ?key=<INDIAMART_PUSH_KEY> (set as a function secret).
//
// Deploy:
//   supabase functions deploy indiamart-lead --no-verify-jwt
//   supabase secrets set INDIAMART_PUSH_KEY=<random-secret>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

// Length-independent, constant-time-ish string comparison so the shared-secret
// check doesn't leak the key one byte at a time via response timing.
function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// Pull the fields we care about out of one IndiaMART lead object.
function toEnquiry(q: Record<string, string>) {
  const queryId = q.UNIQUE_QUERY_ID || q.QUERY_ID || null
  return {
    queryId,
    doc: {
      source: "IndiaMART",
      status: "new",
      starred: false,
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
      indiamart: { queryId, queryTime: q.QUERY_TIME || null, raw: q },
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok")
  if (req.method !== "POST") return json({ error: "POST only" }, 405)

  // Shared-secret gate. Prefer the header (query-string secrets leak into
  // access/proxy logs and Referer); fall back to ?key= only because IndiaMART's
  // push config may not allow custom headers. Compared in constant time.
  const secret = Deno.env.get("INDIAMART_PUSH_KEY")
  const url = new URL(req.url)
  const provided = req.headers.get("x-webhook-key") || url.searchParams.get("key") || ""
  if (!secret || !secretsMatch(provided, secret)) return json({ error: "Unauthorized" }, 401)

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  // IndiaMART may send a single lead object or a { RESPONSE: [...] } batch.
  const p = payload as Record<string, unknown>
  const leads = Array.isArray(p?.RESPONSE)
    ? (p.RESPONSE as Record<string, string>[])
    : [p as Record<string, string>]

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  })

  let inserted = 0
  let duplicates = 0
  for (const lead of leads) {
    const { queryId, doc } = toEnquiry(lead)
    if (queryId) {
      const { data: existing } = await db
        .from("enquiries").select("id").eq("doc->indiamart->>queryId", queryId).maybeSingle()
      if (existing) {
        duplicates++
        continue
      }
    }
    const { error } = await db.from("enquiries").insert({ doc })
    if (error) return json({ error: error.message }, 500)
    inserted++
  }

  return json({ CODE: 200, STATUS: "SUCCESS", inserted, duplicates })
})
