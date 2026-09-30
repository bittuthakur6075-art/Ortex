// Navigation wiring, checked against the real files.
//
// Every link in this console is a string. Nothing type-checks that a sidebar
// item names a module that exists, that a route guard names a real key, or that
// a redirect lands somewhere. The 1.55.0 reorganisation moved most of them at
// once, so these assertions stand where a compiler would.
//
// The runtime half of the same problem lives in the DATABASE and cannot be
// caught here: PL/pgSQL resolves names when it runs, so a trigger reading a
// dropped column passes every test and fails on the first punch (see migration
// 0062). Before dropping a column, search pg_proc.prosrc for it.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { MODULES } from "../data/domain/modules"

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8")
const app = read("../App.jsx")
const layout = read("../components/layout/AdminLayout.jsx")

// Top-level route paths declared in App.jsx, as "/x".
const routes = new Set(
  [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => "/" + m[1].replace(/^\//, "")).filter((p) => p !== "/*"),
)
routes.add("/")

const firstSegment = (p) => "/" + String(p).split("?")[0].replace(/^\//, "").split("/")[0]
const known = (p) => routes.has(firstSegment(p)) || firstSegment(p) === "/"

describe("wiring", () => {
  it("every module path lands on a real route", () => {
    const bad = MODULES.filter((m) => !known(m.path)).map((m) => `${m.key} -> ${m.path}`)
    expect(bad).toEqual([])
  })

  it("every sidebar item points at a real route and a real module key", () => {
    const keys = new Set(MODULES.map((m) => m.key))
    const items = [...layout.matchAll(/\{\s*to:\s*"([^"]+)"[^}]*?\bkeys?:\s*(\[[^\]]*\]|"[^"]*")/g)]
    expect(items.length).toBeGreaterThan(8) // the regex still matches the nav
    const bad = []
    for (const [, to, rawKeys] of items) {
      if (!known(to)) bad.push(`route ${to}`)
      for (const k of rawKeys.replace(/[[\]"]/g, "").split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!keys.has(k)) bad.push(`key ${k} (${to})`)
      }
    }
    expect(bad).toEqual([])
  })

  it("every route guard names a module that exists", () => {
    const keys = new Set(MODULES.map((m) => m.key))
    const bad = [...app.matchAll(/guard\("([^"]+)"/g)].map((m) => m[1]).filter((k) => !keys.has(k))
    expect(bad).toEqual([])
  })

  it("every redirect lands somewhere that exists", () => {
    const bad = [...app.matchAll(/<Redirect to="([^"]+)"/g)].map((m) => m[1]).filter((p) => !known(p))
    expect(bad).toEqual([])
  })

  it("the moved attendance tabs all point at real pages", () => {
    const block = app.match(/const MOVED_TAB = \{([\s\S]*?)\n\}/)
    expect(block).toBeTruthy()
    const bad = [...block[1].matchAll(/"([^"]*\/[^"]*)"/g)].map((m) => m[1]).filter((p) => !known(p))
    expect(bad).toEqual([])
  })
})
