// Roles (migration 0032, docs/pm/ATTENDANCE_LEAVE_PLAN.md §3a) and the labels
// shared by the Users, Profile and Roles & permissions pages. Mirrored by
// Ortex.Mobile/src/domain/modules.ts.
//
// Any number of Super Admins (migration 0067), each with full access: an admin
// everywhere an admin is asked for, and alone able to manage admins, company
// settings, the attendance rules and the role permissions. One of them is the
// Owner (profiles.is_owner, Louis Sharma, permanent): only the Owner makes or
// removes a Super Admin, and nobody can change, deactivate or delete the Owner.
// The database enforces all of it.

import { MODULES } from "../data/domain/modules"

export const ROLES = ["super_admin", "admin", "accounts", "sales", "staff"]

export const ROLE_LABEL = {
  super_admin: "Super Admin",
  admin: "Admin",
  accounts: "Accounts",
  sales: "Sales Executive",
  staff: "Staff",
}

export const ROLE_DESCRIPTION = {
  super_admin: "Full access. Everything, including admins, company settings, payroll and role permissions",
  admin: "Day-to-day operations. Everything except the Super Admin's settings",
  accounts: "Billing and payroll",
  sales: "Leads, customers and quotations",
  staff: "Attendance and leave only",
}

/** Roles whose section access the Super Admin sets on Roles & permissions. */
export const CONFIGURABLE_ROLES = ["accounts", "sales", "staff"]

/** Badge tone per role, so the Users list reads at a glance. */
export const ROLE_TONE = { super_admin: "violet", admin: "violet", accounts: "amber", sales: "blue", staff: "slate" }

const roleOf = (p) => (typeof p === "string" ? p : p?.role)

/** Super Admin or Admin: every module, and every admin-only page. */
export const isAdmin = (p) => roleOf(p) === "admin" || roleOf(p) === "super_admin"
export const isSuperAdmin = (p) => roleOf(p) === "super_admin"
/** The Owner: the one Super Admin nobody can change, and the only one who makes Super Admins. */
export const isOwner = (p) => typeof p === "object" && p?.is_owner === true

/** The roles this person may hand out when creating or editing a login. */
export function assignableRoles(viewer) {
  if (isOwner(viewer)) return ["super_admin", "admin", "accounts", "sales", "staff"]
  if (isSuperAdmin(viewer)) return ["admin", "accounts", "sales", "staff"]
  if (isAdmin(viewer)) return ["accounts", "sales", "staff"]
  return []
}

/**
 * May `viewer` edit or act on `target`'s account? Mirrors the 0032/0067 triggers.
 * A Super Admin's own account is theirs (name, password; never their own role or
 * active flag), another Super Admin's only the Owner's, the Owner's nobody else's.
 */
export function canManageUser(viewer, target) {
  if (!isAdmin(viewer) || !target) return false
  if (isSuperAdmin(target)) {
    if (viewer?.id && viewer.id === target.id) return isSuperAdmin(viewer)
    return isOwner(viewer) && !isOwner(target)
  }
  if (isAdmin(target)) return isSuperAdmin(viewer)
  return true
}

/** A role, or a person's role: the Owner reads "Super Admin · Owner". */
export const roleLabel = (who) => (isOwner(who) ? "Super Admin · Owner" : ROLE_LABEL[roleOf(who)] || roleOf(who))

export const moduleLabel = (key) => MODULES.find((m) => m.key === key)?.label || key
