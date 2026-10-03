// Several companies (Admin migrations 0075 and 0076): who works where, what a
// list keeps, what a new record is stamped with, and whose settings print.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { companiesOf, hasCompany, canSeeAllCompanies, pickCompany, companyScope, inCompanies, companyForCreate } =
  await loadTs("domain/modules.ts")
const { settingsFor, DEFAULT_SETTINGS } = await loadTs("domain/settings.ts")
const { buildNotifications, DEFAULT_PREFS } = await loadTs("domain/notifications.ts")

const TABLE = [
  { id: "ortex", name: "Ortex Industries", active: true, sort: 0 },
  { id: "aman", name: "Aman Enterprise", active: false, sort: 1 },
  { id: "nidhi", name: "Nidhi Industries", active: true, sort: 2 },
]
const p = (over = {}) => ({ id: "u1", active: true, role: "sales", companies: ["ortex"], ...over })

test("hasCompany is has_company_access(): the Super Admin everywhere, anyone else their list", () => {
  assert.equal(hasCompany(p({ role: "super_admin", companies: [] }), "aman"), true)
  assert.equal(hasCompany(p(), "ortex"), true)
  assert.equal(hasCompany(p(), "aman"), false)
  assert.equal(hasCompany(p({ role: "admin" }), "aman"), false, "an Admin is not every company")
  assert.equal(hasCompany(p({ active: false }), "ortex"), false)
  assert.equal(hasCompany(null, "ortex"), false)
})

test("companiesOf: the person's list in their order; a Super Admin every company switched on", () => {
  assert.deepEqual(companiesOf(p({ companies: ["nidhi", "ortex"] }), TABLE).map((c) => c.id), ["nidhi", "ortex"])
  assert.deepEqual(companiesOf(p({ companies: ["ortex", "gone"] }), TABLE).map((c) => c.id), ["ortex"])
  assert.deepEqual(companiesOf(p({ role: "super_admin" }), TABLE).map((c) => c.id), ["ortex", "nidhi"])
  assert.deepEqual(companiesOf(p(), []), [], "before 0075 there are no companies")
  assert.deepEqual(companiesOf(p({ companies: undefined }), TABLE), [])
})

test("All companies: admins with more than one company only", () => {
  const two = TABLE.filter((c) => c.id !== "aman")
  assert.equal(canSeeAllCompanies(p({ role: "admin" }), two), true)
  assert.equal(canSeeAllCompanies(p({ role: "sales" }), two), false)
  assert.equal(canSeeAllCompanies(p({ role: "admin" }), two.slice(0, 1)), false)
})

test("pickCompany keeps a valid saved choice, else the first company", () => {
  const two = TABLE.filter((c) => c.id !== "aman")
  assert.equal(pickCompany("nidhi", p(), two), "nidhi")
  assert.equal(pickCompany("aman", p(), two), "ortex", "a company no longer theirs")
  assert.equal(pickCompany("all", p({ role: "admin" }), two), "all")
  assert.equal(pickCompany("all", p({ role: "sales" }), two), "ortex")
  assert.equal(pickCompany(null, p(), []), "")
})

test("companyScope and inCompanies: one company, all of theirs, or nothing filtered before 0075", () => {
  const two = TABLE.filter((c) => c.id !== "aman")
  const rows = [{ id: "1", companyId: "ortex" }, { id: "2", companyId: "nidhi" }, { id: "3", companyId: "aman" }, { id: "4" }]
  assert.deepEqual(inCompanies(rows, companyScope("nidhi", two)).map((r) => r.id), ["2"])
  assert.deepEqual(inCompanies(rows, companyScope("all", two)).map((r) => r.id), ["1", "2"])
  assert.equal(companyScope("ortex", []), null)
  assert.equal(inCompanies(rows, companyScope("", two)), rows)
  assert.equal(inCompanies(rows, null), rows)
})

test("companyForCreate: a company is required once the database has them", () => {
  assert.equal(companyForCreate("aman", true), "aman")
  assert.throws(() => companyForCreate("", true), /Choose a company/)
  assert.throws(() => companyForCreate("all", true), /Choose a company/)
  assert.throws(() => companyForCreate(undefined, true), /Choose a company/)
  assert.equal(companyForCreate(undefined, false), undefined, "before 0075 the column is not sent")
})

