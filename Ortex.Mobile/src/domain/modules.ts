// Per-user module access and the five roles.
//
// PORT OF Ortex.Admin/src/data/domain/modules.js + lib/roles.js. `profiles.modules`
// is written by the console's Users page and a role's grants by the Super Admin's
// Roles & permissions screen (`role_permissions`, migration 0032), so the check has
// to agree exactly with the console and with has_module_access() in the database:
// a mobile copy that drifts would either hide a tab a user was granted or, worse,
// show one they were not. (Until 2026-09-19 this file returned `Boolean(profile)`,
// so every signed-in user saw every tab; the database still refused the reads.)

export type Role = "super_admin" | "admin" | "accounts" | "sales" | "staff"

export type Profile = {
  id?: string
  role?: string
  modules?: string[]
  /**
   * The grants of this profile's ROLE, read from `role_permissions` when the
   * profile loads (store/AuthContext.tsx) and cached with it, so an offline cold
   * start still draws the right tabs. Absent for admins, who need none.
   */
  roleModules?: string[]
  name?: string
  email?: string
  active?: boolean
  avatar_url?: string | null
  /** Set by the user on their own Account details page (migration 0021). */
  phone?: string | null
  created_at?: string
  /**
   * The user's own payment terms, T&C and notes for new quotations (migration
   * 0027). Absent entirely on a project that has not had 0027 pushed, which the
   * app treats as "keep them on this phone".
   */
  quotation_defaults?: { paymentTerms?: string | null; terms?: string | null; notes?: string | null } | null
}

export type ModuleKey =
  | "dashboard"
  | "attendance"
  | "attendance-team"
  | "attendance-register"
  | "voice-leads"
  | "enquiries"
  | "customers"
  | "products"
  | "categories"
  | "work"
  | "quotations"
  | "invoices"
  | "payments"
  | "users"
  | "settings"

export type ModuleDef = {
  key: ModuleKey
  label: string
  /** Every signed-in, active user reaches it. */
  always?: boolean
  /** Admins and the Super Admin only; never grantable. */
  adminOnly?: boolean
  /** The Super Admin only; never grantable, not even to an Admin. */
  superAdminOnly?: boolean
}

export const MODULES: ModuleDef[] = [
  // The console's Dashboard, which every signed-in user reaches. On the phone it
  // is the Home tab; what it SHOWS is still gated section by section.
  { key: "dashboard", label: "Dashboard", always: true },
  // Everyone marks their own attendance and applies for their own leave.
  { key: "attendance", label: "Attendance", always: true },
  { key: "attendance-team", label: "Attendance · Everyone's records" },
  { key: "attendance-register", label: "Attendance · Register & payroll" },
  { key: "voice-leads", label: "Voice calls" },
  { key: "enquiries", label: "Enquiries" },
  { key: "customers", label: "Customers" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "work", label: "Work gallery" },
  { key: "quotations", label: "Quotations" },
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
  { key: "users", label: "Users", adminOnly: true },
  { key: "settings", label: "Settings", superAdminOnly: true },
]

/**
 * What each non-admin role gets when `role_permissions` cannot be read (the
 * migration is not pushed yet, or the phone is offline on a first launch). The
 * seed values of migration 0032, kept in step with the console's copy.
 */
export const DEFAULT_ROLE_MODULES: Record<"accounts" | "sales" | "staff", string[]> = {
  sales: ["voice-leads", "enquiries", "customers", "quotations"],
  accounts: ["invoices", "payments", "attendance-team", "attendance-register"],
  staff: [],
}

const roleOf = (who: Profile | string | null | undefined) => (typeof who === "string" ? who : who?.role)

/** An Admin or the Super Admin: they reach every module that is not Super-Admin-only. */
export const isAdmin = (who: Profile | string | null | undefined) => {
  const role = roleOf(who)
  return role === "admin" || role === "super_admin"
}

export const isSuperAdmin = (who: Profile | string | null | undefined) => roleOf(who) === "super_admin"

/** The role's grants: the loaded `roleModules`, else the seed defaults. */
export function roleModulesOf(profile: Profile | null | undefined): string[] {
  if (!profile) return []
  if (Array.isArray(profile.roleModules)) return profile.roleModules
  return DEFAULT_ROLE_MODULES[profile.role as keyof typeof DEFAULT_ROLE_MODULES] || []
}

// Can this profile reach the given module? The same rule as the console's
// canAccess and the database's has_module_access().
export function canAccess(profile: Profile | null | undefined, key: ModuleKey): boolean {
  if (!profile) return false
  if (profile.active === false) return false
  const m = MODULES.find((x) => x.key === key)
  if (m?.always) return true
  if (m?.superAdminOnly) return isSuperAdmin(profile)
  if (isAdmin(profile)) return true
  if (m?.adminOnly) return false
  return (profile.modules || []).includes(key) || roleModulesOf(profile).includes(key)
}

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  accounts: "Accounts",
  sales: "Sales Executive",
  staff: "Staff",
}

/**
 * The pill each role wears, so the five read apart at a glance. Names of
 * theme/theme.ts status tones (kept as plain strings: domain/ never imports the
 * theme).
 */
export const ROLE_TONE: Record<string, "amber" | "violet" | "emerald" | "blue" | "slate"> = {
  super_admin: "amber",
  admin: "violet",
  accounts: "emerald",
  sales: "blue",
  staff: "slate",
}

/** Display order: most access first. */
export const ROLE_ORDER: Role[] = ["super_admin", "admin", "accounts", "sales", "staff"]

export const roleLabel = (role?: string) => (role ? ROLE_LABEL[role] || role : "")
