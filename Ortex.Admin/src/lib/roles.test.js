import { describe, expect, it } from "vitest"
import { assignableRoles, canManageUser, isOwner, roleLabel } from "./roles"

// Owner + additional Super Admins (migration 0067): the console offers only what
// the server allows. Mirrored by Ortex.Mobile/src/domain/modules.ts.

const owner = { id: "o", role: "super_admin", is_owner: true }
const coSuper = { id: "s", role: "super_admin" }
const otherSuper = { id: "s2", role: "super_admin", is_owner: false }
const admin = { id: "a", role: "admin" }
const otherAdmin = { id: "a2", role: "admin" }
const sales = { id: "r", role: "sales" }

describe("isOwner and roleLabel", () => {
  it("only is_owner === true is the Owner", () => {
    expect(isOwner(owner)).toBe(true)
    expect(isOwner(coSuper)).toBe(false)
    expect(isOwner("super_admin")).toBe(false)
  })

  it("labels the Owner apart, and still takes a bare role", () => {
    expect(roleLabel(owner)).toBe("Super Admin · Owner")
    expect(roleLabel(coSuper)).toBe("Super Admin")
    expect(roleLabel("sales")).toBe("Sales Executive")
  })
})

describe("assignableRoles", () => {
  it("only the Owner hands out Super Admin", () => {
    expect(assignableRoles(owner)).toEqual(["super_admin", "admin", "accounts", "sales", "staff"])
    expect(assignableRoles(coSuper)).toEqual(["admin", "accounts", "sales", "staff"])
    expect(assignableRoles(admin)).toEqual(["accounts", "sales", "staff"])
    expect(assignableRoles(sales)).toEqual([])
  })
})

describe("canManageUser", () => {
  it("nobody else manages the Owner; the Owner manages their own account", () => {
    expect(canManageUser(coSuper, owner)).toBe(false)
    expect(canManageUser(admin, owner)).toBe(false)
    expect(canManageUser(owner, owner)).toBe(true)
  })

  it("only the Owner manages another Super Admin", () => {
    expect(canManageUser(owner, coSuper)).toBe(true)
    expect(canManageUser(otherSuper, coSuper)).toBe(false)
    expect(canManageUser(admin, coSuper)).toBe(false)
    expect(canManageUser(coSuper, coSuper)).toBe(true)
  })

  it("any Super Admin manages Admins; an Admin manages neither Admins nor themselves", () => {
    expect(canManageUser(owner, admin)).toBe(true)
    expect(canManageUser(coSuper, admin)).toBe(true)
    expect(canManageUser(otherAdmin, admin)).toBe(false)
    expect(canManageUser(admin, admin)).toBe(false)
  })

  it("every admin manages the other roles; nobody else manages anyone", () => {
    for (const viewer of [owner, coSuper, admin]) expect(canManageUser(viewer, sales)).toBe(true)
    expect(canManageUser(sales, { id: "x", role: "staff" })).toBe(false)
    expect(canManageUser(owner, null)).toBe(false)
  })
})

// The phone's copy (Ortex.Mobile/src/domain/modules.ts) must agree for every pair.
// Checked here because Vite resolves the roles <-> modules import cycle that the
// phone's plain-Node test loader cannot.
describe("parity with the phone", () => {
  it("assignableRoles, roleLabel and canManageUser match Ortex.Mobile", async () => {
    const phone = await import("../../../Ortex.Mobile/src/domain/modules.ts")
    const people = [owner, coSuper, otherSuper, admin, otherAdmin, sales, { id: "c", role: "accounts" }, { id: "t", role: "staff" }]
    for (const viewer of people) {
      expect(phone.assignableRoles(viewer)).toEqual(assignableRoles(viewer))
      expect(phone.roleLabel(viewer)).toBe(roleLabel(viewer))
      for (const target of people) expect(phone.canManageUser(viewer, target), `${viewer.id} -> ${target.id}`).toBe(canManageUser(viewer, target))
    }
  })
})
