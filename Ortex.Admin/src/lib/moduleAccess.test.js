import { describe, expect, it } from "vitest"
import { canAccess, reachableModules, ALL_MODULE_KEYS } from "../data/domain/modules"
import { accessReason, whoCanOpen } from "./moduleAccess"

// canAccess() must agree with has_module_access() after migration 0053: a
// module switched off reaches only the Super Admin, and a module taken off the
// Admin role reaches an Admin only through a tick on their own profile.

const p = (over = {}) => ({ id: "u", active: true, modules: [], ...over })
const grants = { sales: ["quotations", "enquiries"], accounts: ["invoices", "payroll"], staff: [] }

describe("module switches", () => {
  it("change nothing while no row exists", () => {
    expect(canAccess(p({ role: "admin" }), "invoices")).toBe(true)
    expect(canAccess(p({ role: "sales", roleModules: grants.sales }), "quotations")).toBe(true)
    expect(reachableModules(p({ role: "admin" }), grants, {})).toHaveLength(ALL_MODULE_KEYS.length - 1) // not payroll
  })

  it("a module switched off reaches only the Super Admin", () => {
    const controls = { quotations: { enabled: false, adminAccess: true } }
    expect(canAccess(p({ role: "sales", roleModules: grants.sales, moduleControls: controls }), "quotations")).toBe(false)
    expect(canAccess(p({ role: "admin", moduleControls: controls }), "quotations")).toBe(false)
    expect(canAccess(p({ role: "sales", modules: ["quotations"], moduleControls: controls }), "quotations")).toBe(false)
    expect(canAccess(p({ role: "super_admin", moduleControls: controls }), "quotations")).toBe(true)
  })

  it("payroll switched off closes it to Accounts too", () => {
    const controls = { payroll: { enabled: false, adminAccess: true } }
    expect(canAccess(p({ role: "accounts", roleModules: grants.accounts }), "payroll")).toBe(true)
    expect(canAccess(p({ role: "accounts", roleModules: grants.accounts, moduleControls: controls }), "payroll")).toBe(false)
  })

  it("taking a module off Admins leaves their own ticks", () => {
    const controls = { invoices: { enabled: true, adminAccess: false } }
    expect(canAccess(p({ role: "admin", moduleControls: controls }), "invoices")).toBe(false)
    expect(canAccess(p({ role: "admin", modules: ["invoices"], moduleControls: controls }), "invoices")).toBe(true)
    // Admin-only pages are not grantable, so the switch never touches them.
    expect(canAccess(p({ role: "admin", moduleControls: controls }), "users")).toBe(true)
  })

  it("the Modules page itself is the Super Admin's alone", () => {
    expect(canAccess(p({ role: "super_admin" }), "modules")).toBe(true)
    expect(canAccess(p({ role: "admin" }), "modules")).toBe(false)
    expect(canAccess(p({ role: "sales", modules: ["modules"] }), "modules")).toBe(false)
  })
})

describe("accessReason", () => {
  it("names where the access comes from", () => {
    expect(accessReason(p({ role: "super_admin" }), "invoices", grants, {})).toBe("super")
    expect(accessReason(p({ role: "admin" }), "invoices", grants, {})).toBe("admin")
    expect(accessReason(p({ role: "sales" }), "quotations", grants, {})).toBe("role")
    expect(accessReason(p({ role: "sales", modules: ["products"] }), "products", grants, {})).toBe("own")
    expect(accessReason(p({ role: "sales" }), "invoices", grants, {})).toBe(null)
    expect(accessReason(p({ role: "admin", modules: ["payroll"] }), "payroll", grants, {})).toBe("own")
    expect(accessReason(p({ role: "admin" }), "payroll", grants, {})).toBe(null)
    expect(accessReason(p({ role: "sales", active: false }), "quotations", grants, {})).toBe(null)
  })

  it("lists who can open a module, most access first", () => {
    const people = [
      p({ id: "s", name: "Sam", role: "sales" }),
      p({ id: "a", name: "Asha", role: "admin" }),
      p({ id: "x", name: "Owner", role: "super_admin" }),
      p({ id: "t", name: "Tara", role: "staff" }),
    ]
    expect(whoCanOpen(people, "quotations", grants, {}).map((x) => x.person.id)).toEqual(["x", "a", "s"])
    const off = { quotations: { enabled: false, adminAccess: true } }
    expect(whoCanOpen(people, "quotations", grants, off).map((x) => x.person.id)).toEqual(["x"])
  })
})

describe("migration 0055", () => {
  it("every Admin shows the gate QR code unless it is taken off the Admin role", () => {
    expect(canAccess(p({ role: "admin" }), "attendance-qr")).toBe(true)
    const controls = { "attendance-qr": { enabled: true, adminAccess: false } }
    expect(canAccess(p({ role: "admin", moduleControls: controls }), "attendance-qr")).toBe(false)
    expect(canAccess(p({ role: "admin", modules: ["attendance-qr"], moduleControls: controls }), "attendance-qr")).toBe(true)
  })

  it("a module hidden from one person closes it whatever their role gives", () => {
    expect(canAccess(p({ role: "admin", modules_hidden: ["attendance-qr"] }), "attendance-qr")).toBe(false)
    expect(canAccess(p({ role: "sales", roleModules: grants.sales, modules_hidden: ["quotations"] }), "quotations")).toBe(false)
    expect(canAccess(p({ role: "super_admin", modules_hidden: ["quotations"] }), "quotations")).toBe(true)
    expect(accessReason(p({ role: "admin", modules_hidden: ["invoices"] }), "invoices", grants, {})).toBe(null)
  })
})
