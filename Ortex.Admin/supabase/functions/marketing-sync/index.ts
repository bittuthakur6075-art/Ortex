// Edge Function: marketing-sync
//
// The API the Marketing project (C:\Code\Marketing, `npm run sync:ortex`) pushes
// its records to: posts, DMs, comments and follow-ups become rows of
// `public.marketing` (migration 0052), and post images go to the public
// `social-media` bucket under `marketing/`. The console's Marketing page reads
// those rows; nothing here posts anywhere.
//
// Auth: the Marketing project holds no Supabase key, only a shared secret sent
// as `x-sync-key` (constant-time compare). Deployed with --no-verify-jwt.
//
// POST { items?: [{ ref, doc }], images?: [{ name, base64 }] }
//   -> { upserted, uploaded, skipped }
// GET  -> { images: [names already in the bucket] }, so the client uploads only new ones
//
// Deploy:
//   supabase functions deploy marketing-sync --no-verify-jwt
//   supabase secrets set MARKETING_SYNC_KEY=<random-secret>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { secretsMatch } from "../_shared/guard.ts"

const BUCKET = "social-media"
const FOLDER = "marketing"
const KINDS = new Set(["post", "dm", "comment", "followup"])
const IMAGE_NAME = /^[\w.-]{1,120}\.(png|jpe?g|webp)$/i
const MAX_ITEMS = 500
const MAX_DOC = 32 * 1024
const MAX_IMAGE = 8 * 1024 * 1024 // the bucket's own limit

const mime = (name: string) =>
  name.toLowerCase().endsWith(".png") ? "image/png" : name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg"

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } })
  if (!secretsMatch(req.headers.get("x-sync-key") || "", Deno.env.get("MARKETING_SYNC_KEY") || "")) {
    return json({ error: "unauthorised" }, 401)
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  if (req.method === "GET") {
    const { data, error } = await db.storage.from(BUCKET).list(FOLDER, { limit: 1000 })
    if (error) return json({ error: error.message }, 500)
    return json({ images: (data || []).map((f) => f.name) })
  }
  if (req.method !== "POST") return json({ error: "GET or POST only" }, 405)

  // deno-lint-ignore no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid JSON" }, 400)
  }

  const skipped: string[] = []
  const rows = []
  for (const it of (Array.isArray(body?.items) ? body.items : []).slice(0, MAX_ITEMS)) {
    const ref = typeof it?.ref === "string" ? it.ref.slice(0, 200) : ""
    const doc = it?.doc
    if (!ref || !doc || typeof doc !== "object" || Array.isArray(doc) || !KINDS.has(doc.kind) || JSON.stringify(doc).length > MAX_DOC) {
      skipped.push(ref || "(no ref)")
      continue
    }
    // A post names its creative; the console needs the public URL.
    if (typeof doc.imageName === "string" && IMAGE_NAME.test(doc.imageName)) {
      doc.image = db.storage.from(BUCKET).getPublicUrl(`${FOLDER}/${doc.imageName}`).data.publicUrl
    }
    rows.push({ ref, doc })
  }
  if (rows.length) {
    const { error } = await db.from("marketing").upsert(rows, { onConflict: "ref" })
    if (error) return json({ error: error.message }, 500)
  }

  let uploaded = 0
  for (const img of (Array.isArray(body?.images) ? body.images : []).slice(0, 20)) {
    const name = String(img?.name || "")
    if (!IMAGE_NAME.test(name) || typeof img?.base64 !== "string") {
      skipped.push(name || "(no name)")
      continue
    }
    const bytes = b64ToBytes(img.base64)
    if (bytes.length > MAX_IMAGE) {
      skipped.push(`${name} (over 8 MB)`)
      continue
    }
    const { error } = await db.storage.from(BUCKET).upload(`${FOLDER}/${name}`, bytes, { contentType: mime(name), upsert: true })
    if (error) skipped.push(`${name} (${error.message})`)
    else uploaded++
  }

  return json({ upserted: rows.length, uploaded, skipped })
})
