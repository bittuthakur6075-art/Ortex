// Live RLS smoke test. Runs against a real Supabase project with the public
// anon key and, optionally, a staff login, and asserts that each role can do
// exactly what the migrations intend. Read-only apart from one enquiry insert
// (tagged so it is easy to find and delete afterwards).
//
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/rls-check.mjs
//   # optional: a sales account with NO modules to check the least-privileged tier
//   RLS_TEST_EMAIL=... RLS_TEST_PASSWORD=... node scripts/rls-check.mjs
//
// Exit code is 1 if any expectation fails. Never pass the service-role key.

import { createClient } from "@supabase/supabase-js"

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key only).")
  process.exit(2)
}
if (/service_role/.test(anonKey) || tokenRole(anonKey) === "service_role") {
  console.error("Refusing to run with a service-role key.")
  process.exit(2)
}

const BUSINESS_TABLES = ["customers", "enquiries", "leads", "quotations", "invoices", "payments"]
const STAFF_ONLY_TABLES = ["notifications", "ai_usage", "user_activities", "event_logs", "whatsapp_logs", "ai_messages", "automation_rules", "message_templates", "settings", "sequences", "social"]
const PROFILE_TABLE = "profiles"

let failures = 0
const results = []

function tokenRole(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).role
  } catch {
    return null
  }
}

function record(role, action, expected, ok, detail = "") {
  const pass = expected === ok
  if (!pass) failures++
  results.push({ role, action, expected: expected ? "allowed" : "denied", actual: ok ? "allowed" : "denied", pass, detail })
}

// A read is "allowed" if the query succeeds AND could return rows. RLS denies
// a SELECT by returning zero rows with no error, so an empty result on a table
// we cannot prove is empty counts as denied for our purposes.
async function canRead(client, table) {
  const { data, error } = await client.from(table).select("id").limit(1)
  if (error) return { ok: false, detail: error.message }
  return { ok: (data?.length ?? 0) > 0, detail: data?.length ? "" : "0 rows (denied or empty)" }
}

// Probe rows are removed again when the insert succeeds. The anon enquiry is
// the exception: anon has no delete policy there, so it is left for staff to
// remove (the report says so).
async function canInsert(client, table, row, { cleanup = true } = {}) {
  const { data, error } = await client.from(table).insert(row).select("id").single()
  if (!error && cleanup && data?.id) await client.from(table).delete().eq("id", data.id)
  return { ok: !error, detail: error?.message ?? "" }
}

async function canListBucket(client, bucket) {
  const { data, error } = await client.storage.from(bucket).list("", { limit: 1 })
  if (error) return { ok: false, detail: error.message }
  return { ok: (data?.length ?? 0) > 0, detail: data?.length ? "" : "0 objects (denied or empty)" }
}

async function canUploadBucket(client, bucket) {
  const path = `rls-check/${Date.now()}.txt`
  const { error } = await client.storage.from(bucket).upload(path, new Blob(["rls-check"], { type: "text/plain" }))
  if (!error) await client.storage.from(bucket).remove([path])
  return { ok: !error, detail: error?.message ?? "" }
}

async function runAnon() {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const role = "anon"

  let r = await canRead(anon, "products")
  record(role, "read products", true, r.ok, r.detail)
  r = await canRead(anon, "categories")
  record(role, "read categories", true, r.ok, r.detail)

  for (const t of [...BUSINESS_TABLES, ...STAFF_ONLY_TABLES, PROFILE_TABLE]) {
    r = await canRead(anon, t)
    record(role, `read ${t}`, false, r.ok, r.detail)
  }

  r = await canInsert(anon, "enquiries", {
    doc: { name: "RLS CHECK - safe to delete", email: "rls-check@example.invalid", message: "automated rls-check.mjs", status: "new", createdAt: new Date().toISOString() },
  }, { cleanup: false })
  record(role, "insert enquiries (lead capture)", true, r.ok, r.detail)

  r = await canInsert(anon, "customers", { doc: { name: "RLS CHECK" } })
  record(role, "insert customers", false, r.ok, r.detail)
  r = await canInsert(anon, "products", { doc: { name: "RLS CHECK" } })
  record(role, "insert products", false, r.ok, r.detail)
  r = await canInsert(anon, "whatsapp_logs", { doc: { whatsappUrl: "javascript:1" } })
  record(role, "insert whatsapp_logs", false, r.ok, r.detail)

  const { error: rpcErr } = await anon.rpc("next_sequence", { p_series: "rls-check" }).catch((e) => ({ error: e }))
  record(role, "call next_sequence()", false, !rpcErr, rpcErr?.message ?? "")

  r = await canListBucket(anon, "artwork")
  record(role, "list artwork bucket", false, r.ok, r.detail)
  r = await canUploadBucket(anon, "artwork")
  record(role, "upload to artwork bucket (quote wizard)", true, r.ok, r.detail)
  r = await canUploadBucket(anon, "product-images")
  record(role, "upload to product-images bucket", false, r.ok, r.detail)
  r = await canUploadBucket(anon, "social-media")
  record(role, "upload to social-media bucket", false, r.ok, r.detail)
}

