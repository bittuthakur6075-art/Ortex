// Per-user module access.
//
// PORT OF Ortex.Admin/src/data/domain/modules.js. `profiles.modules` is written
// by the console's Users page, so the check has to agree exactly — a mobile
// copy that drifts would either hide a tab a user was granted or, worse, show
// one they were not. Only the keys this app has screens for are listed; the
// console owns the rest.

export type Profile = {
  id?: string
  role?: string
  modules?: string[]
  name?: string
  email?: string
  active?: boolean
  avatar_url?: string | null
}

export type ModuleKey = "voice-leads" | "enquiries" | "customers" | "products" | "quotations"

export const MODULES: { key: ModuleKey; label: string; adminOnly?: boolean; always?: boolean }[] = [
  { key: "voice-leads", label: "Voice calls" },
  { key: "enquiries", label: "Enquiries" },
  { key: "customers", label: "Customers" },
  { key: "products", label: "Products" },
  { key: "quotations", label: "Quotations" },
]

// Can this profile reach the given module?
export function canAccess(profile: Profile | null | undefined, key: ModuleKey): boolean {
  if (!profile) return false
  const m = MODULES.find((x) => x.key === key)
  if (!m) return false
  if (m.always) return true
  if (profile.role === "admin") return true
  if (m.adminOnly) return false
  return Array.isArray(profile.modules) && profile.modules.includes(key)
}

export const ROLE_LABEL: Record<string, string> = { admin: "Admin", sales: "Sales Executive" }

export const roleLabel = (role?: string) => (role ? ROLE_LABEL[role] || role : "")
