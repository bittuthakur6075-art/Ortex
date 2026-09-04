// Single source of truth for the app's modules. Drives the sidebar nav, the
// per-user access checklist, and the route guards. `key` is what gets stored in
// each profile's `modules` list.
//
//  - always:    every signed-in user can reach it (Dashboard)
//  - adminOnly: only role === 'admin', never grantable to a Sales Executive
//  - otherwise: granted per-user via their `modules` list

export const MODULES = [
  { key: "dashboard", path: "/", label: "Dashboard", section: null, always: true },
  { key: "leads", path: "/crm?tab=leads", label: "CRM · Pipeline", section: "CRM" },
  { key: "voice-leads", path: "/crm?tab=voice", label: "CRM · Voice calls", section: "CRM" },
  { key: "enquiries", path: "/crm?tab=enquiries", label: "CRM · Enquiries", section: "CRM" },
  { key: "customers", path: "/customers", label: "Customers", section: "CRM" },
  { key: "products", path: "/catalog?tab=products", label: "Catalog · Products", section: "Catalog" },
  { key: "categories", path: "/catalog?tab=categories", label: "Catalog · Categories", section: "Catalog" },
  { key: "work", path: "/catalog?tab=work", label: "Catalog · Work photos", section: "Catalog" },
  { key: "quotations", path: "/quotations", label: "Quotations", section: "Sales" },
  { key: "invoices", path: "/billing?tab=invoices", label: "Billing · Invoices", section: "Sales" },
  { key: "payments", path: "/billing?tab=payments", label: "Billing · Payments", section: "Sales" },
  { key: "users", path: "/users", label: "Users", section: "System", adminOnly: true },
  { key: "settings", path: "/settings", label: "Settings", section: "System", adminOnly: true },
  { key: "social", path: "/social", label: "Social", section: "Automation" },
  { key: "telecaller", path: "/telecaller", label: "Telecaller", section: "Automation" },
  { key: "growth", path: "/insights?tab=growth", label: "Growth · Funnel", section: "Automation", adminOnly: true },
  { key: "automation", path: "/insights?tab=events", label: "Growth · Web events", section: "Automation", adminOnly: true },
]

// Modules a Sales Executive can be granted (configurable per user).
export const ASSIGNABLE_MODULES = MODULES.filter((m) => !m.always && !m.adminOnly)

// Default checklist for a newly-created Sales Executive.
export const SALES_DEFAULT_MODULES = ["leads", "voice-leads", "enquiries", "customers", "quotations"]

// Every grantable key — an admin implicitly has all of these.
export const ALL_MODULE_KEYS = ASSIGNABLE_MODULES.map((m) => m.key)

// Can this profile reach the given module?
export function canAccess(profile, key) {
  if (!profile) return false
  const m = MODULES.find((x) => x.key === key)
  if (!m) return false
  if (m.always) return true
  if (profile.role === "admin") return true
  if (m.adminOnly) return false
  return Array.isArray(profile.modules) && profile.modules.includes(key)
}
