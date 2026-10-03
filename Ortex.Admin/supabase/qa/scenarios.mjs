// Attendance DB flow, driven as real users against a throwaway PGlite build.
// Run: npm run test:db (in Ortex.Admin). Exit code 1 if any check fails. Needs no
// database: every migration is applied to a throwaway PGlite (Postgres in WASM)
// over shim.sql, which stands in for Supabase (auth, storage, cron, net, vault).
import "./clock.mjs"
import { buildDb, SUPER_ID } from "./db.mjs"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"

const t0 = Date.now()
const { db, applied, failed, patched } = await buildDb()
console.log(`migrations: ${applied.length} applied, ${failed.length} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
for (const f of failed) console.log("  FAILED", f.file, f.error)
for (const p of patched) console.log("  patched", p)

// ---- harness ---------------------------------------------------------------------------
// who: null = migration superuser, "anon", "service", or a user uuid (authenticated).
async function run(who, sql, params = []) {
  await db.query("begin")
  try {
    if (who === "anon") {
      await db.query("set local role anon")
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })])
    } else if (who === "service") {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })])
      await db.query("set local role service_role")
    } else if (who) {
      await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
        [JSON.stringify({ sub: who, role: "authenticated" }), who])
      await db.query("set local role authenticated")
    }
    const r = await db.query(sql, params)
    await db.query("commit")
    return r
  } catch (e) {
    await db.query("rollback")
    throw e
  }
}
const one = async (who, sql, params) => (await run(who, sql, params)).rows[0]
const val = async (who, sql, params) => Object.values((await one(who, sql, params)) ?? {})[0]
async function err(who, sql, params) {
  try { await run(who, sql, params); return null } catch (e) { return e.message }
}

const results = []
let current = ""
function check(name, ok, expected, actual) {
  results.push({ scenario: current, name, ok: !!ok, expected, actual: typeof actual === "string" ? actual : JSON.stringify(actual) })
}
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(expected), actual)
const like = (name, actual, re) => check(name, actual != null && re.test(String(actual)), String(re), actual ?? "null (no error)")
async function scenario(name, fn) {
  current = name
  try { await fn() } catch (e) { check("unexpected exception", false, "no exception", e.message) }
}

// ---- people ------------------------------------------------------------------------------
const U = {
  SUPER: SUPER_ID,
  ADMIN: "00000000-0000-4000-8000-0000000000a1",
  ACCT: "00000000-0000-4000-8000-0000000000a2",
  SALES: "00000000-0000-4000-8000-0000000000a3",
  STAFF1: "00000000-0000-4000-8000-0000000000a4",
  STAFF2: "00000000-0000-4000-8000-0000000000a5",
  PAY: "00000000-0000-4000-8000-0000000000a6",
  INACT: "00000000-0000-4000-8000-0000000000a7",
}
const setup = [
  ["ADMIN", "admin", []], ["ACCT", "accounts", []], ["SALES", "sales", []],
  ["STAFF1", "staff", []], ["STAFF2", "staff", []], ["PAY", "staff", ["payroll"]], ["INACT", "staff", []],
]
for (const [k] of setup) {
  await run(null, "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [U[k], `${k.toLowerCase()}@test.local`, JSON.stringify({ name: k, role: "admin" })])
}
await scenario("setup: profiles via signup trigger + service role", async () => {
  const p = await one(null, "select role, active from profiles where id = $1", [U.STAFF1])
  eq("signup trigger makes an inactive sales profile (metadata role ignored)", p, { role: "sales", active: false })
  for (const [k, role, mods] of setup) {
    await run("service", "update profiles set role = $2, active = true, name = $3, modules = $4, created_at = '2026-01-01' where id = $1",
      [U[k], role, k, JSON.stringify(mods)])
  }
  await run(null, "update profiles set created_at = '2026-01-01' where id = $1", [U.SUPER])
  const roles = (await run(null, "select name, role, active from profiles order by name")).rows
  check("roles set", roles.every((r) => r.active), "all active", roles)
  like("admin cannot make someone super_admin",
    await err(U.ADMIN, "update profiles set role = 'super_admin' where id = $1", [U.STAFF1]), /Only the Owner \(.+\) can make or remove a Super Admin/)
})

const today = await val(null, "select ((now() at time zone 'Asia/Kolkata')::date)::text")
const ist = (d, hm) => `${d} ${hm}:00+05:30`
const SITE = randomUUID()
await run(null, "insert into work_sites (id, name, lat, lng) values ($1, 'Head office', 28.6, 77.2)", [SITE])
const setCfg = (patch) => run(null, "update attendance_settings set doc = doc || $1::jsonb where id", [JSON.stringify(patch)])
const dropCfg = (key) => run(null, "update attendance_settings set doc = doc - $1 where id", [key])
await setCfg({ checkInFrom: "00:00", closeAt: "23:59", requireCode: true })
const punch = (who, kind, payload = null, id = randomUUID(), note = null, device = {}) =>
  one(who, "select attendance_punch($1, $2, $3, $4, $5) as r", [id, kind, payload, note, JSON.stringify(device)]).then((x) => ({ id, ...x.r }))
const show = async (who = U.ADMIN) => (await one(who, "select attendance_qr_show($1) as r", [SITE])).r
const qrRow = () => one(null, "select * from attendance_qr where site_id = $1", [SITE])
const pRow = (id) => one(null, "select * from attendance_punches where id = $1", [id])
const dayRow = (u, d) => one(null, "select status, flags, worked_min, late, late_min, first_in, last_out, leave_type from attendance_days where user_id = $1 and day = $2", [u, d])
const otRow = (u, d) => one(null, "select minutes, basis from attendance_overtime where user_id = $1 and day = $2", [u, d])
const rawPunch = (u, kind, at, extra = {}) => run(null,
  `insert into attendance_punches (id, user_id, kind, at, day, mode, flags, review)
   values ($1, $2, $3, $4::timestamptz, (($4::timestamptz) at time zone 'Asia/Kolkata')::date, $5, $6, $7) returning id`,
  [extra.id ?? randomUUID(), u, kind, at, extra.mode ?? "office", extra.flags ?? [], extra.review ?? "ok"]).then((r) => r.rows[0].id)
const recompute = (u, d) => run(null, "select attendance_recompute_day($1, $2)", [u, d])

// ---- QR ----------------------------------------------------------------------------------
let staff1In
await scenario("QR code", async () => {
  like("staff cannot call attendance_qr_show", await err(U.STAFF1, "select attendance_qr_show($1)", [SITE]), /Only the Super Admin and admins/)
  like("accounts (no attendance-qr) cannot show", await err(U.ACCT, "select attendance_qr_show($1)", [SITE]), /Only the Super Admin and admins/)
  like("anon cannot show", await err("anon", "select attendance_qr_show($1)", [SITE]), /permission denied/)
  eq("out without in -> not_in", (await punch(U.STAFF2, "out")).status, "not_in")
  const s = await show(U.ADMIN)
  eq("admin shows a code", [s.status, s.payload.startsWith("ORTEX-ATT1:")], ["ok", true])
  eq("attendance_qr.shown_by = admin", (await qrRow()).shown_by, U.ADMIN)
  const p = await punch(U.STAFF1, "in", s.payload)
  staff1In = p.id
  eq("staff punches with it -> ok/office/site", [p.status, p.mode, p.site], ["ok", "office", "Head office"])
  const row = await pRow(p.id)
  eq("punch.qr_shown_by = admin, qr_site_id = site", [row.qr_shown_by, row.qr_site_id, row.review], [U.ADMIN, SITE, "ok"])
  const q = await qrRow()
  eq("code burned: new token, shown_by cleared, last_user = staff1",
    [q.token !== s.payload.slice(11), q.shown_by, q.last_user_id, q.last_kind], [true, null, U.STAFF1, "in"])
  eq("same code again -> used_code", (await punch(U.STAFF2, "in", s.payload)).status, "used_code")
  eq("garbage -> wrong_code", (await punch(U.STAFF2, "in", "hello")).status, "wrong_code")
  eq("well-formed unknown token -> used_code", (await punch(U.STAFF2, "in", "ORTEX-ATT1:deadbeef")).status, "used_code")
  const s2 = await show(U.SUPER)
  eq("Super Admin claims the fresh code (shown_by)", (await qrRow()).shown_by, U.SUPER)
  const s2b = await show(U.ADMIN)
  eq("second screen does not re-claim (shown_by stays)", [(await qrRow()).shown_by, s2b.payload === s2.payload], [U.SUPER, true])
  await run(null, "update attendance_qr set expires_at = now() - interval '1 second' where site_id = $1", [SITE])
  eq("expired -> expired_code", (await punch(U.STAFF2, "in", s2.payload)).status, "expired_code")
  const s3 = await show(U.ADMIN)
  check("expired code rotates on next show", s3.payload !== s2.payload, "new payload", s3.payload)
  eq("staff2 punches in with fresh code", (await punch(U.STAFF2, "in", s3.payload)).status, "ok")
})

// ---- once a day ---------------------------------------------------------------------------
await scenario("Once a day + replay", async () => {
  eq("second in while open -> already_in", (await punch(U.STAFF1, "in", (await show()).payload)).status, "already_in")
  eq("office out with no code (requireCode) -> no_code", (await punch(U.STAFF1, "out")).status, "no_code")
  const o = await punch(U.STAFF1, "out", (await show()).payload)
  eq("out with code -> ok", o.status, "ok")
  eq("in again after out -> day_done", (await punch(U.STAFF1, "in", (await show()).payload)).status, "day_done")
  eq("second out -> not_in", (await punch(U.STAFF1, "out", (await show()).payload)).status, "not_in")
  const r = await punch(U.STAFF1, "in", "whatever", staff1In)
  eq("replay of same p_id -> same result with mode", [r.status, r.repeat, r.mode, r.kind], ["ok", true, "office", "in"])
  like("replay of another user's p_id refused", await err(U.STAFF2, "select attendance_punch($1, 'in', null)", [staff1In]), /punch id is taken/)
  const d = await dayRow(U.STAFF1, today)
  eq("today's day row is P", d?.status, "P")
})

// ---- field / requireCode --------------------------------------------------------------
await scenario("Field punch and requireCode", async () => {
  const f = await punch(U.SALES, "in")
  eq("sales with no code -> flagged no_code, mode field", [f.status, f.flags, f.mode], ["flagged", ["no_code"], "field"])
  eq("row review = flagged", (await pRow(f.id)).review, "flagged")
  await run(U.ADMIN, "select attendance_review($1, 'rejected', 'not at customer')", [f.id])
  const rp = await punch(U.SALES, "in", null, f.id)
  eq("replay of a rejected punch -> refused + message + mode", [rp.status, rp.mode, !!rp.message], ["refused", "field", true])
  eq("office staff, no code, requireCode -> no_code", (await punch(U.PAY, "in")).status, "no_code")
  await setCfg({ requireCode: false })
  const n = await punch(U.PAY, "in")
  eq("office staff, no code, requireCode=false -> flagged no_code", [n.status, n.flags], ["flagged", ["no_code"]])
  await setCfg({ requireCode: true })
})

// ---- window ---------------------------------------------------------------------------
await scenario("Check-in window", async () => {
  await setCfg({ checkInFrom: "23:59", closeAt: "23:59" })
  const a = await punch(U.ACCT, "in", (await show()).payload)
  eq("check-in before checkInFrom -> outside_hours", [a.status, a.message], ["outside_hours", "Check-in opens at 11:59 PM."])
  await setCfg({ checkInFrom: "00:00", closeAt: "00:00" })
  const b = await punch(U.ACCT, "in", (await show()).payload)
  like("check-in after closeAt -> outside_hours", `${b.status} ${b.message}`, /^outside_hours Check-in closed/)
  eq("check-out outside the window allowed", (await punch(U.STAFF2, "out", (await show()).payload)).status, "ok")
  await setCfg({ checkInFrom: "00:00", closeAt: "23:59" })
})

await scenario("Note and device limits", async () => {
  const p = await punch(U.ACCT, "in", (await show()).payload, randomUUID(), "x".repeat(600), { blob: "y".repeat(3000) })
  eq("punch ok", p.status, "ok")
  const r = await pRow(p.id)
  eq("note cut to 500, device > 2KB stored as {}", [r.note.length, r.device], [500, {}])
})

// ---- recompute (past days, punches inserted as the superuser) ---------------------------
await scenario("Recompute rules", async () => {
  const S = U.STAFF1
  await rawPunch(S, "in", ist("2026-09-01", "09:00"))
  let d = await dayRow(S, "2026-09-01")
  eq("in only, past -> A + no_checkout, worked 0", [d.status, d.flags, d.worked_min], ["A", ["no_checkout"], 0])

  await rawPunch(S, "in", ist("2026-09-02", "09:00")); await rawPunch(S, "out", ist("2026-09-02", "18:30"))
  d = await dayRow(S, "2026-09-02")
  eq("early arrival counted from shift start (540 min, not 570)", [d.status, d.worked_min, d.late], ["P", 540, false])
  eq("first_in keeps the real time", new Date(d.first_in).toISOString(), new Date(ist("2026-09-02", "09:00")).toISOString())
  eq("no overtime on an exact shift", await otRow(S, "2026-09-02"), undefined)

  await rawPunch(S, "in", ist("2026-09-03", "09:50")); await rawPunch(S, "out", ist("2026-09-03", "18:30"))
  d = await dayRow(S, "2026-09-03")
  eq("09:50 is late (grace 15), late_min 20", [d.status, d.late, d.late_min], ["P", true, 20])
  await rawPunch(S, "in", ist("2026-09-04", "09:44")); await rawPunch(S, "out", ist("2026-09-04", "18:30"))
  d = await dayRow(S, "2026-09-04")
  eq("09:44 within grace -> not late", [d.status, d.late], ["P", false])

  await rawPunch(S, "in", ist("2026-09-05", "09:30")); await rawPunch(S, "out", ist("2026-09-05", "11:00"))
  d = await dayRow(S, "2026-09-05")
  eq("90 min < absentBelowMin 120 -> A short_hours", [d.status, d.flags], ["A", ["short_hours"]])
  await rawPunch(S, "in", ist("2026-09-07", "09:30")); await rawPunch(S, "out", ist("2026-09-07", "13:00"))
  d = await dayRow(S, "2026-09-07")
  eq("210 min < halfDayBelowMin 270 -> HD", [d.status, d.worked_min], ["HD", 210])

  await rawPunch(S, "in", ist("2026-09-06", "10:00")); await rawPunch(S, "out", ist("2026-09-06", "14:00"))
  d = await dayRow(S, "2026-09-06")
  eq("Sunday work stays WO with worked_off_day", [d.status, d.flags, d.worked_min], ["WO", ["worked_off_day"], 240])
  eq("off-day overtime = every minute", await otRow(S, "2026-09-06"), { minutes: 240, basis: "off_day" })

  await rawPunch(S, "in", ist("2026-09-08", "09:30"))
  const out8 = await rawPunch(S, "out", ist("2026-09-08", "20:30"))
  eq("overtime past the shift created", await otRow(S, "2026-09-08"), { minutes: 120, basis: "shift" })
  await run(null, "update attendance_punches set review = 'rejected' where id = $1", [out8])
  d = await dayRow(S, "2026-09-08")
  eq("out rejected -> A no_checkout and overtime removed", [d.status, d.flags, await otRow(S, "2026-09-08")], ["A", ["no_checkout"], undefined])

  const fut = await val(null, "select (($1::date) + 3)::text", [today])
  await run(null, "insert into attendance_overtime (user_id, day, minutes, basis, computed_at) values ($1, $2, 30, 'shift', now())", [S, fut])
  await recompute(S, fut)
  eq("future day: early return removes overtime", await otRow(S, fut), undefined)

  await setCfg({ autoPresent: [U.STAFF2] })
  await recompute(U.STAFF2, "2026-09-11")
  d = await dayRow(U.STAFF2, "2026-09-11")
  eq("autoPresent -> P, shift minutes, flag", [d.status, d.worked_min, d.flags], ["P", 540, ["auto_present"]])
  await recompute(U.STAFF2, "2026-09-13")
  eq("autoPresent never on a Sunday (WO)", (await dayRow(U.STAFF2, "2026-09-13")).status, "WO")
  await dropCfg("autoPresent")
  await recompute(U.STAFF2, "2026-09-11")

  // inactive person
  await recompute(U.INACT, "2026-09-14"); await recompute(U.INACT, "2026-09-13")
  await run("service", "update profiles set active = false where id = $1", [U.INACT])
  await recompute(U.INACT, "2026-09-14"); await recompute(U.INACT, "2026-09-13")
  eq("inactive: past days kept (A, WO)", [(await dayRow(U.INACT, "2026-09-14"))?.status, (await dayRow(U.INACT, "2026-09-13"))?.status], ["A", "WO"])
  await run(null, "insert into attendance_days (user_id, day, status) values ($1, $2, 'A') on conflict do nothing", [U.INACT, today])
  await recompute(U.INACT, today)
  eq("inactive: today deleted", await dayRow(U.INACT, today), undefined)
  await recompute(U.INACT, "2026-01-01")
  check("before joining date: no row", (await dayRow(U.INACT, "2025-12-31")) === undefined, "undefined", "ok")
})

await scenario("Holidays", async () => {
  await run(null, "select attendance_close_day_all('2026-09-09')")
  eq("no punches on Wed 9 Sep -> A", (await dayRow(U.STAFF2, "2026-09-09")).status, "A")
  const before = await val(null, "select count(*)::int from audit_log where table_name = 'holidays'")
  const hid = (await one(U.ADMIN, "insert into holidays (day, name, kind) values ('2026-09-09', 'Test Day', 'national') returning id")).id
  eq("holiday insert turns A into H (trigger)", (await dayRow(U.STAFF2, "2026-09-09")).status, "H")
  const a = await one(null, "select action, actor, label from audit_log where table_name = 'holidays' and row_id = $1 order by id desc", [hid])
  eq("audit_log insert row with actor", a, { action: "insert", actor: U.ADMIN, label: "Test Day, 2026-09-09" })
  await run(U.ADMIN, "update holidays set kind = 'optional' where id = $1", [hid])
  eq("switching it to optional -> back to A", (await dayRow(U.STAFF2, "2026-09-09")).status, "A")
  await run(U.ADMIN, "update holidays set kind = 'national' where id = $1", [hid])
  eq("back to national -> H", (await dayRow(U.STAFF2, "2026-09-09")).status, "H")
  await run(U.ADMIN, "delete from holidays where id = $1", [hid])
  eq("delete reverts to A", (await dayRow(U.STAFF2, "2026-09-09")).status, "A")
  eq("3 updates/inserts/deletes + insert audited", (await val(null, "select count(*)::int from audit_log where table_name = 'holidays'")) - before, 4)
  await run(U.ADMIN, "insert into holidays (day, name, kind) values ('2026-09-10', 'Optional', 'optional')")
  eq("optional holiday is not an off day -> A", (await dayRow(U.STAFF2, "2026-09-10")).status, "A")
  // moving a holiday recomputes both days
  const h2 = (await one(U.ADMIN, "insert into holidays (day, name, kind) values ('2026-09-16', 'Moved', 'festival') returning id")).id
  await run(U.ADMIN, "update holidays set day = '2026-09-17' where id = $1", [h2])
  eq("moved holiday: old day A, new day H", [(await dayRow(U.STAFF2, "2026-09-16")).status, (await dayRow(U.STAFF2, "2026-09-17")).status], ["A", "H"])
  await run(U.ADMIN, "delete from holidays where id = $1", [h2])
  like("staff cannot write holidays", await err(U.STAFF1, "insert into holidays (day, name) values ('2026-09-18', 'x')"), /row-level security/)
})

// ---- corrections -------------------------------------------------------------------------
await scenario("Corrections", async () => {
  const S = U.STAFF1
  like("future time refused", await err(S, "select regularise_request($1, now() + interval '1 hour', null, 'forgot')", [today]), /already passed/)
  const r1 = await val(S, "select regularise_request('2026-09-01', null, $1, 'forgot to check out')", [ist("2026-09-01", "18:30")])
  like("requester (admin? no, staff) cannot decide", await err(S, "select regularise_decide($1, true)", [r1]), /Only an admin/)
  await run(U.ADMIN, "select regularise_decide($1, true, 'ok')", [r1])
  let d = await dayRow(S, "2026-09-01")
  eq("approved out -> P, 540", [d.status, d.worked_min], ["P", 540])

  const r2 = await val(S, "select regularise_request('2026-09-03', $1, $2, 'wrong times')", [ist("2026-09-03", "09:25"), ist("2026-09-03", "19:00")])
  await run(U.ADMIN, "select regularise_decide($1, true)", [r2])
  const old = (await run(null, "select kind, review, review_note from attendance_punches where user_id = $1 and day = '2026-09-03' and not ('regularised' = any(flags)) order by kind", [S])).rows
  eq("originals rejected 'Replaced by correction'", old, [
    { kind: "in", review: "rejected", review_note: "Replaced by correction" },
    { kind: "out", review: "rejected", review_note: "Replaced by correction" }])
  d = await dayRow(S, "2026-09-03")
  eq("day recomputed: not late, out 19:00", [d.status, d.late, new Date(d.last_out).toISOString()], ["P", false, new Date(ist("2026-09-03", "19:00")).toISOString()])

  const ra = await val(U.ADMIN, "select regularise_request('2026-09-02', $1, null, 'my own')", [ist("2026-09-02", "09:30")])
  like("admin cannot decide own correction", await err(U.ADMIN, "select regularise_decide($1, true)", [ra]), /Another admin/)
  await run(U.ADMIN, "select regularise_cancel($1)", [ra])
  eq("cancel -> cancelled", await val(null, "select status from regularisations where id = $1", [ra]), "cancelled")
  like("cancel again refused", await err(U.ADMIN, "select regularise_cancel($1)", [ra]), /no longer be cancelled/)

  const extra = []
  for (const day of ["2026-09-04", "2026-09-05", "2026-09-07"])
    extra.push(await val(S, "select regularise_request($1, $2, null, 'cap test')", [day, ist(day, "09:30")]))
  like("cap: 6th correction in the month refused (5)", await err(S, "select regularise_request('2026-09-02', $1, null, 'cap')", [ist("2026-09-02", "09:30")]), /used all 5/)
  like("second pending for the same day refused", await err(S, "select regularise_request('2026-09-04', $1, null, 'dup')", [ist("2026-09-04", "09:30")]), /already have a correction waiting|used all/)
  for (const id of extra) await run(S, "select regularise_cancel($1)", [id])
  like("(17) cancelled ones still count toward the cap", await err(S, "select regularise_request('2026-09-02', $1, null, 'after cancel')", [ist("2026-09-02", "09:30")]), /used all 5 corrections .*rejected and cancelled ones count too/)
})

// ---- leave ---------------------------------------------------------------------------------
await scenario("Leave", async () => {
  await run(null, "select leave_grant_year(2026)")
  const bal = async (u, code) => one(u, "select balance::float, available::float, taken_year::float from leave_balances($1) where code = $2", [u, code])
  eq("CL granted 7", (await bal(U.STAFF2, "CL")).balance, 7)
  const a = (await one(U.STAFF2, "select leave_apply('CL', '2026-09-15', '2026-09-15', 'full', 'full', 'fever') as r")).r
  await run(U.ADMIN, "select leave_decide($1, true)", [a.id])
  eq("approved CL day -> L", (await dayRow(U.STAFF2, "2026-09-15")).status, "L")
  eq("CL taken_year 1, balance 6", [(await bal(U.STAFF2, "CL")).taken_year, (await bal(U.STAFF2, "CL")).balance], [1, 6])

  const own = (await one(U.ADMIN, "select leave_apply('CL', ($1::date + 10), ($1::date + 10), 'full', 'full', 'own') as r", [today])).r
  like("admin cannot decide own leave", await err(U.ADMIN, "select leave_decide($1, true)", [own.id]), /Another admin/)
  await run(U.ADMIN, "select leave_cancel($1)", [own.id])

  const f = (await one(U.STAFF2, "select leave_apply('CL', ($1::date + 17), ($1::date + 17), 'full', 'full', 'trip') as r", [today])).r
  await run(U.SUPER, "select leave_decide($1, true)", [f.id])
  await run(U.STAFF2, "select leave_cancel($1, 'plans changed')", [f.id])
  const lr = await one(null, "select status, cancelled_by from leave_requests where id = $1", [f.id])
  eq("own approved future leave cancelled, cancelled_by = self", lr, { status: "cancelled", cancelled_by: U.STAFF2 })
  eq("reversal row +1", await val(null, "select delta::float from leave_ledger where ref_id = $1 and reason = 'reversal'", [f.id]), 1)
  like("cancel twice refused", await err(U.STAFF2, "select leave_cancel($1)", [f.id]), /no longer be cancelled/)
  eq("CL after cancel: balance 6, taken_year 1", [(await bal(U.STAFF2, "CL")).balance, (await bal(U.STAFF2, "CL")).taken_year], [6, 1])

  await run(U.SUPER, "select leave_adjust($1, 'EL', 2, 'opening balance')", [U.STAFF2])
  const adj = await val(null, "select id from leave_ledger where user_id = $1 and type_code = 'EL' and reason = 'adjust'", [U.STAFF2])
  like("admin without leave-balances cannot undo", await err(U.ADMIN, "select leave_undo_adjust($1, 'x')", [adj]), /do not have access to manage leave balances/)
  await run(U.SUPER, "select leave_undo_adjust($1, 'typo')", [adj])
  const el = await bal(U.STAFF2, "EL")
  eq("undo: EL balance 0, taken_year NOT inflated (0)", [el.balance, el.taken_year], [0, 0])
  like("undo twice refused", await err(U.SUPER, "select leave_undo_adjust($1, 'again')", [adj]), /already been undone/)
  const grant = await val(null, "select id from leave_ledger where user_id = $1 and type_code = 'CL' and reason = 'grant' and period is not null", [U.STAFF2])
  like("yearly grant cannot be undone", await err(U.SUPER, "select leave_undo_adjust($1, 'no')", [grant]), /Only a manual adjustment/)
  await run(U.SUPER, "select leave_adjust($1, 'CO', 1, 'comp-off for 6 Sep')", [U.STAFF2])
  const co = await val(null, "select id from leave_ledger where user_id = $1 and type_code = 'CO' and reason = 'grant'", [U.STAFF2])
  check("manual CO grant (no period) can be undone", (await err(U.SUPER, "select leave_undo_adjust($1, 'wrong day')", [co])) === null, "null", "ok")
  eq("CO taken_year after undo = 0", (await bal(U.STAFF2, "CO")).taken_year, 0)
  eq("unique index leave_ledger_reversal_once exists", await val(null, "select count(*)::int from pg_indexes where indexname = 'leave_ledger_reversal_once'"), 1)
  like("duplicate reversal blocked by the index", await err(null, "insert into leave_ledger (user_id, type_code, delta, reason, ref_id) values ($1, 'EL', -2, 'reversal', $2)", [U.STAFF2, adj]), /duplicate key|unique/)
  eq("leave_expire_comp_off runs", typeof (await val(null, "select leave_expire_comp_off()")), "number")
})

// ---- lock + payroll ----------------------------------------------------------------------
let regRun
await scenario("Lock refusals and payroll before lock", async () => {
  const pend = await val(U.STAFF2, "select regularise_request('2026-09-02', $1, null, 'pending one')", [ist("2026-09-02", "09:30")])
  const flagged = await rawPunch(U.SALES, "in", ist("2026-09-02", "11:00"), { mode: "field", flags: ["no_code"], review: "flagged" })
  like("staff cannot lock", await err(U.STAFF1, "select attendance_lock_month('2026-09-01')"), /cannot lock/)
  like("current month cannot be locked", await err(U.ACCT, "select attendance_lock_month($1)", [today]), /once it is over/)
  like("lock refused with 1 flagged + 1 pending", await err(U.ACCT, "select attendance_lock_month('2026-09-01')"),
    /1 flagged punch is waiting for review and 1 correction is waiting for a decision/)

  regRun = await val(U.PAY, "select payroll_run_create('2026-09-01', 'regular')")
  await run(U.PAY, "select payroll_run_save($1, $2, '{}')", [regRun, JSON.stringify([{ user_id: U.STAFF1, data: {}, gross: 1, net_pay: 1 }])])
  like("regular run submit refused while month unlocked", await err(U.PAY, "select payroll_run_transition($1, 'submit')", [regRun]), /Lock attendance for September 2026 first/)
  const off = await val(U.PAY, "select payroll_run_create('2026-09-01', 'off_cycle', 'bonus')")
  await run(U.PAY, "select payroll_run_save($1, $2, '{}')", [off, JSON.stringify([{ user_id: U.STAFF1, data: {}, gross: 1, net_pay: 1 }])])
  check("off-cycle run submits on an unlocked month", (await err(U.PAY, "select payroll_run_transition($1, 'submit')", [off])) === null, "null", "ok")

  await run(U.ADMIN, "select regularise_decide($1, false, 'no')", [pend])
  await run(U.ADMIN, "select attendance_review($1, 'accepted', 'at customer')", [flagged])
  check("lock succeeds after resolving", (await err(U.ACCT, "select attendance_lock_month('2026-09-01', 'Sept payroll')")) === null, "null", "ok")
  eq("attendance_months row", await one(null, "select locked_by, note from attendance_months where month = '2026-09-01'"), { locked_by: U.ACCT, note: "Sept payroll" })
})

await scenario("Locked month guard", async () => {
  like("punch insert into locked month refused", await err(null,
    "insert into attendance_punches (id, user_id, kind, at, day, mode) values (gen_random_uuid(), $1, 'in', '2026-09-21 04:00Z', '2026-09-21', 'office')", [U.STAFF1]), /locked for payroll/)
  like("correction in locked month refused", await err(U.STAFF1, "select regularise_request('2026-09-21', $1, null, 'late')", [ist("2026-09-21", "09:30")]), /locked for payroll/)
  like("override in locked month refused", await err(U.SUPER, "select attendance_override_day($1, '2026-09-21', 'P', 'reason')", [U.STAFF1]), /Unlock September 2026 first/)
  like("leave in locked month refused", await err(U.STAFF2, "select leave_apply('CL', '2026-09-22', '2026-09-22', 'full', 'full', 'x')"), /locked for payroll/)
  like("review of a locked punch refused", await err(U.ADMIN, "select attendance_review(id, 'rejected') from attendance_punches where user_id = $1 and day = '2026-09-02' limit 1", [U.STAFF1]), /locked for payroll/)
  const before = await dayRow(U.STAFF1, "2026-09-05")
  await recompute(U.STAFF1, "2026-09-05")
  eq("recompute leaves locked days alone", await dayRow(U.STAFF1, "2026-09-05"), before)
  const nAud = await val(null, "select count(*)::int from audit_log where table_name = 'holidays'")
  check("holiday added in a locked month does not error", (await err(U.ADMIN, "insert into holidays (day, name) values ('2026-09-24', 'Late add')")) === null, "null", "ok")
  eq("... and the locked day is unchanged (A)", (await dayRow(U.STAFF2, "2026-09-24")).status, "A")
  await run(U.ADMIN, "delete from holidays where day = '2026-09-24'")
  eq("(audit rows for the insert + delete)", (await val(null, "select count(*)::int from audit_log where table_name = 'holidays'")) - nAud, 2)
})

await scenario("Payroll summary + transitions after lock", async () => {
  like("staff cannot read the month summary", await err(U.STAFF1, "select * from attendance_month_summary('2026-09-01')"), /cannot see everyone/)
  const rows = (await run(U.PAY, "select * from attendance_month_summary('2026-09-01')")).rows
  check("payroll-only user reads the summary", rows.length >= 7, ">= 7 rows", rows.length)
  const s1 = rows.find((r) => r.user_id === U.STAFF1)
  const days = (await run(null, "select coalesce(override_status, status) s, late, flags from attendance_days where user_id = $1 and day >= '2026-09-01' and day < '2026-10-01'", [U.STAFF1])).rows
  const c = (x) => days.filter((d) => d.s === x).length
  const lates = days.filter((d) => d.late && ["P", "OD", "HD"].includes(d.s) && !d.flags.includes("auto_present")).length
  const payable = Math.max(0, c("P") + c("OD") + c("WO") + c("H") + c("L") + 0.5 * (c("HD") + c("MP")) - Math.floor(lates / 3) * 0.5)
  const missed = c("MP") + days.filter((d) => d.s === "A" && d.flags.includes("no_checkout")).length
  eq("STAFF1 payable matches P+OD+WO+H+L+0.5*(HD+MP)-late penalty", Number(s1.payable), payable)
  eq("STAFF1 missed counts no_checkout (Sep 8)", s1.missed, missed)
  check("missed >= 1", s1.missed >= 1, ">=1", s1.missed)
  eq("locked flag", s1.locked, true)
  const s2 = rows.find((r) => r.user_id === U.STAFF2)
  eq("STAFF2 leave counted", s2.leave, 1)

  check("regular run submits after lock", (await err(U.PAY, "select payroll_run_transition($1, 'submit')", [regRun])) === null, "null", "ok")
  like("submitter cannot approve own run", await err(U.PAY, "select payroll_run_transition($1, 'approve')", [regRun]), /Someone other than/)
  check("Super Admin approves", (await err(U.SUPER, "select payroll_run_transition($1, 'approve')", [regRun])) === null, "null", "ok")
})

await scenario("Unlock", async () => {
  like("admin cannot unlock", await err(U.ADMIN, "select attendance_unlock_month('2026-09-01', 'need to fix')"), /Only the Super Admin/)
  like("accounts cannot unlock", await err(U.ACCT, "select attendance_unlock_month('2026-09-01', 'need to fix')"), /Only the Super Admin/)
  like("short reason refused", await err(U.SUPER, "select attendance_unlock_month('2026-09-01', 'x')"), /Give a reason/)
  await run(U.SUPER, "select attendance_unlock_month('2026-09-01', 'fix a punch')")
  const a = await one(null, "select actor, action, changes, label from audit_log where table_name = 'attendance_months' order by id desc limit 1")
  eq("unlock audited with reason and who locked", [a.actor, a.action, a.changes.reason, a.changes.lockedBy, a.label],
    [U.SUPER, "delete", "fix a punch", U.ACCT, "Attendance for September 2026 unlocked"])
  eq("month no longer locked", await val(null, "select attendance_month_locked('2026-09-01')"), false)
  eq("admin reads attendance_months audit (register)", await val(U.ADMIN, "select count(*)::int from audit_log where table_name = 'attendance_months'"), 1)
  eq("staff does not", await val(U.STAFF1, "select count(*)::int from audit_log where table_name = 'attendance_months'"), 0)
})

// ---- RLS ----------------------------------------------------------------------------------
await scenario("RLS and internal functions", async () => {
  const S = U.STAFF1
  await run(U.SUPER, "update attendance_settings set doc = doc || '{\"graceMin\": 15}'::jsonb where id")
  await run(U.SUPER, "update attendance_settings set doc = doc || '{\"graceMin\": 10}'::jsonb where id")
  await run(U.SUPER, "update attendance_settings set doc = doc || '{\"graceMin\": 15}'::jsonb where id")
  eq("staff sees only own punches", await val(S, "select count(*)::int from attendance_punches where user_id <> $1", [S]), 0)
  check("staff sees own punches", (await val(S, "select count(*)::int from attendance_punches where user_id = $1", [S])) > 0, ">0", "")
  eq("staff sees only own days", await val(S, "select count(*)::int from attendance_days where user_id <> $1", [S]), 0)
  like("staff cannot insert a punch", await err(S, "insert into attendance_punches (id, user_id, kind, at, day, mode) values (gen_random_uuid(), $1, 'in', now(), current_date, 'office')", [S]), /row-level security/)
  eq("staff update of own day touches 0 rows", (await run(S, "update attendance_days set status = 'P' where user_id = $1", [S])).affectedRows, 0)
  like("staff cannot insert a day", await err(S, "insert into attendance_days (user_id, day, status) values ($1, '2026-08-03', 'P')", [S]), /row-level security/)
  eq("staff update of own punch touches 0 rows", (await run(S, "update attendance_punches set review = 'accepted' where user_id = $1", [S])).affectedRows, 0)
  like("staff cannot insert attendance_qr", await err(S, "insert into attendance_qr (site_id, token, expires_at) values ($1, 'x', now())", [SITE]), /row-level security|duplicate/)
  eq("staff reads no attendance_qr rows", await val(S, "select count(*)::int from attendance_qr"), 0)
  check("overtime exists for STAFF1", (await val(null, "select count(*)::int from attendance_overtime where user_id = $1", [S])) > 0, ">0", "")
  eq("staff reads no attendance_overtime (own included)", await val(S, "select count(*)::int from attendance_overtime"), 0)
  check("accounts (register/payroll) reads overtime", (await val(U.ACCT, "select count(*)::int from attendance_overtime")) > 0, ">0", "")
  check("payroll-only reads overtime", (await val(U.PAY, "select count(*)::int from attendance_overtime")) > 0, ">0", "")
  for (const [name, sql] of [
    ["module_access_for", `select module_access_for('${U.ADMIN}', 'attendance-team')`],
    ["attendance_recompute_day", `select attendance_recompute_day('${S}', '2026-09-01')`],
    ["attendance_close_day_all", "select attendance_close_day_all('2026-09-01')"],
    ["audit_row_plain", "select audit_row_plain()"],
    ["attendance_qr_next", `select attendance_qr_next('${SITE}', null)`],
    ["attendance_locate", `select * from attendance_locate('${S}', null, null)`],
    ["leave_recompute_range", `select leave_recompute_range('${S}', '2026-09-01', '2026-09-02')`],
  ]) {
    like(`staff cannot call ${name}`, await err(S, sql), /permission denied/)
    like(`anon cannot call ${name}`, await err("anon", sql), /permission denied/)
  }
  eq("service role: module_access_for(admin, attendance-team)", await val("service", `select module_access_for('${U.ADMIN}', 'attendance-team')`), true)
  eq("service role: module_access_for(staff, attendance-team)", await val("service", `select module_access_for('${S}', 'attendance-team')`), false)
  check("attendance_settings audit rows exist", (await val(null, "select count(*)::int from audit_log where table_name = 'attendance_settings' and actor is not null")) >= 2, ">=2 (15->10->15; a no-op update is skipped)", "")
  eq("staff reads no attendance_settings audit", await val(S, "select count(*)::int from audit_log where table_name = 'attendance_settings'"), 0)
  check("admin reads attendance_settings audit", (await val(U.ADMIN, "select count(*)::int from audit_log where table_name = 'attendance_settings'")) > 0, ">0", "")
  eq("staff reads no holidays audit (attendance-holidays)", await val(S, "select count(*)::int from audit_log where table_name = 'holidays'"), 0)
  for (const t of ["attendance_punches", "attendance_days", "attendance_overtime", "attendance_qr", "regularisations", "leave_requests", "leave_ledger", "audit_log", "attendance_settings", "holidays", "work_sites"])
    eq(`anon reads 0 rows of ${t}`, await val("anon", `select count(*)::int from ${t}`), 0)
  like("anon cannot punch", await err("anon", "select attendance_punch(gen_random_uuid(), 'in', null)"), /permission denied/)
  like("anon cannot insert a punch", await err("anon", `insert into attendance_punches (id, user_id, kind, at, day, mode) values (gen_random_uuid(), '${S}', 'in', now(), current_date, 'office')`), /row-level security|permission denied/)
  like("anon cannot request a correction", await err("anon", "select regularise_request(current_date, now(), null, 'xxx')"), /permission denied/)
  like("anon cannot insert holidays", await err("anon", "insert into holidays (day, name) values ('2026-11-01', 'x')"), /row-level security|permission denied/)
  like("signed-in but inactive user cannot punch", await err(U.INACT, "select attendance_punch(gen_random_uuid(), 'in', null)"), /active account/)
})

// ---- second pass of 0065 (fixes 15-25 in its header) ---------------------------------------
await scenario("Second pass: lock, leave and pay (15, 23, 24)", async () => {
  // September is unlocked here (Unlock scenario); regRun is approved.
  const lv = (await one(U.STAFF2, "select leave_apply('CL', '2026-09-25', '2026-09-25', 'full', 'full', 'pending over lock') as r")).r
  like("(15) lock refused while a leave request is pending in the month",
    await err(U.ACCT, "select attendance_lock_month('2026-09-01', 'relock')"), /September 2026 cannot be locked yet: 1 leave request is waiting for a decision/)
  like("(24) approved regular run cannot be paid while its month is unlocked",
    await err(U.PAY, "select payroll_run_transition($1, 'pay')", [regRun]), /Lock attendance for September 2026 first.*pay this pay run/)
  const src = await val(null, "select prosrc from pg_proc where proname = 'attendance_lock_month'")
  check("(23) lock_month recomputes before it takes the table locks",
    src.indexOf("attendance_close_day_all") > 0 && src.indexOf("attendance_close_day_all") < src.indexOf("lock table"), "recompute first", "")
  check("(23) lock order regularisations, leave_requests, attendance_punches",
    /lock table public\.regularisations, public\.leave_requests, public\.attendance_punches/.test(src), "unchanged", "")
  await run(U.ADMIN, "select leave_decide($1, false, 'no')", [lv.id])
  check("lock succeeds once the leave is decided", (await err(U.ACCT, "select attendance_lock_month('2026-09-01', 'relock')")) === null, "null", "ok")
  check("(24) ... and the regular run can then be paid", (await err(U.PAY, "select payroll_run_transition($1, 'pay')", [regRun])) === null, "null", "ok")
  // A request that reached a locked month anyway (filed before 0065).
  const stray = (await one(null, `insert into leave_requests (user_id, type_code, from_day, to_day, days, reason)
                                   values ($1, 'CL', '2026-09-28', '2026-09-28', 1, 'stray') returning id`, [U.STAFF2])).id
  like("(15) leave_decide refuses a request in a locked month", await err(U.ADMIN, "select leave_decide($1, true)", [stray]), /locked for payroll/)
  eq("(15) no ledger row written", await val(null, "select count(*)::int from leave_ledger where ref_id = $1", [stray]), 0)
  const multi = (await one(null, `insert into leave_requests (user_id, type_code, from_day, to_day, days, reason)
                                  values ($1, 'CL', '2026-08-31', '2026-09-01', 2, 'spans') returning id`, [U.STAFF2])).id
  like("(15) refused when only a later day of the request is locked", await err(U.ADMIN, "select leave_decide($1, false)", [multi]), /September 2026 is locked/)
  await run(null, "delete from leave_requests where id in ($1, $2)", [stray, multi])
})

await scenario("Second pass: Team section required (16)", async () => {
  const mon1 = `${today.slice(0, 8)}01`
  const corr = await val(U.STAFF1, "select regularise_request($1, $2, null, 'team check')", [mon1, ist(mon1, "09:30")])
  const lvp = (await one(U.STAFF2, "select leave_apply('CL', ($1::date + 19), ($1::date + 19), 'full', 'full', 'team check') as r", [today])).r
  const lva = (await one(U.STAFF2, "select leave_apply('CL', ($1::date + 21), ($1::date + 21), 'full', 'full', 'team check 2') as r", [today])).r
  await run(U.SUPER, "select leave_decide($1, true)", [lva.id])
  const pun = await val(null, "select id from attendance_punches where user_id = $1 and day = $2 limit 1", [U.SALES, today])
  await run(U.SUPER, "update profiles set modules_hidden = '[\"attendance-team\"]' where id = $1", [U.ADMIN])
  eq("Admin without Team: has_module_access false", await val(U.ADMIN, "select has_module_access('attendance-team')"), false)
  like("(16) regularise_decide refused", await err(U.ADMIN, "select regularise_decide($1, true)", [corr]), /Only an admin with the Team section/)
  like("(16) leave_decide refused", await err(U.ADMIN, "select leave_decide($1, true)", [lvp.id]), /Only an admin with the Team section/)
  like("(16) leave_cancel of someone else's leave refused", await err(U.ADMIN, "select leave_cancel($1, 'x')", [lva.id]), /cannot cancel someone else/)
  like("(16) attendance_review refused", await err(U.ADMIN, "select attendance_review($1, 'accepted')", [pun]), /Only an admin with the Team section/)
  await run(U.SUPER, "update profiles set modules_hidden = '[]' where id = $1", [U.ADMIN])
  check("(16) with Team back, Admin decides", (await err(U.ADMIN, "select regularise_decide($1, false, 'no')", [corr])) === null, "null", "ok")
  like("(16) Accounts (not an admin) still cannot review", await err(U.ACCT, "select attendance_review($1, 'accepted')", [pun]), /Only an admin/)
  await run(U.ADMIN, "select leave_decide($1, false)", [lvp.id])
  await run(U.SUPER, "select leave_cancel($1)", [lva.id])
})

await scenario("Second pass: cap, text limits, cancel_note (17, 18, 19)", async () => {
  const mon1 = `${today.slice(0, 8)}01`
  const prevCap = await val(null, "select doc -> 'correctionsPerMonth' from attendance_settings where id")
  await setCfg({ correctionsPerMonth: 2 })
  const c1 = await val(U.PAY, "select regularise_request($1, $2, null, $3)", [mon1, ist(mon1, "09:30"), "r".repeat(600)])
  eq("(18) correction reason cut to 500", await val(null, "select length(reason) from regularisations where id = $1", [c1]), 500)
  await run(U.ADMIN, "select regularise_decide($1, false, 'no')", [c1])
  const c2 = await val(U.PAY, "select regularise_request($1, $2, null, 'second')", [mon1, ist(mon1, "09:31")])
  await run(U.PAY, "select regularise_cancel($1)", [c2])
  like("(17) a rejected and a cancelled one use up a cap of 2", await err(U.PAY, "select regularise_request($1, $2, null, 'third')", [mon1, ist(mon1, "09:32")]), /used all 2 corrections/)
  await setCfg({ correctionsPerMonth: prevCap })

  const a = (await one(U.STAFF2, "select leave_apply('CL', ($1::date + 25), ($1::date + 25), 'full', 'full', $2) as r", [today, "l".repeat(700)])).r
  eq("(18) leave reason cut to 500 (the column allows 500)", await val(null, "select length(reason) from leave_requests where id = $1", [a.id]), 500)
  await run(U.ADMIN, "select leave_decide($1, true, 'enjoy')", [a.id])
  await run(U.STAFF2, "select leave_cancel($1, $2)", [a.id, "c".repeat(600)])
  const r1 = await one(null, "select status, decision_note, length(cancel_note) n, cancelled_by from leave_requests where id = $1", [a.id])
  eq("(19) own cancel keeps the approver's decision_note; cancel_note holds theirs, cut to 500 (18)", r1,
    { status: "cancelled", decision_note: "enjoy", n: 500, cancelled_by: U.STAFF2 })
  const b = (await one(U.STAFF2, "select leave_apply('CL', ($1::date + 26), ($1::date + 26), 'full', 'full', 'trip') as r", [today])).r
  await run(U.ADMIN, "select leave_decide($1, true, 'fine')", [b.id])
  await run(U.SUPER, "select leave_cancel($1, 'office closed')", [b.id])
  eq("(19) admin cancel writes both notes", await one(null, "select decision_note, cancel_note from leave_requests where id = $1", [b.id]),
    { decision_note: "office closed", cancel_note: "office closed" })
  const c = (await one(U.STAFF2, "select leave_apply('CL', ($1::date + 28), ($1::date + 28), 'full', 'full', 'trip') as r", [today])).r
  await run(U.STAFF2, "select leave_cancel($1)", [c.id])
  eq("(19) own cancel of a pending request with no note: both null", await one(null, "select decision_note, cancel_note from leave_requests where id = $1", [c.id]),
    { decision_note: null, cancel_note: null })
})

await scenario("Second pass: QR viewers and stations (21, 22)", async () => {
  await run(null, "update attendance_qr set expires_at = now() - interval '1 second' where site_id = $1", [SITE])
  const s = await show(U.ADMIN)
  eq("(21) a new code starts with only its first viewer", (await qrRow()).viewers, [U.ADMIN])
  const x1 = await val(null, "select xmin::text from attendance_qr where site_id = $1", [SITE])
  await show(U.ADMIN)
  eq("(21) the same screen again writes nothing (xmin unchanged)", await val(null, "select xmin::text from attendance_qr where site_id = $1", [SITE]), x1)
  await show(U.SUPER)
  const q = await qrRow()
  eq("(21) a second account joins viewers; shown_by stays the first", [q.viewers, q.shown_by], [[U.ADMIN, U.SUPER], U.ADMIN])
  const p = await punch(U.ADMIN, "in", s.payload)
  eq("(21) a viewer punching with that code -> flagged own_code", [p.status, p.flags], ["flagged", ["own_code"]])
  const pr = await pRow(p.id)
  eq("(21) punch row flagged, qr_shown_by kept", [pr.review, pr.qr_shown_by], ["flagged", U.ADMIN])
  eq("(21) burned: the next code has no viewers", (await qrRow()).viewers, [])
  const s2 = await show(U.SUPER)
  const p2 = await punch(U.PAY, "out", s2.payload)
  eq("(21) a non-viewer is not flagged", [p2.status, p2.flags], ["ok", []])

  const SITE_B = randomUUID()
  await run(null, "insert into work_sites (id, name, lat, lng) values ($1, 'Warehouse', 28.5, 77.1)", [SITE_B])
  await run(null, "insert into attendance_people (user_id, mode, site_ids) values ($1, 'office', $2) on conflict (user_id) do update set site_ids = excluded.site_ids", [U.ACCT, [SITE_B]])
  await run(null, "delete from attendance_punches where user_id = $1 and day = $2", [U.ACCT, today])
  const p3 = await punch(U.ACCT, "in", (await show(U.ADMIN)).payload)
  eq("(22) person limited to Warehouse scanning Head office -> flagged other_site", [p3.status, p3.flags, p3.site], ["flagged", ["other_site"], "Head office"])
  const sb = (await one(U.ADMIN, "select attendance_qr_show($1) as r", [SITE_B])).r
  const p4 = await punch(U.ACCT, "out", sb.payload)
  eq("(22) their own station -> no flag", [p4.status, p4.flags, p4.site], ["ok", [], "Warehouse"])
})

await scenario("Second pass: leave-documents delete (25)", async () => {
  const ins = (name) => run(null, "insert into storage.objects (bucket_id, name) values ('leave-documents', $1)", [name])
  const mine = `${U.STAFF1}/orphan.pdf`, used = `${U.STAFF1}/cert.pdf`, other = `${U.STAFF2}/theirs.pdf`
  for (const n of [mine, used, other]) await ins(n)
  await run(U.STAFF1, "select leave_apply('CL', ($1::date + 30), ($1::date + 30), 'full', 'full', 'with doc', $2)", [today, used])
  const del = async (who, n) => (await run(who, "delete from storage.objects where bucket_id = 'leave-documents' and name = $1", [n])).affectedRows
  eq("(25) own unreferenced file: deleted", await del(U.STAFF1, mine), 1)
  eq("(25) own file a leave request names: kept", await del(U.STAFF1, used), 0)
  eq("(25) someone else's file: kept", await del(U.STAFF1, other), 0)
  eq("(25) an admin cannot delete it either", await del(U.ADMIN, other), 0)
  eq("(25) anon cannot", await del("anon", other), 0)
  eq("two files left", await val(null, "select count(*)::int from storage.objects where bucket_id = 'leave-documents'"), 2)
})

// ---- payments (0066) -----------------------------------------------------------------------
const J = (o) => JSON.stringify(o)
const newInvoice = async (who, doc) => (await one(who, "insert into invoices (doc) values ($1) returning id", [J(doc)])).id
const newPayment = async (who, doc) => (await one(who, "insert into payments (doc) values ($1) returning id", [J({ type: "inflow", method: "UPI", ...doc })])).id
const invDoc = (id) => val(null, "select doc from invoices where id = $1", [id])
const payDoc = (id) => val(null, "select doc from payments where id = $1", [id])
let qaInv

await scenario("Payments: invoice paid status in SQL (0066 1)", async () => {
  qaInv = await newInvoice(U.ACCT, { number: "INV-QA-1", status: "sent", totals: { grandTotal: 1000 }, amountPaid: 0, dueDate: "2026-10-20T00:00:00Z" })
  const p1 = await newPayment(U.ACCT, { number: "PAY-QA-1", amount: 400, date: "2026-10-01T06:30:00.000Z", invoiceId: qaInv })
  let d = await invDoc(qaInv)
  eq("400 of 1000 -> partial, no paidAt", [d.amountPaid, d.status, d.paidAt ?? null], [400, "partial", null])
  const p2 = await newPayment(U.ACCT, { number: "PAY-QA-2", amount: 599.6, date: "2026-10-03T06:30:00.000Z", invoiceId: qaInv })
  d = await invDoc(qaInv)
  eq("0.40 left is within 0.50 -> paid, paidAt = latest payment date", [d.amountPaid, d.status, d.paidAt], [999.6, "paid", "2026-10-03T06:30:00.000Z"])
  await run(U.ACCT, "update invoices set doc = $2 where id = $1", [qaInv, J({ ...d, amountPaid: 0, status: "sent", paidAt: undefined, notes: "edited on a stale screen" })])
  d = await invDoc(qaInv)
  eq("a stale whole-doc save cannot put amountPaid/status back", [d.amountPaid, d.status, d.notes], [999.6, "paid", "edited on a stale screen"])
  await run(U.ACCT, "update invoices set doc = jsonb_set(doc, '{totals,grandTotal}', '2000') where id = $1", [qaInv])
  eq("raising the grand total re-derives partial", (await invDoc(qaInv)).status, "partial")
  await run(U.ACCT, "update invoices set doc = jsonb_set(doc, '{totals,grandTotal}', '1000') where id = $1", [qaInv])
  await run(U.ACCT, "delete from payments where id = $1", [p2])
  d = await invDoc(qaInv)
  eq("deleting one payment -> partial again, paidAt removed", [d.amountPaid, d.status, d.paidAt ?? null], [400, "partial", null])
  await run(U.ACCT, "delete from payments where id = $1", [p1])
  d = await invDoc(qaInv)
  eq("deleting the last payment -> back to sent, amountPaid 0", [d.amountPaid, d.status], [0, "sent"])

  const inv2 = await newInvoice(U.ACCT, { number: "INV-QA-2", status: "sent", totals: { grandTotal: 500 } })
  const p3 = await newPayment(U.ACCT, { number: "PAY-QA-3", amount: 500, invoiceId: qaInv })
  await run(U.ACCT, "update payments set doc = doc || $2 where id = $1", [p3, J({ invoiceId: inv2 })])
  eq("moving a payment recomputes both invoices", [(await invDoc(qaInv)).status, (await invDoc(inv2)).status], ["sent", "paid"])
  await run(U.ACCT, "delete from payments where id = $1", [p3])
  await run("service", "update profiles set modules = '[\"payments\"]' where id = $1", [U.STAFF2])
  like("staff with payments only cannot read invoices", String(await val(U.STAFF2, "select count(*)::int from invoices")), /^0$/)
  const p4 = await newPayment(U.STAFF2, { number: "PAY-QA-4", amount: 1000, invoiceId: qaInv })
  eq("a payments-only person still updates the invoice cache (definer)", (await invDoc(qaInv)).status, "paid")
  await run(U.STAFF2, "delete from payments where id = $1", [p4])
  await run("service", "update profiles set modules = '[]' where id = $1", [U.STAFF2])
  eq("draft stays draft whatever is paid", (await invDoc(await newInvoice(U.ACCT, { status: "draft", totals: { grandTotal: 10 } }))).status, "draft")
})

await scenario("Payments: validation, numbers, created_at (0066 2, 3, 7)", async () => {
  like("payout cannot carry an invoiceId", await err(U.ACCT, "insert into payments (doc) values ($1)", [J({ type: "payout", amount: 10, invoiceId: qaInv })]), /payout cannot be linked/)
  like("unknown invoiceId refused", await err(U.ACCT, "insert into payments (doc) values ($1)", [J({ type: "inflow", amount: 10, invoiceId: randomUUID() })]), /invoice that does not exist/)
  like("garbage invoiceId refused", await err(U.ACCT, "insert into payments (doc) values ($1)", [J({ type: "inflow", amount: 10, invoiceId: "INV-1" })]), /invoice that does not exist/)
  for (const [label, amount] of [["0", 0], ["negative", -5], ["a string", "100"], ["1e10", 1e10], ["missing", undefined]]) {
    like(`amount ${label} refused`, await err(U.ACCT, "insert into payments (doc) values ($1)", [J({ type: "inflow", amount })]), /amount must be a number/)
  }
  like("missing type refused", await err(U.ACCT, "insert into payments (doc) values ($1)", [J({ amount: 5 })]), /inflow or a payout/)
  await db.query("begin")
  let chk = null
  try {
    await db.query("set local session_replication_role = replica")
    await db.query("insert into payments (doc) values ('{\"amount\":\"5\"}')")
  } catch (e) { chk = e.message }
  await db.query("rollback")
  like("the CHECK holds with the triggers off (string amount, no type)", chk, /payments_doc_valid/)
  const blank = await newPayment(U.ACCT, { type: "payout", amount: 1, number: "", party: "Tea" })
  check("blank invoiceId and blank number are fine", !!blank, "inserted", blank)
  await newPayment(U.ACCT, { type: "payout", amount: 1, number: "" })
  await newPayment(U.ACCT, { number: "PAY-QA-DUP", amount: 10 })
  like("duplicate payment number refused", await err(U.ACCT, "insert into payments (doc) values ($1)", [J({ type: "inflow", number: "PAY-QA-DUP", amount: 20 })]), /payments_number_key/)
  const r = await one(U.ACCT, "insert into payments (doc, created_at) values ($1, '2020-01-01') returning id, created_at::text c", [J({ type: "inflow", amount: 5 })])
  check("created_at forced to now() for a person", r.c.startsWith("2026-10"), "2026-10...", r.c)
  await run(U.ACCT, "update payments set created_at = '2020-01-01' where id = $1", [r.id])
  check("created_at cannot be moved on update", (await val(null, "select created_at::text from payments where id = $1", [r.id])).startsWith("2026-10"), "2026-10...", "moved")
  const s = await one("service", "insert into payments (doc, created_at) values ($1, '2025-01-01') returning created_at::text c", [J({ type: "inflow", amount: 5 })])
  eq("the service keeps its created_at", s.c.slice(0, 10), "2025-01-01")
})

await scenario("Payments: Tally stamp, tally_mark, synced freeze (0066 4, 5, 6)", async () => {
  const p = await newPayment(U.ACCT, { number: "PAY-QA-T1", amount: 50, party: "A", tally: { status: "synced" } })
  eq("a forged tally on insert is stripped", (await payDoc(p)).tally ?? null, null)
  like("tally_mark refused for a signed-in user", await err(U.ADMIN, "select tally_mark('payments', $1, '{\"status\":\"synced\"}')", [p]), /permission denied/)
  like("tally_mark refused for anon", await err("anon", "select tally_mark('payments', $1, '{\"status\":\"synced\"}')", [p]), /permission denied/)
  like("tally_mark refuses a table off the list", await err("service", "select tally_mark('profiles', $1, '{}')", [p]), /unknown table/)
  eq("tally_mark on a missing row -> false", await val("service", "select tally_mark('payments', $1, '{}')", [randomUUID()]), false)
  eq("tally_mark by the service -> true", await val("service", "select tally_mark('payments', $1, $2)", [p, J({ status: "synced", voucherRef: "R1" })]), true)
  eq("stamp written, rest untouched", [(await payDoc(p)).tally, (await payDoc(p)).amount], [{ status: "synced", voucherRef: "R1" }, 50])
  await run(U.ACCT, "update payments set doc = doc || $2 where id = $1", [p, J({ note: "seen", tally: { status: "error" } })])
  eq("a person changing tally is reverted; the note lands", [(await payDoc(p)).tally.status, (await payDoc(p)).note], ["synced", "seen"])
  await run(U.ACCT, "update payments set doc = doc - 'tally' where id = $1", [p])
  eq("a whole doc without tally keeps the stored stamp", (await payDoc(p)).tally?.status, "synced")
  for (const [k, v] of [["amount", 51], ["type", "payout"], ["date", "2026-09-01"], ["party", "B"]]) {
    like(`synced: accounts cannot change ${k}`, await err(U.ACCT, "update payments set doc = doc || $2 where id = $1", [p, J({ [k]: v })]), /already in Tally/)
  }
  like("synced: an admin cannot change the invoice link", await err(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [p, J({ invoiceId: qaInv })]), /already in Tally/)
  like("synced: accounts cannot delete", await err(U.ACCT, "delete from payments where id = $1", [p]), /already in Tally/)
  like("synced: an admin cannot delete", await err(U.ADMIN, "delete from payments where id = $1", [p]), /already in Tally/)
  await run(U.SUPER, "update payments set doc = doc || '{\"amount\": 52}' where id = $1", [p])
  eq("synced: the Super Admin can change the amount", (await payDoc(p)).amount, 52)
  eq("synced: the Super Admin can delete", (await run(U.SUPER, "delete from payments where id = $1", [p])).affectedRows, 1)

  const imp = { number: "TALLY-1", status: "sent", totals: { grandTotal: 100 } }
  const i1 = await newInvoice(U.ADMIN, { ...imp, tally: { status: "synced", syncedAt: "2026-10-01T00:00:00Z", voucherRef: "TALLY-1" } })
  eq("an invoice in the Tally import's shape keeps its stamp (admin)", (await invDoc(i1)).tally, { status: "synced", syncedAt: "2026-10-01T00:00:00Z", voucherRef: "TALLY-1" })
  const i2 = await newInvoice(U.ACCT, { ...imp, number: "TALLY-2", tally: { status: "synced", voucherRef: "X", error: "" } })
  eq("any other tally on a new invoice is stripped", (await invDoc(i2)).tally ?? null, null)
  const i3 = await newInvoice(U.ACCT, { ...imp, number: "INV-QA-3", tally: null })
  eq("createInvoice's tally: null is dropped", Object.hasOwn(await invDoc(i3), "tally"), false)
  await run(U.ACCT, "update invoices set doc = doc || '{\"tally\":{\"status\":\"error\"}}' where id = $1", [i1])
  eq("an invoice's stamp cannot be changed by a person", (await invDoc(i1)).tally.status, "synced")
  await run(U.ACCT, "update invoices set doc = doc || '{\"tally\":{\"status\":\"synced\"}}' where id = $1", [i3])
  eq("nor added by one", Object.hasOwn(await invDoc(i3), "tally"), false)
})

await scenario("Payments: numbering, invoice delete, Anu, realtime (0066 8-11)", async () => {
  like("staff without invoices cannot take an invoice number", await err(U.STAFF1, "select next_sequence('invoice')"), /without the invoices module/)
  check("accounts can", Number.isInteger(await val(U.ACCT, "select next_sequence('invoice')")), "an int", "")
  check("accounts can take a payment number", Number.isInteger(await val(U.ACCT, "select next_sequence('payment')")), "an int", "")
  like("accounts cannot take a quotation number", await err(U.ACCT, "select next_sequence('quotation')"), /quotations module/)
  like("an unknown series is refused", await err(U.SUPER, "select next_sequence('bogus')"), /Unknown number series/)
  check("the Super Admin can", Number.isInteger(await val(U.SUPER, "select next_sequence('quotation')")), "an int", "")
  check("the service role can", Number.isInteger(await val("service", "select next_sequence('payment')")), "an int", "")
  like("anon cannot", await err("anon", "select next_sequence('payment')"), /Active session|permission denied/)

  const p = await newPayment(U.ACCT, { number: "PAY-QA-DEL", amount: 10, invoiceId: qaInv })
  like("an invoice with payments cannot be deleted", await err(U.ACCT, "delete from invoices where id = $1", [qaInv]), /This invoice has payments/)
  like("not even by the service", await err(null, "delete from invoices where id = $1", [qaInv]), /This invoice has payments/)
  await run(U.ACCT, "delete from payments where id = $1", [p])
  eq("once its payments are gone it can", (await run(U.ACCT, "delete from invoices where id = $1", [qaInv])).affectedRows, 1)

  eq("safe_num", await one(null, "select safe_num('12.5') a, safe_num('1,000') b, safe_num('abc') c, safe_num('1e30') d, safe_num(null) e"),
    { a: "12.5", b: null, c: null, d: null, e: null })
  await newInvoice(null, { number: "INV-QA-BAD", status: "sent", totals: { grandTotal: "lots" }, dueDate: "2026-09-01T00:00:00Z" })
  await run(null, "insert into quotations (doc) values ('{\"status\":\"sent\",\"totals\":{\"grandTotal\":\"n/a\"}}')")
  // A legacy payment with a text amount: only possible with the CHECK and triggers out of the way, inside one rolled-back transaction.
  await db.query("begin")
  let txt = null
  try {
    await db.query("set local session_replication_role = replica")
    await db.query("alter table payments drop constraint payments_doc_valid")
    await db.query("insert into payments (doc, created_at) values ('{\"type\":\"inflow\",\"amount\":\"1,200\",\"invoiceId\":null}', now() - interval '1 day')")
    txt = (await db.query("select anu_daily_update('management', $1::date) t", [today])).rows[0].t
  } catch (e) { txt = "ERROR " + e.message }
  await db.query("rollback")
  like("anu_daily_update survives malformed amounts and totals", txt, /Overdue invoices: .*\n[\s\S]*Payments received yesterday/)
  eq("the CHECK is back after the rollback", await val(null, "select count(*)::int from pg_constraint where conname = 'payments_doc_valid'"), 1)
  const full = await val(U.ACCT, "select anu_team_update('accounts')")
  like("accounts' own update has the money lines", full, /Overdue invoices[\s\S]*Payments received yesterday/)
  await run(U.SUPER, "update profiles set modules_hidden = '[\"payments\"]' where id = $1", [U.ACCT])
  const noPay = await val(U.ACCT, "select anu_team_update('accounts')")
  check("without payments: no payments line, invoices stay", /Overdue invoices/.test(noPay) && !/Payments received/.test(noPay), "invoices only", noPay)
  await run(U.SUPER, "update profiles set modules_hidden = '[\"payments\",\"invoices\"]' where id = $1", [U.ACCT])
  check("without either: no money at all", !/Overdue invoices|Payments received/.test(await val(U.ACCT, "select anu_team_update('accounts')")), "no money", "")
  await run(U.SUPER, "update profiles set modules_hidden = '[]' where id = $1", [U.ACCT])
  like("anu_daily_update is not callable directly", await err(U.ADMIN, "select anu_daily_update('accounts', current_date)"), /permission denied/)

  const pub = (await run(null, "select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).rows.map((r) => r.tablename)
  check("realtime publishes payments, invoices and the shared doc tables",
    ["payments", "invoices", "products", "categories", "customers", "enquiries", "quotations", "work"].every((t) => pub.includes(t)), "all", pub)
})

// Runs sql inside one transaction after `prep` statements, rolled back unless commit.
async function inTx(prep, sql, params = [], commit = false) {
  await db.query("begin")
  try {
    for (const [q, p] of prep) await db.query(q, p ?? [])
    const r = await db.query(sql, params)
    await db.query(commit ? "commit" : "rollback")
    return r
  } catch (e) {
    await db.query("rollback")
    throw e
  }
}

await scenario("Payments second pass (0066 a-j)", async () => {
  const stamp = { status: "synced", syncedAt: "2026-10-02T00:00:00Z", voucherRef: "T-9" }
  const base = { status: "sent", totals: { grandTotal: 100 } }
  // b. the Tally import shape needs an admin
  eq("b: a non-admin's new invoice in the import shape loses it", Object.hasOwn(await invDoc(await newInvoice(U.ACCT, { ...base, number: "SP-1", tally: stamp })), "tally"), false)
  const plain = await newInvoice(U.ACCT, { ...base, number: "SP-2" })
  await run(U.ACCT, "update invoices set doc = doc || $2 where id = $1", [plain, J({ tally: stamp })])
  eq("b: a non-admin cannot stamp a console-made invoice", Object.hasOwn(await invDoc(plain), "tally"), false)
  await run(U.ADMIN, "update invoices set doc = doc || $2 where id = $1", [plain, J({ tally: { ...stamp, error: "" } })])
  eq("b: an admin's other shape is stripped on update", Object.hasOwn(await invDoc(plain), "tally"), false)
  await run(U.ADMIN, "update invoices set doc = doc || $2 where id = $1", [plain, J({ notes: "Imported from Tally XML", tally: stamp })])
  eq("b: an admin's overwrite from Tally XML stamps a console-made invoice", (await invDoc(plain)).tally, stamp)
  await run(U.ADMIN, "update invoices set doc = doc || $2 where id = $1", [plain, J({ tally: { ...stamp, voucherRef: "T-10" } })])
  eq("b: an existing stamp is kept, even against an admin", (await invDoc(plain)).tally.voucherRef, "T-9")
  const nulled = await newInvoice(null, { ...base, number: "SP-3", tally: null })
  await run(U.ADMIN, "update invoices set doc = doc || $2 where id = $1", [nulled, J({ tally: stamp })])
  eq("b: a stored tally: null counts as no stamp", (await invDoc(nulled)).tally, stamp)

  // c. invoiceId normalised, invoiceNumber and customer from the invoice
  const inv = await newInvoice(U.ACCT, { ...base, number: "SP-INV", customer: { name: "Real Co", phone: "9000000001" } })
  const p = await newPayment(U.ACCT, { number: "SP-P1", amount: 10, invoiceId: `  ${inv.toUpperCase()} `, invoiceNumber: "WRONG", customer: { name: "Someone else" } })
  let d = await payDoc(p)
  eq("c: invoiceId trimmed and lower-cased; invoiceNumber and customer from the invoice", [d.invoiceId, d.invoiceNumber, d.customer], [inv, "SP-INV", { name: "Real Co", phone: "9000000001" }])
  eq("c: the normalised link still settles the invoice", (await invDoc(inv)).amountPaid, 10)
  await run(U.ACCT, "update invoices set doc = doc || $2 where id = $1", [inv, J({ number: "SP-INV-B", customer: { name: "Renamed Co" } })])
  await run(U.ACCT, "update payments set doc = doc || $2 where id = $1", [p, J({ note: "any edit", invoiceNumber: "X" })])
  d = await payDoc(p)
  eq("c: every update re-derives them (no early return)", [d.invoiceNumber, d.customer.name, d.note], ["SP-INV-B", "Renamed Co", "any edit"])
  await run(U.ACCT, "update payments set doc = doc || $2 where id = $1", [p, J({ invoiceId: "" })])
  d = await payDoc(p)
  eq("c: unlinking clears invoiceNumber and stores a null invoiceId", [Object.hasOwn(d, "invoiceNumber"), d.invoiceId], [false, null])
  const adv = await newPayment(U.ACCT, { number: "SP-P2", amount: 5, invoiceNumber: "INV-STALE" })
  eq("c: a payment with no invoice has no invoiceNumber", Object.hasOwn(await payDoc(adv), "invoiceNumber"), false)
  const gone = randomUUID()
  const legacy = (await inTx([["set local session_replication_role = replica"]],
    "insert into payments (doc) values ($1) returning id", [J({ type: "inflow", amount: 7, number: "SP-LEGACY", invoiceId: gone })], true)).rows[0].id
  await run(U.ACCT, "update payments set doc = doc || '{\"note\":\"kept\"}' where id = $1", [legacy])
  eq("c: a row whose invoice is gone can still be edited", (await payDoc(legacy)).note, "kept")
  eq("c: ... and stamped by the connector", await val("service", "select tally_mark('payments', $1, $2)", [legacy, J(stamp)]), true)
  like("c: moving it to another missing invoice is refused", await err(U.SUPER, "update payments set doc = doc || $2 where id = $1", [legacy, J({ invoiceId: randomUUID() })]), /invoice that does not exist/)

  // d. account
  const acc = await newPayment(U.ACCT, { number: "SP-P3", amount: 5, account: "Petty Cash" })
  eq("d: a person's new payment loses account", Object.hasOwn(await payDoc(acc), "account"), false)
  const sacc = await newPayment("service", { number: "SP-P4", amount: 5, account: "HDFC" })
  await run(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [sacc, J({ account: "Petty Cash", note: "n" })])
  eq("d: an update keeps the stored account", [(await payDoc(sacc)).account, (await payDoc(sacc)).note], ["HDFC", "n"])
  await run(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [acc, J({ account: "Petty Cash" })])
  eq("d: nor can one be added", Object.hasOwn(await payDoc(acc), "account"), false)

  // e. ids
  like("e: a payment's id cannot change", await err(U.ACCT, "update payments set id = $2 where id = $1", [acc, randomUUID()]), /payment's id cannot be changed/)
  like("e: an invoice's id cannot change", await err(U.ACCT, "update invoices set id = $2 where id = $1", [plain, randomUUID()]), /invoice's id cannot be changed/)
  like("e: not even for the service", await err("service", "update payments set id = $2 where id = $1", [acc, randomUUID()]), /payment's id cannot be changed/)

  // a. a forged JWT claim is not the service
  const forged = (await inTx([
    ["select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [J({ sub: U.ACCT, role: "service_role" }), U.ACCT]],
    ["set local role authenticated"],
  ], "insert into payments (doc) values ($1) returning doc", [J({ type: "inflow", amount: 3, number: "SP-FORGED", tally: stamp, account: "X" })])).rows[0].doc
  eq("a: a session claiming service_role in its JWT is still a person", [forged.tally ?? null, forged.account ?? null], [null, null])
  eq("a: the service role is still the service", (await payDoc(sacc)).account, "HDFC")

  // f. synced freeze on more fields
  await val("service", "select tally_mark('payments', $1, $2)", [adv, J(stamp)])
  for (const [k, v] of [["customer", { name: "B" }], ["number", "SP-P2X"], ["reference", "UTR9"], ["invoiceNumber", "INV-9"]]) {
    like(`f: synced: accounts cannot change ${k}`, await err(U.ACCT, "update payments set doc = doc || $2 where id = $1", [adv, J({ [k]: v })]), /already in Tally/)
  }
  await run(U.ACCT, "update payments set doc = doc || '{\"note\":\"ok\"}' where id = $1", [adv])
  eq("f: synced: a note still saves", (await payDoc(adv)).note, "ok")

  // g. anon
  for (const t of ["payments", "invoices", "customers", "quotations"]) {
    like(`g: anon cannot select ${t}`, await err("anon", `select count(*) from ${t}`), /permission denied/)
  }
  await run("anon", "insert into enquiries (doc) values ($1)", [J({ status: "new", message: "hi", customer: { name: "Anon QA", email: "anon-qa@test.local", phone: "9876500011" } })])
  eq("g: the website's anon enquiry still saves and makes its customer", await val(null, "select count(*)::int from customers where doc ->> 'email' = 'anon-qa@test.local'"), 1)

  // h. helpers
  like("h: anon cannot call safe_num", await err("anon", "select safe_num('1')"), /permission denied/)
  like("h: anon cannot call is_service_caller", await err("anon", "select is_service_caller()"), /permission denied/)
  eq("h: a signed-in person can (the invoker triggers need it)", await val(U.ACCT, "select is_service_caller()"), false)

  // i. doc_merge
  await val("service", "select tally_mark('invoices', $1, $2)", [inv, J({ status: "synced", voucherRef: "SP-INV-B" })])
  const merged = await val("service", "select doc_merge('invoices', $1, $2)", [inv, J({ feedback: { rating: 5 } })])
  eq("i: doc_merge keeps a stamp written meanwhile and returns the row", [merged.id, merged.doc.feedback.rating, merged.doc.tally.status], [inv, 5, "synced"])
  eq("i: a missing row -> null", await val("service", "select doc_merge('leads', $1, '{}')", [randomUUID()]), null)
  like("i: a table off the list is refused", await err("service", "select doc_merge('payments', $1, '{}')", [p]), /unknown table/)
  like("i: a patch that is not an object is refused", await err("service", "select doc_merge('leads', $1, '[]')", [p]), /must be an object/)
  like("i: a signed-in person cannot call it", await err(U.ADMIN, "select doc_merge('invoices', $1, '{}')", [inv]), /permission denied/)

  // j. legacy row that fails the CHECK
  const def = await val(null, "select pg_get_constraintdef(oid) from pg_constraint where conname = 'payments_doc_valid'")
  const j = (await inTx([
    ["set local session_replication_role = replica"],
    ["alter table payments drop constraint payments_doc_valid"],
    ["insert into payments (id, doc) values ('00000000-0000-4000-8000-00000000bad1', '{\"type\":\"inflow\",\"amount\":\"100\"}')"],
    [`alter table payments add constraint payments_doc_valid ${def}`],
    ["set local session_replication_role = origin"],
    ["set local role service_role"],
  ], "select tally_mark('payments', '00000000-0000-4000-8000-00000000bad1', $1) ok, (select doc from payments where id = '00000000-0000-4000-8000-00000000bad1') doc", [J(stamp)])).rows[0]
  eq("j: tally_mark on a legacy row failing the CHECK -> false, no error, row untouched", [j.ok, j.doc], [false, { type: "inflow", amount: "100" }])

  for (const id of [p, adv, legacy, acc, sacc]) await run(null, "delete from payments where id = $1", [id])
})

// ---- Owner and Super Admins (0067) ---------------------------------------------------------
await scenario("Owner and Super Admins (0067)", async () => {
  const CO = "00000000-0000-4000-8000-0000000000b1", CO2 = "00000000-0000-4000-8000-0000000000b2"
  const NEW = "00000000-0000-4000-8000-0000000000b3"
  for (const [id, n] of [[CO, "CO"], [CO2, "CO2"], [NEW, "NEW"]]) {
    await run(null, "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, `${n.toLowerCase()}@test.local`, JSON.stringify({ name: n })])
  }
  for (const id of [CO, CO2]) await run("service", "update profiles set role = 'admin', active = true where id = $1", [id])
  const OWN = /Only the Owner \(.+\) can make or remove a Super Admin/
  const prof = (id) => one(null, "select role, active, is_owner from profiles where id = $1", [id])

  eq("the 0032 Super Admin is the Owner, and the only one", (await run(null, "select id from profiles where is_owner")).rows.map((r) => r.id), [U.SUPER])
  eq("is_owner(): Owner true, Admin false", [await val(U.SUPER, "select is_owner()"), await val(U.ADMIN, "select is_owner()")], [true, false])
  eq("the one-Super-Admin index is gone", await val(null, "select count(*)::int from pg_indexes where indexname = 'profiles_one_super_admin'"), 0)

  // the Owner makes Super Admins
  await run(U.SUPER, "update profiles set role = 'super_admin' where id = any($1)", [[CO, CO2]])
  eq("the Owner promotes two Admins to Super Admin", [(await prof(CO)).role, (await prof(CO2)).role], ["super_admin", "super_admin"])
  eq("a co-Super Admin passes is_super_admin, is_payroll, is_admin; not is_owner",
    await one(CO, "select is_super_admin() sa, is_payroll() pay, is_admin() adm, is_owner() own"), { sa: true, pay: true, adm: true, own: false })

  // a co-Super Admin keeps Super Admin powers
  await run(null, "insert into settings (id, doc) values (true, '{}') on conflict (id) do nothing")
  eq("co-Super Admin writes settings", (await run(CO, "update settings set doc = doc || '{\"qa67\":1}' where id")).affectedRows, 1)
  eq("an Admin still cannot", (await run(U.ADMIN, "update settings set doc = doc || '{\"qa67\":2}' where id")).affectedRows, 0)
  eq("co-Super Admin edits role grants", (await run(CO, "update role_permissions set modules = modules where role = 'staff'")).affectedRows, 1)
  const unlock = await err(CO, "select attendance_unlock_month('2031-01-01', 'qa 0067')")
  check("co-Super Admin may unlock a month", unlock === null || !/Only the Super Admin/.test(unlock), "not refused for role", unlock ?? "ok")
  like("an Admin may not", await err(U.ADMIN, "select attendance_unlock_month('2031-01-01', 'qa 0067')"), /Only the Super Admin/)
  await run(CO, "update profiles set modules_hidden = '[\"payments\"]' where id = $1", [U.SALES])
  eq("co-Super Admin hides a module from a Sales person", (await one(null, "select modules_hidden from profiles where id = $1", [U.SALES])).modules_hidden, ["payments"])
  await run(CO, "update profiles set modules_hidden = '[]' where id = $1", [U.SALES])
  await run(CO, "update profiles set name = 'CO renamed' where id = $1", [CO])
  eq("co-Super Admin edits their own name", (await one(null, "select name from profiles where id = $1", [CO])).name, "CO renamed")

  // ...but not the Owner's powers
  like("co-Super Admin cannot promote an Admin", await err(CO, "update profiles set role = 'super_admin' where id = $1", [U.ADMIN]), OWN)
  like("co-Super Admin cannot create a Super Admin profile", await err(CO, "insert into profiles (id, email, role, active) values ($1, 'x', 'super_admin', true) on conflict (id) do update set role = 'super_admin'", [NEW]), OWN)
  like("co-Super Admin cannot demote another Super Admin", await err(CO, "update profiles set role = 'admin' where id = $1", [CO2]), OWN)
  like("co-Super Admin cannot deactivate another Super Admin", await err(CO, "update profiles set active = false where id = $1", [CO2]), OWN)
  like("co-Super Admin cannot delete another Super Admin", await err(CO, "delete from profiles where id = $1", [CO2]), OWN)
  like("co-Super Admin cannot demote themselves", await err(CO, "update profiles set role = 'admin' where id = $1", [CO]), OWN)
  like("co-Super Admin cannot demote the Owner", await err(CO, "update profiles set role = 'admin' where id = $1", [U.SUPER]), /The Owner cannot be demoted or deactivated/)
  like("co-Super Admin cannot deactivate the Owner", await err(CO, "update profiles set active = false where id = $1", [U.SUPER]), /The Owner cannot be demoted or deactivated/)
  like("co-Super Admin cannot delete the Owner", await err(CO, "delete from profiles where id = $1", [U.SUPER]), /The Owner's account cannot be deleted/)
  like("co-Super Admin cannot rename the Owner", await err(CO, "update profiles set name = 'x' where id = $1", [U.SUPER]), /Only the Owner can change the Owner's account/)
  like("co-Super Admin cannot hide a module from the Owner", await err(CO, "update profiles set modules_hidden = '[\"payroll\"]' where id = $1", [U.SUPER]), /Only the Owner can change the Owner's account/)
  like("co-Super Admin cannot make themselves Owner", await err(CO, "update profiles set is_owner = true where id = $1", [CO]), /The Owner cannot be changed/)
  like("co-Super Admin cannot clear the Owner", await err(CO, "update profiles set is_owner = false where id = $1", [U.SUPER]), /The Owner cannot be changed/)
  like("an Admin cannot rename the Owner", await err(U.ADMIN, "update profiles set name = 'x' where id = $1", [U.SUPER]), /Only the Owner can change the Owner's account/)
  like("an Admin cannot promote to Super Admin", await err(U.ADMIN, "update profiles set role = 'super_admin' where id = $1", [U.STAFF2]), OWN)
  like("an Admin still cannot grant admin", await err(U.ADMIN, "update profiles set role = 'admin' where id = $1", [U.STAFF2]), /Only the Super Admin can give someone the admin role/)
  like("an Admin cannot deactivate a Super Admin", await err(U.ADMIN, "update profiles set active = false where id = $1", [CO]), OWN)
  like("a Sales person cannot set is_owner on themselves", await err(U.SALES, "update profiles set is_owner = true where id = $1", [U.SALES]), /The Owner cannot be changed/)
  like("nobody inserts a profile as Owner (the Owner included)", await err(U.SUPER, "insert into profiles (id, email, role, active, is_owner) values ($1, 'x', 'sales', true, true) on conflict (id) do update set is_owner = true", [NEW]), /The Owner cannot be changed/)
  eq("the Owner is still one, unchanged", [await prof(U.SUPER), await val(null, "select count(*)::int from profiles where is_owner")], [{ role: "super_admin", active: true, is_owner: true }, 1])

  // the Owner removes Super Admins, never themselves
  await run(U.SUPER, "update profiles set active = false where id = $1", [CO])
  eq("the Owner deactivates a co-Super Admin", (await prof(CO)).active, false)
  await run(U.SUPER, "update profiles set active = true where id = $1", [CO])
  await run(U.SUPER, "update profiles set role = 'admin' where id = $1", [CO2])
  eq("the Owner demotes a co-Super Admin", (await prof(CO2)).role, "admin")
  eq("the demoted one loses Super Admin powers", await one(CO2, "select is_super_admin() sa, is_payroll() pay"), { sa: false, pay: false })
  await run(CO, "update profiles set active = false where id = $1", [CO2])
  eq("a co-Super Admin manages an Admin", (await prof(CO2)).active, false)
  like("the Owner cannot demote themselves", await err(U.SUPER, "update profiles set role = 'admin' where id = $1", [U.SUPER]), /The Owner cannot be demoted or deactivated/)
  like("the Owner cannot deactivate themselves", await err(U.SUPER, "update profiles set active = false where id = $1", [U.SUPER]), /The Owner cannot be demoted or deactivated/)
  like("the Owner cannot clear is_owner", await err(U.SUPER, "update profiles set is_owner = false where id = $1", [U.SUPER]), /The Owner cannot be changed/)
  like("the Owner cannot give is_owner away", await err(U.SUPER, "update profiles set is_owner = true where id = $1", [CO]), /The Owner cannot be changed/)
  like("the Owner cannot delete themselves", await err(U.SUPER, "delete from profiles where id = $1", [U.SUPER]), /The Owner's account cannot be deleted/)
  const oldName = (await one(null, "select name from profiles where id = $1", [U.SUPER])).name
  await run(U.SUPER, "update profiles set name = 'Louis Sharma' where id = $1", [U.SUPER])
  eq("the Owner edits their own name", (await one(null, "select name from profiles where id = $1", [U.SUPER])).name, "Louis Sharma")
  like("the refusal names the Owner", await err(CO, "update profiles set role = 'super_admin' where id = $1", [U.ADMIN]), /Only the Owner \(Louis Sharma\) can make or remove a Super Admin\./)
  await run(null, "update profiles set name = $2 where id = $1", [U.SUPER, oldName])

  // the service role (edge functions) and the auth cascade
  like("service role cannot demote the Owner", await err("service", "update profiles set role = 'admin' where id = $1", [U.SUPER]), /The Owner cannot be demoted or deactivated/)
  like("service role cannot deactivate the Owner", await err("service", "update profiles set active = false where id = $1", [U.SUPER]), /The Owner cannot be demoted or deactivated/)
  like("service role cannot move is_owner", await err("service", "update profiles set is_owner = true where id = $1", [CO]), /The Owner cannot be changed/)
  like("service role cannot delete the Owner", await err("service", "delete from profiles where id = $1", [U.SUPER]), /The Owner's account cannot be deleted/)
  like("deleting the Owner's auth user is refused by the cascade", await err(null, "delete from auth.users where id = $1", [U.SUPER]), /The Owner's account cannot be deleted/)
  await run("service", "update profiles set role = 'super_admin', active = true where id = $1", [CO2])
  eq("service role (admin-create-user, after its Owner check) can make a Super Admin", (await prof(CO2)).role, "super_admin")
  await run("service", "update profiles set role = 'sales', active = false, modules = '[]' where id = $1", [CO2])
  eq("service role (admin-manage-user delete, after its Owner check) strips a Super Admin", (await prof(CO2)).role, "sales")

  // no hand-over
  like("transfer_super_admin: the Owner cannot call it", await err(U.SUPER, "select transfer_super_admin($1)", [CO]), /permission denied/)
  like("transfer_super_admin: a co-Super Admin cannot call it", await err(CO, "select transfer_super_admin($1)", [U.SUPER]), /permission denied/)
  like("transfer_super_admin refuses even from SQL", await err(null, "select transfer_super_admin($1)", [CO]), /The Owner cannot be changed/)
  eq("the Owner is still the Owner", (await one(null, "select id from profiles where is_owner")).id, U.SUPER)

  // staff_directory labels the Owner for everyone
  eq("staff_directory carries is_owner", [await val(U.SALES, "select is_owner from staff_directory where id = $1", [U.SUPER]), await val(U.SALES, "select is_owner from staff_directory where id = $1", [CO])], [true, false])

  // tidy: the extra people gone, settings as they were
  await run(null, "update settings set doc = doc - 'qa67' where id")
  await run(U.SUPER, "update profiles set role = 'sales', active = false where id = $1", [CO])
  await run(null, "delete from auth.users where id = any($1)", [[CO, CO2, NEW]])
  eq("one Super Admin again after tidy", await val(null, "select count(*)::int from profiles where role = 'super_admin'"), 1)
})

// ---- 0068 late marks and the September recalculation ------------------------------------
await scenario("0068 late marks", async () => {
  const Q = "00000000-0000-4000-8000-0000000000c1"
  await run(null, "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'qa68@test.local', '{\"name\":\"QA68\"}')", [Q])
  await run("service", "update profiles set role = 'staff', active = true, name = 'QA68', created_at = '2026-01-01' where id = $1", [Q])
  await run(U.SUPER, "select attendance_unlock_month('2026-09-01', 'qa 0068 late marks')")
  const day = async (d) => { const r = await dayRow(Q, d); return [r.status, r.late, r.late_min] }
  const latePunch = async (d) => { await rawPunch(Q, "in", ist(d, "10:30")); await rawPunch(Q, "out", ist(d, "19:30")) }

  await latePunch("2026-09-15")
  eq("late on a P day: late, 60 min", await day("2026-09-15"), ["P", true, 60])
  await rawPunch(Q, "in", ist("2026-09-17", "11:00")); await rawPunch(Q, "out", ist("2026-09-17", "12:00"))
  eq("checked in late, 1 hour worked: A short_hours, not late", [...await day("2026-09-17"), (await dayRow(Q, "2026-09-17")).flags], ["A", false, 0, ["short_hours"]])
  await setCfg({ autoPresent: [Q] })
  await rawPunch(Q, "in", ist("2026-09-16", "11:00")); await rawPunch(Q, "out", ist("2026-09-16", "12:00"))
  eq("autoPresent lift: P, not late", [...await day("2026-09-16"), (await dayRow(Q, "2026-09-16")).flags], ["P", false, 0, ["short_hours", "auto_present"]])
  await dropCfg("autoPresent")
  for (const [d, s] of [["2026-09-18", "L"], ["2026-09-21", "A"], ["2026-09-22", "WO"], ["2026-09-23", "P"]]) {
    await latePunch(d)
    await run(U.SUPER, "select attendance_override_day($1, $2, $3, 'qa 0068')", [Q, d, s])
  }
  await latePunch("2026-09-24")
  // A row computed before 0068: an absence still carrying a late mark, and a lifted day too.
  await run(null, `insert into attendance_days (user_id, day, status, late, late_min, flags) values
    ($1, '2026-09-25', 'A', true, 568, '{}'), ($1, '2026-09-28', 'P', true, 657, '{auto_present}')`, [Q])

  const s = (await run(U.PAY, "select * from attendance_month_summary('2026-09-01')")).rows.find((r) => r.user_id === Q)
  // Lates: 15, 23 (overridden to P), 24. Not 17 (A), 16 (lifted), 18/21/22 (overridden to L/A/WO), 25 (A), 28 (lifted).
  eq("summary: 3 lates, penalty 0.5", [s.lates, Number(s.late_penalty)], [3, 0.5])
  // P 15, 16, 23, 24, 28 + L 18 + WO 22 = 7, less 0.5.
  eq("summary: payable 6.5", Number(s.payable), 6.5)
  eq("summary: missed 0 (no A with no_checkout, no MP)", s.missed, 0)

  // The recalculation section of 0068, run as written in the migration.
  await rawPunch(Q, "in", ist("2026-09-29", "09:00")); await rawPunch(Q, "out", ist("2026-09-29", "19:00"))
  eq("(today's rule gives 570 for 09:00-19:00)", (await dayRow(Q, "2026-09-29")).worked_min, 570)
  await run(null, "update attendance_days set worked_min = 600 where user_id = $1 and day = '2026-09-29'", [Q])
  const mig = readFileSync(new URL("../migrations/0068_attendance_late_and_recompute.sql", import.meta.url), "utf8")
  const section = mig.slice(mig.indexOf("-- ---- 3. recalculate"))
  check("found the recalculation section", section.includes("attendance_close_day_all"), "section", section.slice(0, 60))
  await run(null, section)
  eq("pre-0056 row recalculated: 600 -> 570", (await dayRow(Q, "2026-09-29")).worked_min, 570)
  eq("old late-on-A row cleared (25 Sep: A, no punches)", await day("2026-09-25"), ["A", false, 0])
  eq("old lifted row recomputed (28 Sep: A, no punches, not autoPresent now)", await day("2026-09-28"), ["A", false, 0])
  eq("a day with no row yet is filled (14 Sep: A)", (await dayRow(Q, "2026-09-14"))?.status, "A")
  eq("overrides survive the recalculation", (await one(null, "select override_status from attendance_days where user_id = $1 and day = '2026-09-18'", [Q])).override_status, "L")
  eq("October filled up to yesterday (2 Oct)", !!(await dayRow(Q, "2026-10-02")), true)

})

await scenario("0070 manual Tally import stamps", async () => {
  const stamp = (guid, alterId, over = {}) => ({ status: "synced", source: "tally", syncedAt: "2026-10-03T10:00:00.000Z", voucherRef: "1", guid, alterId, ...over })
  const base = { status: "sent", totals: { grandTotal: 500 } }
  // invoices
  const inv = await newInvoice(U.ADMIN, { ...base, number: "TI-1", tally: stamp("g-inv-1", 10) })
  const sorted = (o) => o && Object.fromEntries(Object.entries(o).sort())
  eq("admin: a new invoice keeps the import stamp", sorted((await invDoc(inv)).tally), sorted(stamp("g-inv-1", 10)))
  eq("super admin too", (await invDoc(await newInvoice(U.SUPER, { ...base, number: "TI-2", tally: stamp("g-inv-2", 1) }))).tally?.guid, "g-inv-2")
  for (const [who, label] of [[U.ACCT, "accounts"], [U.STAFF1, "staff"]]) {
    await run("service", "update profiles set modules = '[\"invoices\",\"payments\"]' where id = $1", [who])
    eq(`${label}: the import stamp is dropped`, Object.hasOwn(await invDoc(await newInvoice(who, { ...base, number: `TI-${label}`, tally: stamp(`g-${label}`, 1) })), "tally"), false)
  }
  for (const [label, bad] of [["an extra key", stamp("g-x", 1, { error: "" })], ["alterId as text", stamp("g-x", "1")], ["a blank guid", stamp(" ", 1)], ["no source", { ...stamp("g-x", 1), source: undefined }]]) {
    eq(`admin: a stamp with ${label} is dropped`, Object.hasOwn(await invDoc(await newInvoice(U.ADMIN, { ...base, number: `TI-bad-${label}`, tally: bad })), "tally"), false)
  }
  await run(U.ADMIN, "update invoices set doc = doc || $2 where id = $1", [inv, J({ totals: { grandTotal: 600 }, tally: stamp("g-inv-1", 11) })])
  eq("admin: changed in Tally replaces an import stamp", [(await invDoc(inv)).tally.alterId, (await invDoc(inv)).totals.grandTotal], [11, 600])
  await run(U.ACCT, "update invoices set doc = doc || $2 where id = $1", [inv, J({ tally: stamp("g-inv-1", 12) })])
  eq("accounts cannot replace it", (await invDoc(inv)).tally.alterId, 11)
  const old = await newInvoice(U.ADMIN, { ...base, number: "TI-OLD", tally: { status: "synced", syncedAt: "x", voucherRef: "TI-OLD" } })
  eq("the old import shape still works", (await invDoc(old)).tally.voucherRef, "TI-OLD")
  await run(U.ADMIN, "update invoices set doc = doc || $2 where id = $1", [old, J({ tally: stamp("g-old", 5) })])
  eq("an old-shape stamp is not replaced by an import stamp", Object.hasOwn((await invDoc(old)).tally, "guid"), false)
  const conn = await newInvoice(null, { ...base, number: "TI-CONN" })
  await val("service", "select tally_mark('invoices', $1, $2)", [conn, J({ status: "synced", voucherRef: "TI-CONN" })])
  await run(U.ADMIN, "update invoices set doc = doc || $2 where id = $1", [conn, J({ tally: stamp("g-conn", 99) })])
  eq("a connector stamp is not replaced by an admin", Object.hasOwn((await invDoc(conn)).tally, "guid"), false)

  // payments
  const p = await newPayment(U.ADMIN, { number: "TP-1", amount: 100, party: "Acme", invoiceId: inv, tally: stamp("g-pay-1", 20), account: "HDFC" })
  let d = await payDoc(p)
  eq("admin: a new payment keeps the import stamp, not account", [sorted(d.tally), d.account ?? null], [sorted(stamp("g-pay-1", 20)), null])
  eq("the imported receipt settles its invoice", (await invDoc(inv)).amountPaid, 100)
  eq("accounts: the stamp is dropped", (await payDoc(await newPayment(U.ACCT, { number: "TP-2", amount: 5, tally: stamp("g-pay-2", 1) }))).tally ?? null, null)
  eq("staff (payments module): the stamp is dropped", (await payDoc(await newPayment(U.STAFF1, { number: "TP-3", amount: 5, tally: stamp("g-pay-3", 1) }))).tally ?? null, null)
  like("imported: an admin's plain edit is still frozen", await err(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [p, J({ amount: 101 })]), /already in Tally/)
  like("imported: the same alterId does not unlock it", await err(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [p, J({ amount: 101, tally: stamp("g-pay-1", 20) })]), /already in Tally/)
  like("imported: accounts with a higher alterId is refused", await err(U.ACCT, "update payments set doc = doc || $2 where id = $1", [p, J({ amount: 101, tally: stamp("g-pay-1", 21) })]), /already in Tally/)
  await run(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [p, J({ amount: 150, date: "2026-10-02T06:30:00.000Z", tally: stamp("g-pay-1", 21) })])
  d = await payDoc(p)
  eq("admin: changed in Tally (higher alterId) updates amount and stamp", [d.amount, d.date, d.tally.alterId], [150, "2026-10-02T06:30:00.000Z", 21])
  eq("... and the invoice follows", (await invDoc(inv)).amountPaid, 150)
  like("imported: an admin still cannot delete", await err(U.ADMIN, "delete from payments where id = $1", [p]), /already in Tally/)
  const plain = await newPayment(U.ADMIN, { number: "TP-4", amount: 7, party: "Tea" })
  await run(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [plain, J({ tally: stamp("g-pay-4", 1) })])
  eq("admin: a payment with no stamp may be import-stamped", (await payDoc(plain)).tally?.guid, "g-pay-4")
  const c = await newPayment(U.ACCT, { number: "TP-5", amount: 9, party: "Conn" })
  await val("service", "select tally_mark('payments', $1, $2)", [c, J({ status: "synced", voucherRef: "TP-5", alterId: 1 })])
  like("connector-synced: an admin's import stamp does not unlock it", await err(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [c, J({ amount: 10, tally: stamp("g-c", 99) })]), /already in Tally/)
  await run(U.ADMIN, "update payments set doc = doc || $2 where id = $1", [c, J({ note: "x", tally: stamp("g-c", 99) })])
  eq("connector-synced: nor replaces its stamp", sorted((await payDoc(c)).tally), sorted({ status: "synced", voucherRef: "TP-5", alterId: 1 }))
  await run(U.SUPER, "update payments set doc = doc || '{\"amount\": 11}' where id = $1", [c])
  eq("connector-synced: the Super Admin can still change it", (await payDoc(c)).amount, 11)
  for (const who of [U.ACCT, U.STAFF1]) await run("service", "update profiles set modules = '[]' where id = $1", [who])
})

await scenario("0072 link an imported receipt to its invoice", async () => {
  const stamp = (guid, alterId, over = {}) => ({ status: "synced", source: "tally", syncedAt: "2026-10-03T10:00:00.000Z", voucherRef: "1", guid, alterId, ...over })
  const upd = (who, id, patch) => err(who, "update payments set doc = doc || $2 where id = $1", [id, J(patch)])
  await run("service", "update profiles set modules = '[\"invoices\",\"payments\"]' where id = $1", [U.ACCT])
  const inv = await newInvoice(U.ADMIN, { number: "TL-1", status: "sent", customer: { name: "Acme" }, totals: { grandTotal: 500 }, tally: stamp("g-tl-inv-1", 3) })
  const inv2 = await newInvoice(U.ADMIN, { number: "TL-2", status: "sent", customer: { name: "Beta" }, totals: { grandTotal: 1000 }, tally: stamp("g-tl-inv-2", 3) })
  const r1 = await newPayment(U.ADMIN, { number: "TL-R1", amount: 500, party: "Acme", invoiceId: null, tally: stamp("g-tl-r1", 5) })
  const r2 = await newPayment(U.ADMIN, { number: "TL-R2", amount: 200, party: "Beta", invoiceId: null, tally: stamp("g-tl-r2", 5) })

  like("accounts cannot link an imported receipt", await upd(U.ACCT, r1, { invoiceId: inv }), /already in Tally/)
  like("an admin cannot change the amount while linking", await upd(U.ADMIN, r1, { invoiceId: inv, amount: 499 }), /already in Tally/)
  like("nor the date", await upd(U.ADMIN, r1, { invoiceId: inv, date: "2026-10-01T06:30:00.000Z" }), /already in Tally/)
  like("nor the stamp (same alterId)", await upd(U.ADMIN, r1, { invoiceId: inv, tally: stamp("g-tl-r1", 5, { voucherRef: "2" }) }), /already in Tally/)
  like("an invoice that does not exist is refused", await upd(U.ADMIN, r1, { invoiceId: randomUUID() }), /invoice that does not exist/)
  eq("still unlinked after the refusals", (await payDoc(r1)).invoiceId ?? null, null)

  eq("admin links it (invoiceNumber and customer as the client sent them)", await upd(U.ADMIN, r1, { invoiceId: inv, invoiceNumber: "", customer: { name: "Old" } }), null)
  const d = await payDoc(r1)
  eq("linked; invoiceNumber and customer copied from the invoice; stamp kept", [d.invoiceId, d.invoiceNumber, d.customer, d.amount, d.tally.alterId], [inv, "TL-1", { name: "Acme" }, 500, 5])
  eq("the invoice is now paid", [(await invDoc(inv)).status, (await invDoc(inv)).amountPaid], ["paid", 500])
  eq("Super Admin links one too", await upd(U.SUPER, r2, { invoiceId: inv2 }), null)
  eq("a part payment makes the invoice partial", [(await invDoc(inv2)).status, (await invDoc(inv2)).amountPaid], ["partial", 200])

  like("already linked: moving it to another invoice is refused", await upd(U.ADMIN, r1, { invoiceId: inv2 }), /already in Tally/)
  like("already linked: unlinking is refused", await upd(U.ADMIN, r1, { invoiceId: null }), /already in Tally/)
  like("a linked imported receipt still cannot be deleted by an admin", await err(U.ADMIN, "delete from payments where id = $1", [r1]), /already in Tally/)

  const c = await newPayment(U.ACCT, { number: "TL-C1", amount: 50, party: "Conn" })
  await val("service", "select tally_mark('payments', $1, $2)", [c, J({ status: "synced", voucherRef: "TL-C1" })])
  like("a console-made synced payment stays frozen for an admin", await upd(U.ADMIN, c, { invoiceId: inv2 }), /already in Tally/)

  const out = await newPayment(U.ADMIN, { type: "payout", number: "TL-P1", amount: 40, party: "Vendor", tally: stamp("g-tl-p1", 2) })
  like("an imported payout cannot be linked", await upd(U.ADMIN, out, { invoiceId: inv2 }), /already in Tally|payout cannot be linked/)
  like("nor turned into an inflow to link it", await upd(U.ADMIN, out, { type: "inflow", invoiceId: inv2 }), /already in Tally/)
  await run("service", "update profiles set modules = '[]' where id = $1", [U.ACCT])
})

await scenario("0073 lead delete is admins only", async () => {
  await run("service", "update profiles set modules = $2 where id = $1", [U.SALES, J(["enquiries"])])
  const lead = await val(U.SALES, "insert into enquiries (doc) values ($1) returning id", [J({ status: "new", customer: { name: "Delete test", phone: "9876500073" } })])
  eq("a Sales user with Leads can still edit a lead", (await run(U.SALES, "update enquiries set doc = doc || '{\"status\":\"contacted\"}' where id = $1", [lead])).affectedRows, 1)
  await run(U.SALES, "delete from enquiries where id = $1", [lead])
  eq("a Sales user with Leads cannot delete it", await val("service", "select count(*)::int from enquiries where id = $1", [lead]), 1)
  await run(U.ADMIN, "delete from enquiries where id = $1", [lead])
  eq("an admin can", await val("service", "select count(*)::int from enquiries where id = $1", [lead]), 0)
  await run("service", "update profiles set modules = '[]' where id = $1", [U.SALES])
})

await scenario("0074 pay push triggers and muted push categories", async () => {
  const calls = () => val(null, "select count(*)::int from net.calls")
  const claim = () => val(U.STAFF1, "select claim_submit('Travel', 250, $1::date, 'push test', null)", [today])
  const slip = await one(null, "select id from payslips where released_at is not null and status = 'included' limit 1")
  check("a released payslip exists to replay", !!slip, "a row", slip)
  const release = () => run(null, "update payslips set released_at = null where id = $1", [slip.id])
    .then(() => run(null, "update payslips set released_at = now() where id = $1", [slip.id]))

  // No Vault secrets: every write goes through, and nothing is called.
  const before = await calls()
  eq("claim approved with no Vault secrets", await err(U.PAY, "select claim_decide($1, true, null)", [await claim()]), null)
  eq("claim rejected with no Vault secrets", await err(U.PAY, "select claim_decide($1, false, 'No bill')", [await claim()]), null)
  await release()
  eq("payslip released with no Vault secrets", await val(null, "select released_at is not null from payslips where id = $1", [slip.id]), true)
  eq("nothing posted without the secrets", await calls(), before)

  // With them, each event posts once; a claimant's own cancel posts nothing.
  await run(null, "select vault.create_secret('https://example.invalid/functions/v1/push-notify', 'push_notify_url'), vault.create_secret('s3cret', 'push_notify_secret')")
  const c = await claim()
  await run(U.PAY, "select claim_decide($1, true, null)", [c])
  await run(U.STAFF1, "select claim_cancel($1)", [await claim()])
  await release()
  const posted = (await run(null, "select body from net.calls order by id desc limit 2")).rows.map((r) => r.body)
  eq("claim decision and payslip release each post once", await calls(), before + 2)
  eq("bodies name the table and row", posted.reverse().map((b) => [b.table, b.id]), [["reimbursement_claims", c], ["payslips", slip.id]])

  // Every team channel posts (a person's message and Anu's bot post alike).
  const n0 = await calls()
  for (const team of ["sales", "accounts", "staff", "management", "everyone"]) {
    await run(null, "insert into chat_messages (conversation_id, sender_id, kind, body) values (anu_team_conversation($1), $2, 'text', 'hi team')", [team, U.ADMIN])
  }
  await run(null, "insert into chat_messages (conversation_id, sender_id, kind, body) values (anu_team_conversation('sales'), null, 'bot', 'Daily update')")
  eq("each team channel message and Anu's team post posts once", await calls(), n0 + 6)

  // A suspicious punch posts; a field rep's routine no_code punch does not.
  const n1 = await calls()
  await rawPunch(U.STAFF2, "in", ist("2026-09-03", "09:00"), { flags: ["own_code"], review: "flagged" })
  await rawPunch(U.SALES, "in", ist("2026-09-03", "09:00"), { flags: ["no_code"], review: "flagged", mode: "field" })
  await rawPunch(U.STAFF2, "out", ist("2026-09-03", "18:00"))
  eq("only the own_code punch posts", await calls(), n1 + 1)
  eq("punch body names the table", (await one(null, "select body->>'table' t from net.calls order by id desc limit 1")).t, "attendance_punches")
  await run(null, "delete from vault.secrets where name in ('push_notify_url', 'push_notify_secret')")

  // Registration: the old 3-argument call still works and keeps the mutes.
  const tok = "t".repeat(40)
  await run(U.STAFF1, "select register_push_device($1, 'android', '1.9.0', $2)", [tok, ["chat", "pay"]])
  eq("muted saved", await val(null, "select muted from push_devices where token = $1", [tok]), ["chat", "pay"])
  await run(U.STAFF1, "select register_push_device(p_token => $1, p_platform => 'android', p_app_version => '1.8.0')", [tok])
  eq("an old app's call keeps the mutes", await val(null, "select muted from push_devices where token = $1", [tok]), ["chat", "pay"])
  await run(U.STAFF2, "select register_push_device(p_token => $1, p_platform => 'android', p_app_version => '1.8.0')", [tok])
  eq("a token moving to another person starts unmuted", await one(null, "select user_id, muted from push_devices where token = $1", [tok]), { user_id: U.STAFF2, muted: [] })
  like("too many categories refused", await err(U.STAFF2, "select register_push_device($1, 'android', '1', $2)", [tok, Array(11).fill("x")]), /too many/)
  await run(null, "delete from push_devices where token = $1", [tok])
})

await scenario("Companies (0075, 0076)", async () => {
  const AMAN = "00000000-0000-4000-8000-0000000000b1"
  const sales = J(["enquiries", "customers", "quotations", "invoices", "payments"])
  await run(null, "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'aman@test.local', '{\"name\":\"AMAN\"}')", [AMAN])
  eq("a new profile starts in Ortex", await val(null, "select companies from profiles where id = $1", [AMAN]), ["ortex"])
  await run("service", "update profiles set role = 'sales', active = true, name = 'AMAN', modules = $2, companies = '[\"aman\"]' where id = $1", [AMAN, sales])
  await run("service", "update profiles set modules = $2 where id = $1", [U.SALES, sales])
  eq("existing rows are Ortex's", await val(null, "select count(*)::int from enquiries where company_id <> 'ortex'"), 0)

  // Reading and writing across companies.
  const enq = (who, doc, co) => val(who, `insert into enquiries (${co ? "company_id, " : ""}doc) values (${co ? "$2, " : ""}$1) returning id`, co ? [J(doc), co] : [J(doc)])
  const aEnq = await enq(AMAN, { status: "new", customer: { name: "Ravi", phone: "9876511111" } })
  const oEnq = await enq(U.SALES, { status: "new", customer: { name: "Ravi", phone: "9876511111" } })
  eq("each lands in its writer's default company", await val(null, "select array_agg(company_id order by company_id) from enquiries where id in ($1, $2)", [aEnq, oEnq]), ["aman", "ortex"])
  eq("Aman cannot read Ortex's enquiry", await val(AMAN, "select count(*)::int from enquiries where id = $1", [oEnq]), 0)
  eq("Ortex cannot read Aman's", await val(U.SALES, "select count(*)::int from enquiries where id = $1", [aEnq]), 0)
  like("Aman cannot insert into Ortex", await err(AMAN, "insert into enquiries (company_id, doc) values ('ortex', '{\"status\":\"new\"}')"), /row-level security/)
  like("Ortex cannot insert into Aman", await err(U.SALES, "insert into customers (company_id, doc) values ('aman', '{\"name\":\"X\"}')"), /row-level security/)
  eq("Aman cannot update Ortex's", (await run(AMAN, "update enquiries set doc = doc || '{\"status\":\"lost\"}' where id = $1", [oEnq])).affectedRows, 0)
  eq("Aman sees only Aman in companies", (await run(AMAN, "select id from companies order by id")).rows.map((r) => r.id), ["aman"])
  eq("the Super Admin sees all three", (await run(U.SUPER, "select id from companies order by sort")).rows.map((r) => r.id), ["ortex", "aman", "nidhi"])
  eq("an Admin cannot edit a company", (await run(U.ADMIN, "update companies set name = 'X' where id = 'ortex'")).affectedRows, 0)

  // The website.
  like("anon cannot send an enquiry to Aman", await err("anon", "insert into enquiries (company_id, doc) values ('aman', '{\"status\":\"new\"}')"), /row-level security/)
  eq("anon's enquiry without a company works", await err("anon", "insert into enquiries (doc) values ('{\"status\":\"new\",\"message\":\"co-anon\"}')"), null)
  eq("and lands in Ortex", await val(null, "select company_id from enquiries where doc->>'message' = 'co-anon'"), "ortex")

  // Numbers.
  eq("no unkeyed series left", await val(null, "select count(*)::int from sequences where series !~ ':'"), 0)
  const a1 = await val(AMAN, "select next_sequence('quotation', 'aman')")
  const a2 = await val(AMAN, "select next_sequence('quotation')")
  eq("Aman's series starts at 1 and the one-arg form continues it", [a1, a2], [1, 2])
  const o = await val(null, "select value from sequences where series = 'ortex:quotation'")
  eq("Ortex's one-arg call takes Ortex's next", await val(U.SALES, "select next_sequence('quotation')"), o)
  like("Aman cannot take an Ortex number", await err(AMAN, "select next_sequence('quotation', 'ortex')"), /do not work in company "ortex"/)
  like("an unknown company is refused", await err(U.SUPER, "select next_sequence('quotation', 'zzz')"), /Unknown company/)
  like("the module check still applies", await err(U.STAFF1, "select next_sequence('invoice', 'ortex')"), /without the invoices module/)

  // Customers per company.
  const custs = () => val(null, "select array_agg(company_id order by company_id) from customers where national_digits(doc->>'phone') = '9876511111'")
  eq("one customer per company for the same phone", await custs(), ["aman", "ortex"])
  await enq(AMAN, { status: "new", customer: { name: "Ravi K", phone: "+91 98765 11111" } })
  eq("a second Aman lead matches Aman's customer", await custs(), ["aman", "ortex"])

  // Payments follow their invoice.
  const aInv = await newInvoice(AMAN, { status: "sent", totals: { grandTotal: 500 } })
  eq("Aman's invoice is Aman's", await val(null, "select company_id from invoices where id = $1", [aInv]), "aman")
  const pay = await newPayment(U.SUPER, { number: "PAY-CO-1", amount: 100, invoiceId: aInv })
  eq("a payment takes its invoice's company", await val(null, "select company_id from payments where id = $1", [pay]), "aman")
  like("Ortex cannot record a payment against Aman's invoice", await err(U.SALES, "insert into payments (doc) values ($1)", [J({ type: "inflow", method: "UPI", amount: 5, invoiceId: aInv })]), /row-level security/)
  eq("the same payment number may exist in another company", await err(U.SUPER, "insert into payments (doc) values ($1)", [J({ type: "payout", method: "UPI", amount: 5, number: "PAY-CO-1" })]), null)

  // Who changes companies.
  like("an Admin cannot change someone's companies", await err(U.ADMIN, "update profiles set companies = '[\"aman\"]' where id = $1", [U.SALES]), /Only the Super Admin can change which companies/)
  like("nor anyone their own", await err(U.SALES, "update profiles set companies = '[\"ortex\",\"aman\"]' where id = $1", [U.SALES]), /Only the Super Admin/)
  await run(U.SUPER, "update profiles set companies = '[\"ortex\",\"aman\"]' where id = $1", [U.ADMIN])
  eq("the Super Admin can", await val(null, "select companies from profiles where id = $1", [U.ADMIN]), ["ortex", "aman"])
  like("an Admin cannot move a record", await err(U.ADMIN, "update enquiries set company_id = 'aman' where id = $1", [oEnq]), /Only the Super Admin can move/)
  await run(U.SUPER, "update enquiries set company_id = 'aman' where id = $1", [oEnq])
  eq("the Super Admin moves an un-numbered record", await val(null, "select company_id from enquiries where id = $1", [oEnq]), "aman")
  const nInv = await newInvoice(null, { number: "INV-CO-1", status: "sent", totals: { grandTotal: 10 } })
  like("but not a numbered one", await err(U.SUPER, "update invoices set company_id = 'aman' where id = $1", [nInv]), /with a number \(INV-CO-1\) cannot move/)
  await run(U.SUPER, "update profiles set companies = '[\"ortex\"]' where id = $1", [U.ADMIN])

  // History.
  eq("the move is in the log", await val(null, "select array[changes#>>'{company_id,from}', changes#>>'{company_id,to}'] from audit_log where row_id = $1 and action = 'update' order by id desc limit 1", [oEnq]), ["ortex", "aman"])
  eq("audit rows carry the company", await val(null, "select company_id from audit_log where row_id = $1 and action = 'insert'", [aEnq]), "aman")
  eq("Aman reads Aman's history", await val(AMAN, "select count(*)::int from audit_log where row_id = $1", [aEnq]), 1)
  eq("Ortex does not", await val(U.SALES, "select count(*)::int from audit_log where row_id = $1", [aEnq]), 0)
  eq("Aman does not read Ortex's", await val(AMAN, "select count(*)::int from audit_log where row_id = $1", [nInv]), 0)

  // Document settings per company.
  await run(null, "insert into settings (id, doc) values (true, $1) on conflict (id) do update set doc = settings.doc || excluded.doc",
    [J({ company: { name: "Ortex Industries", gstin: "07ORTEX" }, tax: { defaultGstRate: 18 }, telecaller: { enabled: false } })])
  eq("a Settings save is copied onto Ortex", await val(null, "select doc->'company'->>'gstin' from companies where id = 'ortex'"), "07ORTEX")
  await run(U.SUPER, "update companies set doc = $1 where id = 'aman'", [J({ company: { name: "Aman Enterprise", gstin: "09AMAN" } })])
  const ss = (who) => val(who, "select doc from settings_staff")
  const sa = await ss(AMAN), so = await ss(U.SALES)
  eq("settings_staff: Aman's company block", sa.company.gstin, "09AMAN")
  eq("settings_staff: Ortex's for Ortex", so.company.gstin, "07ORTEX")
  eq("same shape, global tax where the company has none", [Object.keys(sa).sort(), sa.tax.defaultGstRate], [["company", "documents", "numbering", "quotation", "tax"], 18])

  // Anu.
  await run(U.SUPER, "update companies set active = true where id = 'aman'")
  const mgmt = await val(U.SUPER, "select anu_team_update('management')")
  check("management update has a block per company", /Ortex Industries:\nLeads yesterday/.test(mgmt) && /Aman Enterprise:\nLeads yesterday/.test(mgmt), "two blocks", mgmt)
  const aOnly = await val(AMAN, "select anu_team_update('sales')")
  check("Aman's own update: Aman only, no heading", /Leads yesterday/.test(aOnly) && !/Ortex Industries|Aman Enterprise:/.test(aOnly), "one company", aOnly)
  const oOnly = await val(U.SALES, "select anu_team_update('sales')")
  check("Ortex's own update: no Aman", /Leads yesterday/.test(oOnly) && !/Aman Enterprise/.test(oOnly), "one company", oOnly)
  await run(U.SUPER, "update companies set active = false where id = 'aman'")
  check("the scheduled post covers active companies only", !/Aman Enterprise/.test(await val(null, "select anu_daily_update('management', $1::date)", [today])), "Ortex only", "")
  await run("service", "update profiles set modules = '[]' where id = $1", [U.SALES])
})

// ---- report -----------------------------------------------------------------------------
console.log("")
let fails = 0
const byScn = new Map()
for (const r of results) byScn.set(r.scenario, [...(byScn.get(r.scenario) ?? []), r])
for (const [s, rs] of byScn) {
  const f = rs.filter((r) => !r.ok)
  fails += f.length
  console.log(`${f.length ? "FAIL" : "PASS"}  ${s}  (${rs.length - f.length}/${rs.length})`)
  for (const r of rs) if (r.name.startsWith("OBSERVATION")) console.log(`      - ${r.name}: ${r.actual}`)
  for (const r of f) console.log(`      x ${r.name}\n        expected: ${r.expected}\n        actual:   ${r.actual}`)
}
console.log(`\n${results.length - fails}/${results.length} checks passed. Concurrency not tested: PGlite is one connection.`)
process.exit(fails ? 1 : 0)
