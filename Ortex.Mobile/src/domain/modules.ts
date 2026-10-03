// Per-user module access and the five roles.
//
// PORT OF Ortex.Admin/src/data/domain/modules.js + lib/roles.js. `profiles.modules`
// is written by the console's Users page, a role's grants and the module switches
// by the Super Admin's Modules page (`role_permissions`, migration 0032, and
// `module_controls`, migration 0053), so the check has
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
  /**
   * The Super Admin's per-module switches (`module_controls`, migration 0053,
   * the console's Modules page), read with the profile. A key with no entry is
   * on, and every Admin reaches it.
   */
  moduleControls?: Record<string, ModuleControl>
  /** The companies this person works in (Admin migration 0075), their default first. Only a Super Admin changes it. */
  companies?: string[]
  /** Modules the Super Admin hid from this person, whatever their role gives (migration 0055). */
  modules_hidden?: string[]
  /** The Owner (migration 0067): one Super Admin, permanent. Written only by the database. */
  is_owner?: boolean
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

export type ModuleControl = { enabled: boolean; adminAccess: boolean }

export type ModuleKey =
  | "dashboard"
  | "chat"
  | "attendance"
  | "attendance-team"
  | "attendance-register"
  | "attendance-qr"
  | "attendance-holidays"
  | "leave-balances"
  | "payroll"
  | "payslips"
  | "voice-leads"
  | "enquiries"
  | "customers"
  | "products"
  | "categories"
  | "work"
  | "social"
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
  /** The Super Admin, and whoever holds the `payroll` grant (is_payroll(), 0040). Not every Admin. */
  payrollOnly?: boolean
}

export const MODULES: ModuleDef[] = [
  // The console's Dashboard, which every signed-in user reaches. On the phone it
  // is the Home tab; what it SHOWS is still gated section by section.
  { key: "dashboard", label: "Dashboard", always: true },
  // Team chat (console only for now, migration 0045). Everyone chats; privacy
  // is per conversation, not per module.
  { key: "chat", label: "Team chat", always: true },
  // Everyone marks their own attendance and applies for their own leave.
  { key: "attendance", label: "Attendance", always: true },
  { key: "attendance-team", label: "Attendance · Everyone's records" },
  { key: "attendance-register", label: "Attendance · Register & payroll" },
  // Shown on the console only (the QR display is a web screen), but the key
  // lives here too because this file mirrors the console registry.
  { key: "attendance-qr", label: "Attendance · Show the QR code" },
  // Managing holidays is a console screen (migration 0057); the key mirrors the registry.
  { key: "attendance-holidays", label: "Attendance · Manage holidays" },
  { key: "leave-balances", label: "Attendance · Manage leave balances" },
  { key: "payroll", label: "Payroll", payrollOnly: true },
  { key: "payslips", label: "My payslips", always: true },
  { key: "voice-leads", label: "Voice calls" },
  { key: "enquiries", label: "Enquiries" },
  { key: "customers", label: "Customers" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "work", label: "Work gallery" },
  // Marketing: the console's view of posts, DMs, comments and follow-ups (console only).
  { key: "social", label: "Marketing" },
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
  accounts: ["invoices", "payments", "attendance-team", "attendance-register", "payroll"],
  staff: [],
}

const roleOf = (who: Profile | string | null | undefined) => (typeof who === "string" ? who : who?.role)

/** An Admin or the Super Admin: they reach every module that is not Super-Admin-only. */
export const isAdmin = (who: Profile | string | null | undefined) => {
  const role = roleOf(who)
  return role === "admin" || role === "super_admin"
}

export const isSuperAdmin = (who: Profile | string | null | undefined) => roleOf(who) === "super_admin"

/** The Owner: the one Super Admin nobody can change, and the only one who makes Super Admins. */
export const isOwner = (who: Profile | string | null | undefined) => typeof who === "object" && who?.is_owner === true