test("settingsFor: the company's blocks, globals behind all but the company block", () => {
  const global = {
    company: { name: "Ortex Industries", gstin: "07AAAAA0000A1Z5", stateCode: "07" },
    numbering: { quotationPrefix: "QTN" },
    quotation: { validityDays: 15, terms: "Ortex terms" },
  }
  const aman = settingsFor(global, { company: { name: "Aman Enterprise", stateCode: "09" }, numbering: { quotationPrefix: "AE" } })
  assert.equal(aman.company.name, "Aman Enterprise")
  assert.equal(aman.company.gstin, "", "never Ortex's GSTIN")
  assert.notEqual(aman.company.gstin, DEFAULT_SETTINGS.company.gstin, "never the placeholder")
  assert.equal(aman.company.stateCode, "09")
  assert.deepEqual(aman.company.paymentAliases, [])
  assert.equal(aman.numbering.quotationPrefix, "AE")
  assert.equal(aman.numbering.paymentPrefix, "PAY", "a missing key still takes its default")
  assert.equal(aman.quotation.terms, "Ortex terms", "a block the company lacks falls back like settings_staff")
  assert.equal(aman.tax.defaultGstRate, 18)

  const none = settingsFor(global, null)
  assert.equal(none.company.gstin, "07AAAAA0000A1Z5", "no company doc: the global settings as before")
  assert.equal(settingsFor(global, { company: { gstin: null } }).company.gstin, "")
})

test("notifications ring only for the person's companies", () => {
  const now = Date.parse("2026-10-03T10:00:00Z")
  const lead = (id, companyId) => ({
    id,
    companyId,
    status: "new",
    source: "Website",
    customer: { name: `Lead ${id}`, phone: "9876543210" },
    createdAt: new Date(now - 60_000).toISOString(),
  })
  const enquiries = [lead("a", "ortex"), lead("b", "aman")]
  const ids = (companies) =>
    buildNotifications({ enquiries, now, prefs: DEFAULT_PREFS, companies }).map((n) => n.title).join("|")
  assert.match(ids(["ortex"]), /Lead a/)
  assert.doesNotMatch(ids(["ortex"]), /Lead b/)
  assert.match(ids(null), /Lead b/, "before 0075 every row")
})

const { companyInitials, companyColour, companyMarkSvg, COMPANY_MARK_COLOURS } = await loadTs("domain/companyMark.ts")
const { mastheadLogo } = await loadTs("documents/quotationHtml.ts")

test("companyMark: initials from the first two words, a stable palette colour per id", () => {
  assert.equal(companyInitials("Aman Enterprise"), "AE")
  assert.equal(companyInitials("Nidhi Industries Private Limited"), "NI")
  assert.equal(companyInitials("  ortex  "), "O")
  assert.equal(companyInitials(""), "")
  assert.equal(COMPANY_MARK_COLOURS.length, 8)
  // (hash * 31 + code) >>> 0, mod 8: pinned so the console's twin can be checked against it.
  assert.equal(companyColour("aman"), "#0F766E") // hash 2997593, mod 8 = 1
  assert.equal(companyColour("aman"), companyColour("aman"))
  assert.ok(COMPANY_MARK_COLOURS.includes(companyColour("nidhi")))
  assert.match(companyMarkSvg("aman", "Aman Enterprise"), />AE<\/text>/)
  assert.match(companyMarkSvg("x", "<b>"), /&lt;/)
})

test("the quotation masthead: uploaded logo, else Ortex's wordmark for Ortex, else the monogram", () => {
  const company = { name: "Aman Enterprise", logoUrl: "" }
  assert.equal(mastheadLogo({ companyId: "aman" }, { ...company, logoUrl: "https://x/l.png" }), "https://x/l.png")
  assert.equal(mastheadLogo({ companyId: "aman" }, { ...company, logoUrl: "https://x/l.png" }, "data:image/png;base64,AA"), "data:image/png;base64,AA")
  assert.match(mastheadLogo({ companyId: "aman" }, company), /^data:image\/svg\+xml;utf8,.*AE/)
  assert.match(mastheadLogo({ companyId: "aman" }, { ...company, logoUrl: "https://x/l.png" }, null), /^data:image\/svg\+xml/)
  const ortex = mastheadLogo({ companyId: "ortex" }, company)
  assert.equal(mastheadLogo({}, company), ortex, "a record from before companies is Ortex's")
  assert.doesNotMatch(ortex, /AE/)
})

// The console draws the same monogram (Ortex.Admin/src/lib/companyMark.js):
// a quotation from either app must carry the same initials in the same colour.
test("companyMark: the console and the phone draw the same mark", async () => {
  const { dirname, resolve } = await import("node:path")
  const { fileURLToPath } = await import("node:url")
  const { loadModule } = await import("./loadTs.mjs")
  const here = dirname(fileURLToPath(import.meta.url))
  const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/companyMark.js"))
  assert.deepEqual(admin.COMPANY_MARK_COLOURS, COMPANY_MARK_COLOURS)
  for (const [id, name] of [["ortex", "Ortex Industries"], ["aman", "Aman Enterprise"], ["nidhi", "Nidhi Industries"], ["x", ""], ["acme-2", "  acme   & sons ltd "]]) {
    assert.equal(admin.companyInitials(name), companyInitials(name))
    assert.equal(admin.companyColour(id), companyColour(id))
    assert.equal(admin.companyMarkSvg(id, name), companyMarkSvg(id, name))
  }
})
