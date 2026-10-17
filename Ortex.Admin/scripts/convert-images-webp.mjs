// One-off: convert the catalogue's existing JPEG/PNG photos in the
// "product-images" bucket to WebP (new uploads are WebP since console 1.57.1,
// lib/imageUpload.js) and point each record at the new file.
//
//   node scripts/convert-images-webp.mjs              dry run: counts, sizes and
//                                                     a sample conversion, no writes
//   node scripts/convert-images-webp.mjs --apply      convert and update records
//   node scripts/convert-images-webp.mjs --revert <log.json>
//                                                     point records back at the originals
//
// Env: SUPABASE_URL and SUPABASE_ANON_KEY (the same anon key the websites use).
// --apply and --revert also need ORTEX_EMAIL and ORTEX_PASSWORD: a console user
// with the products, categories and work modules. The writes then run under
// that person's RLS, are stamped with their id and appear in the audit log.
//
// Safety: originals are never deleted or overwritten. Each WebP is a NEW object
// beside its original (same path, .webp), each record is re-read just before it
// is written, and every change is appended to webp-conversion-<date>.json, the
// input of --revert. Run it when nobody is editing the catalogue.

import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"

const BUCKET = "product-images"
const MARKER = `/storage/v1/object/public/${BUCKET}/`
const MAX_DIM = 1000 // the console's own upload size (lib/imageUpload.js)
const QUALITY = 80
const SAMPLE = 12

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const REVERT = args.includes("--revert") ? args[args.indexOf("--revert") + 1] : null

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
if (!url || !anon) fail("Set SUPABASE_URL and SUPABASE_ANON_KEY.")
const sb = createClient(url, anon, { auth: { persistSession: false } })

function fail(msg) {
  console.error(`\n${msg}\n`)
  process.exit(1)
}

const isOurs = (u) => typeof u === "string" && u.includes(MARKER)
const needsWebp = (u) => isOurs(u) && !/\.webp(\?|$)/i.test(u)
const pathOf = (u) => decodeURIComponent(u.slice(u.indexOf(MARKER) + MARKER.length).split("?")[0])
const webpPathOf = (p) => p.replace(/\.[a-z0-9]+$/i, "") + ".webp"
const kb = (n) => `${Math.round(n / 1024).toLocaleString("en-IN")} KB`

// Where each table keeps its photos.
const TABLES = [
  { table: "products", view: "products_public", list: (d) => d.images || [], set: (d, urls) => ({ ...d, images: urls }) },
  { table: "categories", view: "categories_public", list: (d) => (d.image ? [d.image] : []), set: (d, urls) => ({ ...d, image: urls[0] }) },
  { table: "work", view: "work", list: (d) => (d.image ? [d.image] : []), set: (d, urls) => ({ ...d, image: urls[0] }) },
]

async function signIn() {
  const email = process.env.ORTEX_EMAIL
  const password = process.env.ORTEX_PASSWORD
  if (!email || !password) fail("--apply and --revert need ORTEX_EMAIL and ORTEX_PASSWORD (a console user with catalogue access).")
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) fail(`Sign-in failed: ${error.message}`)
  console.log(`Signed in as ${email}`)
}

