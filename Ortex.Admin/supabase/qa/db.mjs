// Builds a throwaway PGlite database: Supabase shim + every migration in order.
import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp"
import { readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const MIG_DIR = join(here, "../migrations")

// Every textual patch made to migration SQL. Shim gaps only, no semantics.
export const PATCHES = [
  // pg_cron / pg_net are not loadable in PGlite; the shim pre-creates cron.* and net.* stubs.
  { re: /create extension if not exists pg_cron[^;]*;/gi, to: "/* qa-shim: pg_cron stubbed */ null;", why: "pg_cron unavailable, stubbed in shim" },
  { re: /create extension if not exists pg_net[^;]*;/gi, to: "/* qa-shim: pg_net stubbed */;", why: "pg_net unavailable, stubbed in shim" },
]

// Data the live project already had when a migration ran (preconditions, not patches).
export const SUPER_ID = "00000000-0000-4000-8000-000000000001"
const PRE_SEED = {
  // 0032 promotes an existing profile; production had the owner's account already signed in.
  "0032_roles.sql": `insert into auth.users (id, email, raw_user_meta_data) values ('${SUPER_ID}', 'louis.sharma37@gmail.com', '{"name":"Louis"}')`,
}

export async function buildDb({ log = () => {} } = {}) {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
  await db.exec(readFileSync(join(here, "shim.sql"), "utf8"))
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort()
  const applied = [], failed = [], patched = []
  for (const f of files) {
    let sql = readFileSync(join(MIG_DIR, f), "utf8")
    for (const p of PATCHES) {
      const n = (sql.match(p.re) || []).length
      if (n) { sql = sql.replace(p.re, p.to); patched.push(`${f}: ${p.why} (x${n})`) }
    }
    if (PRE_SEED[f]) await db.exec(PRE_SEED[f])
    try {
      await db.exec("begin;\n" + sql + "\ncommit;")
      applied.push(f)
    } catch (e) {
      await db.exec("rollback;").catch(() => {})
      failed.push({ file: f, error: e.message, where: e.where, position: e.position })
      log(`FAILED ${f}: ${e.message}`)
    }
  }
  return { db, applied, failed, patched }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await buildDb({ log: console.log })
  console.log(`applied ${r.applied.length}, failed ${r.failed.length}`)
  console.log(r.patched.join("\n"))
  for (const f of r.failed) console.log(JSON.stringify(f, null, 1))
}