async function runStaff() {
  const email = process.env.RLS_TEST_EMAIL
  const password = process.env.RLS_TEST_PASSWORD
  if (!email || !password) {
    console.log("\nRLS_TEST_EMAIL / RLS_TEST_PASSWORD not set: skipping the staff-login section.")
    return
  }
  const staff = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: session, error } = await staff.auth.signInWithPassword({ email, password })
  if (error) {
    console.error(`\nStaff login failed: ${error.message}`)
    failures++
    return
  }
  const { data: me } = await staff.from(PROFILE_TABLE).select("role, modules, active").eq("id", session.user.id).single()
  const modules = Array.isArray(me?.modules) ? me.modules : []
  const isAdmin = me?.role === "admin"
  const active = me?.active === true
  const role = `staff(${me?.role ?? "?"}, ${active ? "active" : "inactive"}, modules=[${modules.join(",")}])`
  console.log(`\nLogged in as ${email}: ${role}`)

  const has = (m) => active && (isAdmin || modules.includes(m))

  let r
  for (const t of ["products", "categories", ...BUSINESS_TABLES]) {
    r = await canRead(staff, t)
    // products/categories are anon-readable, so a read there is always allowed.
    const expect = t === "products" || t === "categories" ? true : has(t)
    record(role, `read ${t}`, expect, r.ok, r.detail)
  }
  r = await canInsert(staff, "customers", { doc: { name: "RLS CHECK" } })
  record(role, "insert customers", has("customers"), r.ok, r.detail)
  r = await canRead(staff, "settings")
  record(role, "read settings", isAdmin && active, r.ok, r.detail)
  r = await canRead(staff, "notifications")
  record(role, "read notifications", active, r.ok, r.detail)

  r = await canListBucket(staff, "artwork")
  record(role, "list artwork bucket", active, r.ok, r.detail)
  r = await canUploadBucket(staff, "product-images")
  record(role, "upload to product-images bucket", active, r.ok, r.detail)

  // Self-escalation must be silently reverted by protect_profile_privileges.
  await staff.from(PROFILE_TABLE).update({ role: "admin", modules: ["customers", "invoices"], active: true }).eq("id", session.user.id)
  const { data: after } = await staff.from(PROFILE_TABLE).select("role, modules, active").eq("id", session.user.id).single()
  const escalated = !isAdmin && (after?.role === "admin" || (after?.modules?.length ?? 0) > modules.length || (!active && after?.active === true))
  record(role, "self-escalate role/modules/active via profiles update", false, escalated, JSON.stringify(after))

  await staff.auth.signOut()
}

function report() {
  const pad = (s, n) => String(s).padEnd(n)
  console.log("\n" + pad("RESULT", 7) + pad("ROLE", 52) + pad("ACTION", 48) + "EXPECTED / ACTUAL")
  for (const x of results) {
    console.log(`${pad(x.pass ? "ok" : "FAIL", 7)}${pad(x.role.slice(0, 50), 52)}${pad(x.action, 48)}${x.expected} / ${x.actual}${x.detail && !x.pass ? `   (${x.detail})` : ""}`)
  }
  console.log(`\n${results.length - failures} passed, ${failures} failed.`)
  if (results.some((x) => x.action.startsWith("insert enquiries") && x.pass)) {
    console.log("Note: one test enquiry named 'RLS CHECK - safe to delete' was inserted; remove it from the Enquiries page.")
  }
}

await runAnon()
await runStaff()
report()
process.exit(failures ? 1 : 0)
