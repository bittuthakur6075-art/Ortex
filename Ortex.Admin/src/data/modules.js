// Single source of truth for the app's modules. Drives the sidebar nav, the
// per-user access checklist, and the route guards. `key` is what gets stored in
// each profile's `modules` list.
//
//  - always:    every signed-in user can reach it (Dashboard)
//  - adminOnly: only role === 'admin', never grantable to a Sales Executive
//  - otherwise: granted per-user via their `modules` list

export const MODULES = [
  { key: "dashboard", path: "/", label: "Dashboard", section: null, always: true },
  { key: "leads", path: "/leads", label: "Leads", section: "CRM" },
  { key: "voice-leads", path: "/voice-leads", label: "Voice Leads", section: "CRM" },
  { key: "enquiries", path: "/enquiries", label: "Enquiries", section: "CRM" },
  { key: "customers", path: "/customers", label: "Customers", section: "CRM" },
  { key: "products", path: "/products", label: "Products", section: "Catalog" },
  { key: "categories", path: "/categories", label: "Categories", section: "Catalog" },
  { key: "work", path: "/work", label: "Work", section: "Catalog" },
  { key: "quotations", path: "/quotations", label: "Quotations", section: "Sales" },
  { key: "invoices", path: "/invoices", label: "Invoices", section: "Sales" },
  { key: "payments", path: "/payments", label: "Payments", section: "Sales" },
  { key: "users", path: "/users", label: "Users", section: "System", adminOnly: true },
  { key: "settings", path: "/settings", label: "Settings", section: "System", adminOnly: true },
  { key: "social", path: "/social", label: "Social", section: "Automation" },
  { key: "growth", path: "/growth", label: "Growth", section: "Automation", adminOnly: true },
  { key: "automation", path: "/automation", label: "Automation", section: "Automation", adminOnly: true },
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
