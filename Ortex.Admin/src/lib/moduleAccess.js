// Why someone can open a module, for the Super Admin's Modules page. Pure, so
// the rule is tested beside canAccess() (moduleAccess.test.js) and the page
// never works it out a second way.
//
//   "super"  the Super Admin, who reaches everything, switched off or not
//   "admin"  the Admin role reaches it (the Admin switch is on)
//   "role"   their role's grant (role_permissions)
//   "own"    ticked on their own profile (profiles.modules)
//   null     they cannot open it (or the module is switched off)

import { MODULES, canAccess, moduleControl } from "../data/domain/modules"
import { isAdmin, isSuperAdmin } from "./roles"

export const REASON_LABEL = {
  super: "Super Admin",
  admin: "Admin role",
  role: "Role",
  own: "Own access",
}

/** `grants` is { role: [keys] }, `controls` is { key: { enabled, adminAccess } }. */
export function accessReason(person, key, grants, controls) {
  if (!person || person.active === false) return null
  if (isSuperAdmin(person)) return "super"
  const m = MODULES.find((x) => x.key === key)
  if (!m) return null
  const p = { ...person, roleModules: isAdmin(person) ? undefined : grants?.[person.role], moduleControls: controls }
  if (!canAccess(p, key)) return null
  const own = Array.isArray(person.modules) && person.modules.includes(key)
  if (isAdmin(person)) {
    // Payroll reaches an Admin only through their own tick (canAccess above).
    if (m.payrollOnly || m.adminByGrant) return own ? "own" : "admin"
    return moduleControl(p, key).adminAccess || m.adminOnly ? "admin" : "own"
  }
  const fromRole = (grants?.[person.role] || []).includes(key)
  return fromRole ? "role" : "own"
}

/** The people who can open `key`, each with their reason, most access first. */
export function whoCanOpen(people, key, grants, controls) {
  const order = { super: 0, admin: 1, role: 2, own: 3 }
  return (people || [])
    .map((person) => ({ person, reason: accessReason(person, key, grants, controls) }))
    .filter((x) => x.reason)
    .sort((a, b) => order[a.reason] - order[b.reason] || String(a.person.name || a.person.email).localeCompare(String(b.person.name || b.person.email)))
}