/** The roles this person may hand out when creating or editing a login (console lib/roles.js). */
export function assignableRoles(viewer: Profile | null | undefined): Role[] {
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
export function canManageUser(viewer: Profile | null | undefined, target: Profile | null | undefined): boolean {
  if (!isAdmin(viewer) || !target) return false
  if (isSuperAdmin(target)) {
    if (viewer?.id && viewer.id === target.id) return isSuperAdmin(viewer)
    return isOwner(viewer) && !isOwner(target)
  }
  if (isAdmin(target)) return isSuperAdmin(viewer)
  return true
}

/** The role's grants: the loaded `roleModules`, else the seed defaults. */
export function roleModulesOf(profile: Profile | null | undefined): string[] {
  if (!profile) return []
  if (Array.isArray(profile.roleModules)) return profile.roleModules
  return DEFAULT_ROLE_MODULES[profile.role as keyof typeof DEFAULT_ROLE_MODULES] || []
}

const OPEN: ModuleControl = { enabled: true, adminAccess: true }

/** The Super Admin's switches for one module; no entry means on, Admins included. */
export function moduleControl(profile: Profile | null | undefined, key: string): ModuleControl {
  const c = profile?.moduleControls?.[key]
  return c ? { enabled: c.enabled !== false, adminAccess: c.adminAccess !== false } : OPEN
}

// Can this profile reach the given module? The same rule as the console's
// canAccess and the database's has_module_access() (migrations 0032, 0053).
export function canAccess(profile: Profile | null | undefined, key: ModuleKey): boolean {
  if (!profile) return false
  if (profile.active === false) return false
  const m = MODULES.find((x) => x.key === key)
  if (m?.always) return true
  if (isSuperAdmin(profile)) return true
  if (m?.superAdminOnly) return false
  // Switched off for the whole company on the console's Modules page.
  const control = moduleControl(profile, key)
  if (!control.enabled) return false
  // Hidden from this one person by the Super Admin, whatever their role gives.
  if ((profile.modules_hidden || []).includes(key)) return false
  const granted = (profile.modules || []).includes(key) || roleModulesOf(profile).includes(key)
  // Payroll is checked before the admin shortcut: salaries are not everything
  // an Admin sees, only the Super Admin's and whoever is granted it.
  if (m?.payrollOnly) return granted
  if (isAdmin(profile)) return Boolean(m?.adminOnly || control.adminAccess || granted)
  if (m?.adminOnly) return false
  return granted
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

/** A role, or a person's role: the Owner reads "Super Admin · Owner". */
export const roleLabel = (who?: Profile | string | null) => {
  if (isOwner(who)) return "Super Admin · Owner"
  const role = roleOf(who)
  return role ? ROLE_LABEL[role] || role : ""
}

// ---- companies (Admin migrations 0075 and 0076) ----------------------------
//
// Enquiries (voice calls included), customers, quotations and payments belong
// to ONE company each; the catalogue, staff, attendance, leave, pay and chat are
// shared. The names are the console's (companiesOf, hasCompany), and the rule is
// the database's has_company_access().

/** A row of the `companies` table. `doc` holds that company's settings blocks. */
export type Company = { id: string; name: string; active?: boolean; sort?: number; doc?: Record<string, unknown> }

/** What lists show: one company's id, or "all" of the person's companies (admins with more than one). */
export type CompanyChoice = string

/** May this person read and write the company's records? has_company_access() in SQL. */
export function hasCompany(profile: Profile | null | undefined, companyId: string | null | undefined): boolean {
  if (!profile || profile.active === false || !companyId) return false
  if (isSuperAdmin(profile)) return true
  return (profile.companies || []).includes(companyId)
}

/**
 * The companies this person works in, their default first. A Super Admin works
 * in every company that is switched on, in the table's order. `companies` is the
 * table as RLS lets this person read it.
 */
export function companiesOf(profile: Profile | null | undefined, companies: Company[]): Company[] {
  if (!profile || profile.active === false) return []
  if (isSuperAdmin(profile)) return companies.filter((c) => c.active !== false)
  return (profile.companies || [])
    .map((id) => companies.find((c) => c.id === id))
    .filter((c): c is Company => !!c)
}

/** The "All companies" view: admins who work in more than one company. */
export const canSeeAllCompanies = (profile: Profile | null | undefined, mine: Company[]) =>
  isAdmin(profile) && mine.length > 1

/** A saved choice if it still holds, else the person's first company; "" when there are none (before 0075). */
export function pickCompany(
  saved: string | null | undefined,
  profile: Profile | null | undefined,
  mine: Company[],
): CompanyChoice {
  if (saved === "all" && canSeeAllCompanies(profile, mine)) return "all"
  if (saved && saved !== "all" && mine.some((c) => c.id === saved)) return saved
  return mine[0]?.id ?? ""
}

/**
 * The company ids a list keeps, or null for "keep everything": a database with
 * no companies yet (before 0075) behaves exactly as it always did.
 */
export function companyScope(choice: CompanyChoice, mine: Company[]): string[] | null {
  if (!mine.length || !choice) return null
  return choice === "all" ? mine.map((c) => c.id) : [choice]
}

/** The rows of the companies in `scope`; with no scope, every row. */
export function inCompanies<T>(rows: T[], scope: string[] | null): T[] {
  if (!scope) return rows
  return rows.filter((r) => {
    const id = (r as { companyId?: unknown }).companyId
    return typeof id === "string" && scope.includes(id)
  })
}

/**
 * The company_id a new record is written with. Undefined when the database has
 * no companies yet (its default then applies, as before 0075); otherwise a real
 * company is required.
 */
export function companyForCreate(companyId: unknown, companiesOn: boolean): string | undefined {
  if (!companiesOn) return undefined
  if (typeof companyId !== "string" || !companyId || companyId === "all") throw new Error("Choose a company")
  return companyId
}
