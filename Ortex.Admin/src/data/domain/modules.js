// Single source of truth for the app's modules. Drives the sidebar nav, the
// Modules page (pages/Modules.jsx), the per-user extras checklist, and the route
// guards. `key` is what gets stored in role_permissions.modules and in each
// profile's own `modules` list. Mirrored by Ortex.Mobile/src/domain/modules.ts.
//
//  - always:         every signed-in user can reach it (Dashboard, Attendance)
//  - superAdminOnly: only the Super Admin (company settings)
//  - adminOnly:      the Super Admin and Admins; never grantable
//  - payrollOnly:    the Super Admin, and whoever holds the payroll grant
//                    (is_payroll(), migration 0040); NOT every Admin
//  - otherwise:      granted to a ROLE by the Super Admin (role_permissions,
//                    migration 0032), plus any extras ticked on one person
//
// On top of that the Super Admin's Modules page (migration 0053,
// module_controls) can switch a grantable module off for the whole company, or
// stop Admins reaching it automatically, and hide any module from one person
// (profiles.modules_hidden, migration 0055). See moduleControl() below.

import { isAdmin, isSuperAdmin } from "../../lib/roles"

export const MODULES = [
  { key: "dashboard", path: "/", label: "Dashboard", section: null, always: true },
  // Team chat and the Anu thread (migration 0045). Everyone chats; privacy is
  // per conversation (members only), not per module.
  { key: "chat", path: "/chat", label: "Team chat", section: null, always: true },
  { key: "voice-leads", path: "/crm?tab=voice", label: "Leads · Voice calls", section: "Sales" },
  { key: "enquiries", path: "/crm?tab=enquiries", label: "Leads · Enquiries", section: "Sales" },
  { key: "customers", path: "/customers", label: "Customers", section: "Sales" },
  { key: "products", path: "/catalog?tab=products", label: "Catalogue · Products", section: "Catalogue" },
  { key: "categories", path: "/catalog?tab=categories", label: "Catalogue · Categories", section: "Catalogue" },
  { key: "work", path: "/catalog?tab=work", label: "Catalogue · Work photos", section: "Catalogue" },
  { key: "quotations", path: "/quotations", label: "Quotations", section: "Sales" },
  { key: "invoices", path: "/billing?tab=invoices", label: "Billing · Invoices", section: "Sales" },
  { key: "payments", path: "/billing?tab=payments", label: "Billing · Payments", section: "Sales" },
  // Attendance & Leave (docs/pm/ATTENDANCE_LEAVE_PLAN.md). Everyone has their
  // own attendance; seeing everyone's and running payroll are grantable.
  { key: "attendance", path: "/attendance", label: "Attendance", section: "People", always: true },
  { key: "attendance-team", path: "/attendance?tab=register", label: "Attendance · Everyone's records", section: "People" },
  { key: "attendance-register", path: "/attendance?tab=register", label: "Attendance · Register & payroll", section: "People" },
  // The rotating QR code staff scan to mark attendance (migration 0043).
  // Granting it to someone who is not an admin does nothing: the database's
  // attendance_qr_issuer() wants the Super Admin, or an admin holding this key.
  { key: "attendance-qr", path: "/attendance?tab=qr", label: "Attendance · Show the QR code", section: "People" },
  // Add, change and remove holidays (migration 0057). Every Admin by default.
  { key: "attendance-holidays", path: "/attendance?tab=holidays", label: "Attendance · Manage holidays", section: "People" },
  // Add, remove, set and undo leave balance changes (migration 0059). Starts
  // with the Admin role OFF: the Super Admin picks which Admins get it.
  { key: "leave-balances", path: "/attendance?tab=leave-balances", label: "Attendance · Manage leave balances", section: "People" },
  // Payroll (docs/pm/PAYROLL_PLAN.md, modelled on Zoho Payroll).
  { key: "payroll", path: "/payroll", label: "Payroll", section: "People", payrollOnly: true },
  { key: "payslips", path: "/my-records?tab=payslips", label: "My records · Payslips", section: "People", always: true },
  { key: "users", path: "/users", label: "Users", section: "Admin", adminOnly: true },
  { key: "settings", path: "/control", label: "Control centre", section: "Admin", superAdminOnly: true },
  // The Super Admin's one place for who opens what (pages/Modules.jsx).
  { key: "modules", path: "/control?section=access", label: "Control centre · Modules & roles", section: "Admin", superAdminOnly: true },
  // The key stays `social` while the page is called Marketing: it is mirrored by
  // the phone app, and renaming it on one side takes the module away from
  // whoever holds it.
  { key: "social", path: "/marketing", label: "Marketing", section: "Growth" },
  { key: "telecaller", path: "/telecaller", label: "Call agent", section: "Growth" },
  // One page, one key (0061). `growth` and `automation` were two keys for two
  // tabs of the same page, and both were adminOnly, so neither was ever a grant.
  { key: "insights", path: "/insights", label: "Insights", section: "Growth", adminOnly: true },
]

