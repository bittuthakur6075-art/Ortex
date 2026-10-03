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

// ---- companies (migrations 0075 and 0076) ----------------------------------
//
// Enquiries (voice calls included), leads, customers, quotations, invoices and
// payments belong to ONE company each; the catalogue, staff, attendance, leave,
// payroll and chat are shared. The rule is the database's has_company_access().
// Mirrored by Ortex.Mobile/src/domain/modules.ts (same names): edit both.

/** The six tables whose rows carry company_id. */
export const COMPANY_TABLES = ["enquiries", "leads", "customers", "quotations", "invoices", "payments"]

/** May this person read and write the company's records? has_company_access() in SQL. */
export function hasCompany(profile, companyId) {
  if (!profile || profile.active === false || !companyId) return false
  if (isSuperAdmin(profile)) return true
  return (profile.companies || []).includes(companyId)
}

/**
 * The companies this person works in, their default first. A Super Admin works
 * in every company that is switched on, in the table's order. `companies` is the
 * table as RLS lets this person read it.
 */
export function companiesOf(profile, companies) {
  if (!profile || profile.active === false) return []
  if (isSuperAdmin(profile)) return (companies || []).filter((c) => c.active !== false)
  return (profile.companies || []).map((id) => (companies || []).find((c) => c.id === id)).filter(Boolean)
}

/** The "All companies" view: admins who work in more than one company. */
export const canSeeAllCompanies = (profile, mine) => isAdmin(profile) && mine.length > 1

/** A saved choice if it still holds, else the person's first company; "" when there are none (before 0075). */
export function pickCompany(saved, profile, mine) {
  if (saved === "all" && canSeeAllCompanies(profile, mine)) return "all"
  if (saved && saved !== "all" && mine.some((c) => c.id === saved)) return saved
  return mine[0]?.id ?? ""
}

/** The company ids a list keeps, or null for "keep everything" (a database with no companies yet). */
export function companyScope(choice, mine) {
  if (!mine.length || !choice) return null
  return choice === "all" ? mine.map((c) => c.id) : [choice]
}

/** The rows of the companies in `scope`; with no scope, every row. */
export function inCompanies(rows, scope) {
  if (!scope) return rows
  return rows.filter((r) => typeof r?.companyId === "string" && scope.includes(r.companyId))
}

/**
 * The company_id a new record is written with. Undefined when the database has
 * no companies yet (its default then applies, as before 0075); otherwise a real
 * company is required.
 */
export function companyForCreate(companyId, companiesOn) {
  if (!companiesOn) return undefined
  if (typeof companyId !== "string" || !companyId || companyId === "all") throw new Error("Choose a company")
  return companyId
}

/** A new company's id from its name: lowercase words joined by "-", unique among `taken` (0075's id rule). */
export function companySlug(name, taken = []) {
  let base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "")
    .slice(0, 28)
    .replace(/-+$/, "")
  if (base.length < 2) base = `co-${base}`.replace(/-+$/, "") || "co"
  if (base.length < 2) base = "company"
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}
