// Single source of truth for the app's modules. Drives the sidebar nav, the
// Roles & permissions matrix, the per-user extras checklist, and the route
// guards. `key` is what gets stored in role_permissions.modules and in each
// profile's own `modules` list. Mirrored by Ortex.Mobile/src/domain/modules.ts.
//
//  - always:         every signed-in user can reach it (Dashboard, Attendance)
//  - superAdminOnly: only the Super Admin (company settings)
//  - adminOnly:      the Super Admin and Admins; never grantable
//  - otherwise:      granted to a ROLE by the Super Admin (role_permissions,
//                    migration 0032), plus any extras ticked on one person

import { isAdmin, isSuperAdmin } from "../../lib/roles"

export const MODULES = [
  { key: "dashboard", path: "/", label: "Dashboard", section: null, always: true },
  { key: "voice-leads", path: "/crm?tab=voice", label: "Leads · Voice calls", section: "CRM" },
  { key: "enquiries", path: "/crm?tab=enquiries", label: "Leads · Enquiries", section: "CRM" },
  { key: "customers", path: "/customers", label: "Customers", section: "CRM" },
  { key: "products", path: "/catalog?tab=products", label: "Catalog · Products", section: "Catalog" },
  { key: "categories", path: "/catalog?tab=categories", label: "Catalog · Categories", section: "Catalog" },
  { key: "work", path: "/catalog?tab=work", label: "Catalog · Work photos", section: "Catalog" },
  { key: "quotations", path: "/quotations", label: "Quotations", section: "Sales" },
  { key: "invoices", path: "/billing?tab=invoices", label: "Billing · Invoices", section: "Sales" },
  { key: "payments", path: "/billing?tab=payments", label: "Billing · Payments", section: "Sales" },
  // Attendance & Leave (docs/pm/ATTENDANCE_LEAVE_PLAN.md). Everyone has their
  // own attendance; seeing everyone's and running payroll are grantable.
  { key: "attendance", path: "/attendance", label: "Attendance", section: "People", always: true },
  { key: "attendance-team", path: "/attendance?tab=register", label: "Attendance · Everyone's records", section: "People" },
  { key: "attendance-register", path: "/attendance?tab=register", label: "Attendance · Register & payroll", section: "People" },
  { key: "users", path: "/users", label: "Users", section: "System", adminOnly: true },
  { key: "settings", path: "/settings", label: "Settings", section: "System", superAdminOnly: true },
  { key: "social", path: "/social", label: "Social", section: "Automation" },
  { key: "telecaller", path: "/telecaller", label: "Call agent", section: "Automation" },
  { key: "growth", path: "/insights?tab=growth", label: "Insights · Funnel", section: "Automation", adminOnly: true },
  { key: "automation", path: "/insights?tab=events", label: "Insights · Web events", section: "Automation", adminOnly: true },
]

// Modules the Super Admin can grant to a role, or an admin to one person.
export const ASSIGNABLE_MODULES = MODULES.filter((m) => !m.always && !m.adminOnly && !m.superAdminOnly)

// Every grantable key. An admin implicitly has all of these.
export const ALL_MODULE_KEYS = ASSIGNABLE_MODULES.map((m) => m.key)

/**
 * What each role gets until the Super Admin changes it, and what the apps fall
 * back to when role_permissions cannot be read (0032 not pushed yet). Must
 * equal the seed in migration 0032.
 */
export const DEFAULT_ROLE_MODULES = {
  sales: ["voice-leads", "enquiries", "customers", "quotations"],
  accounts: ["invoices", "payments", "attendance-team", "attendance-register"],
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

// Can this profile reach the given module? The same rule as has_module_access()
// in the database (migration 0032), so a hidden page is also a refused query.
export function canAccess(profile, key) {
  if (!profile || profile.active === false) return false
  const m = MODULES.find((x) => x.key === key)
  if (!m) return false
  if (m.always) return true
  if (m.superAdminOnly) return isSuperAdmin(profile)
  if (isAdmin(profile)) return true
  if (m.adminOnly) return false
  return grantedModules(profile).includes(key)
}