async function readRows(source) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(source).select("id, doc").range(from, from + 999)
    if (error) fail(`Could not read ${source}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

async function download(u) {
  const res = await fetch(u)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const toWebp = (buf) =>
  sharp(buf).rotate().resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true }).webp({ quality: QUALITY, effort: 6 }).toBuffer()

async function dryRun() {
  console.log("DRY RUN: nothing is written. Reading the public catalogue (drafts and hidden products are not visible here).\n")
  const todo = new Set()
  for (const t of TABLES) {
    const rows = await readRows(t.view)
    const urls = rows.flatMap((r) => t.list(r.doc || {}))
    const mine = urls.filter(needsWebp)
    mine.forEach((u) => todo.add(u))
    console.log(`${t.table.padEnd(11)} ${rows.length} records, ${urls.length} photos, ${mine.length} to convert, ${urls.filter((u) => !isOurs(u)).length} hosted elsewhere (left alone)`)
  }
  const list = [...todo]
  console.log(`\n${list.length} distinct photos to convert.`)
  let before = 0, after = 0, n = 0
  for (const u of list.slice(0, SAMPLE)) {
    try {
      const buf = await download(u)
      const out = await toWebp(buf)
      before += buf.length; after += out.length; n++
    } catch (e) {
      console.log(`  could not sample ${u.split("/").pop()}: ${e.message}`)
    }
  }
  if (n) {
    const ratio = after / before
    console.log(`Sample of ${n}: ${kb(before)} -> ${kb(after)} (${Math.round((1 - ratio) * 100)}% smaller).`)
    console.log(`Estimated for all ${list.length}: about ${Math.round((1 - ratio) * 100)}% less to download on every catalogue page.`)
  }
  console.log("\nRun again with --apply (and ORTEX_EMAIL / ORTEX_PASSWORD) to convert.")
}

async function apply() {
  await signIn()
  const log = `webp-conversion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`
  writeFileSync(log, "")
  const converted = new Map() // old url -> new url, so a photo shared by two records is converted once
  let records = 0, photos = 0, failed = 0, savedBytes = 0

  for (const t of TABLES) {
    for (const row of await readRows(t.table)) {
      const urls = t.list(row.doc || {})
      if (!urls.some(needsWebp)) continue
      const next = []
      for (const u of urls) {
        if (!needsWebp(u)) { next.push(u); continue }
        if (!converted.has(u)) {
          try {
            const buf = await download(u)
            const out = await toWebp(buf)
            const path = webpPathOf(pathOf(u))
            const { error } = await sb.storage.from(BUCKET).upload(path, out, { contentType: "image/webp", upsert: false, cacheControl: "31536000" })
            if (error && !/exists/i.test(error.message)) throw error
            converted.set(u, sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
            savedBytes += buf.length - out.length
            photos++
          } catch (e) {
            failed++
            console.log(`  kept original (${e.message}): ${u.split("/").pop()}`)
            converted.set(u, u)
          }
        }
        next.push(converted.get(u))
      }
      if (next.every((v, i) => v === urls[i])) continue

      // Re-read just before writing, so an edit made meanwhile is not lost.
      const { data: fresh, error: readErr } = await sb.from(t.table).select("doc").eq("id", row.id).single()
      if (readErr) { failed++; console.log(`  could not re-read ${t.table}/${row.id}: ${readErr.message}`); continue }
      if (JSON.stringify(t.list(fresh.doc || {})) !== JSON.stringify(urls)) { console.log(`  skipped ${t.table}/${row.id}: its photos changed during the run`); continue }
      const { error } = await sb.from(t.table).update({ doc: t.set(fresh.doc, next) }).eq("id", row.id)
      if (error) { failed++; console.log(`  could not update ${t.table}/${row.id}: ${error.message}`); continue }
      appendFileSync(log, JSON.stringify({ table: t.table, id: row.id, before: urls, after: next }) + "\n")
      records++
    }
  }
  console.log(`\nConverted ${photos} photos (${kb(savedBytes)} saved), updated ${records} records, ${failed} problems.`)
  console.log(`Log: ${log} (keep it: it is the input of --revert). Originals are untouched in the bucket.`)
  console.log("Rebuild and upload Ortex.Web so the website's pages use the new photos.")
}

async function revert(file) {
  await signIn()
  let n = 0
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const { table, id, before, after } = JSON.parse(line)
    const t = TABLES.find((x) => x.table === table)
    const { data: fresh, error } = await sb.from(table).select("doc").eq("id", id).single()
    if (error) { console.log(`  could not read ${table}/${id}: ${error.message}`); continue }
    if (JSON.stringify(t.list(fresh.doc || {})) !== JSON.stringify(after)) { console.log(`  skipped ${table}/${id}: changed since the conversion`); continue }
    const { error: upErr } = await sb.from(table).update({ doc: t.set(fresh.doc, before) }).eq("id", id)
    if (upErr) console.log(`  could not revert ${table}/${id}: ${upErr.message}`)
    else n++
  }
  console.log(`Reverted ${n} records to their original photos.`)
}

if (REVERT) await revert(REVERT)
else if (APPLY) await apply()
else await dryRun()
