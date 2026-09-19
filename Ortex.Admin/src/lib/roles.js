// Roles (migration 0032, docs/pm/ATTENDANCE_LEAVE_PLAN.md §3a) and the labels
// shared by the Users, Profile and Roles & permissions pages. Mirrored by
// Ortex.Mobile/src/domain/modules.ts.
//
// There is exactly ONE Super Admin (the owner). They are an admin everywhere an
// admin is asked for, and alone can manage admins, company settings, the
// attendance rules and the role permissions. The database enforces all of it.

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
  super_admin: "The owner. Everything, including admins, company settings and role permissions",
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

/** The roles this person may hand out when creating or editing a login. */
export function assignableRoles(viewer) {
  if (isSuperAdmin(viewer)) return ["admin", "accounts", "sales", "staff"]
  if (isAdmin(viewer)) return ["accounts", "sales", "staff"]
  return []
}

/** May `viewer` edit or act on `target`'s account? Mirrors 0032's trigger. */
export function canManageUser(viewer, target) {
  if (!isAdmin(viewer) || !target) return false
  if (isSuperAdmin(target)) return isSuperAdmin(viewer) && viewer?.id === target.id
  if (isAdmin(target)) return isSuperAdmin(viewer)
  return true
}

export const roleLabel = (role) => ROLE_LABEL[role] || role

export const moduleLabel = (key) => MODULES.find((m) => m.key === key)?.label || key