// Modules the Super Admin can grant to a role, or an admin to one person.
export const ASSIGNABLE_MODULES = MODULES.filter((m) => !m.always && !m.adminOnly && !m.superAdminOnly)

// Every grantable key. An admin implicitly has all of these.
export const ALL_MODULE_KEYS = ASSIGNABLE_MODULES.map((m) => m.key)

/**
 * What each role gets until the Super Admin changes it, and what the apps fall
 * back to when role_permissions cannot be read (0032 not pushed yet). Must
 * equal the seed in migration 0032 plus 0040's payroll grant for Accounts.
 */
export const DEFAULT_ROLE_MODULES = {
  sales: ["voice-leads", "enquiries", "customers", "quotations"],
  accounts: ["invoices", "payments", "attendance-team", "attendance-register", "payroll"],
  staff: [],
}

/** @deprecated The role's grants now come from role_permissions; kept for old callers. */
export const SALES_DEFAULT_MODULES = DEFAULT_ROLE_MODULES.sales

/** Everything this profile can open: its role's grants plus its own extras. */
export function grantedModules(profile) {
  if (!profile) return []
  const own = Array.isArray(profile.modules) ? profile.modules : []
  const role = Array.isArray(profile.roleModules) ? profile.roleModules : DEFAULT_ROLE_MODULES[profile.role] || []
  return [...new Set([...role, ...own])]
}

/**
 * Whether the Super Admin can stop Admins reaching this module automatically.
 * Payroll never comes with the Admin role, so the Modules page does not offer
 * the switch for it.
 */
export const adminAccessConfigurable = (m) => !m.payrollOnly

/** Modules the Super Admin has hidden from this person (profiles.modules_hidden, 0055). */
export const hiddenModules = (profile) => (Array.isArray(profile?.modules_hidden) ? profile.modules_hidden : [])

const OPEN = Object.freeze({ enabled: true, adminAccess: true })

/**
 * The Super Admin's switches for one module (module_controls, migration 0053),
 * attached to a profile as `moduleControls` by useProfile. No row means on, and
 * every Admin reaches it: the state before 0053.
 */
export function moduleControl(profile, key) {
  const c = profile?.moduleControls?.[key]
  return c ? { enabled: c.enabled !== false, adminAccess: c.adminAccess !== false } : OPEN
}

/**
 * The grantable modules SOMEONE ELSE can open, for the Users list and the
 * Modules page: `roleGrants` is useRolePermissions().grants and `controls` is
 * useModuleControls().controls.
 */
export function reachableModules(person, roleGrants, controls) {
  if (!person) return []
  const p = { ...person, roleModules: isAdmin(person) ? undefined : roleGrants?.[person.role], moduleControls: controls }
  return ASSIGNABLE_MODULES.filter((m) => canAccess(p, m.key)).map((m) => m.key)
}

// Can this profile reach the given module? The same rule as has_module_access()
// in the database (migrations 0032 and 0053), so a hidden page is also a
// refused query.
export function canAccess(profile, key) {
  if (!profile || profile.active === false) return false
  const m = MODULES.find((x) => x.key === key)
  if (!m) return false
  if (m.always) return true
  if (isSuperAdmin(profile)) return true
  if (m.superAdminOnly) return false
  // Switched off for the whole company on the Modules page: the Super Admin only.
  const control = moduleControl(profile, key)
  if (!control.enabled) return false
  // Hidden from this one person by the Super Admin, whatever their role gives.
  if (hiddenModules(profile).includes(key)) return false
  const granted = grantedModules(profile).includes(key)
  // Payroll before the admin shortcut: the same rule as is_payroll() (0040).
  if (m.payrollOnly) return granted
  if (isAdmin(profile)) return Boolean(m.adminOnly || control.adminAccess || granted)
  if (m.adminOnly) return false
  return granted
}
