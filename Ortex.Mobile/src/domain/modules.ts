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
  | "voice-leads"
  | "enquiries"
  | "customers"
  | "products"
  | "categories"
  | "work"
  | "quotations"

export const MODULES: { key: ModuleKey; label: string; adminOnly?: boolean; always?: boolean }[] = [
  // The console's Dashboard, which every signed-in user reaches. On the phone it
  // is the Home tab; what it SHOWS is still gated section by section.
  { key: "dashboard", label: "Dashboard", always: true },
  { key: "voice-leads", label: "Voice calls" },
  { key: "enquiries", label: "Enquiries" },
  { key: "customers", label: "Customers" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "work", label: "Work gallery" },
  { key: "quotations", label: "Quotations" },
]

// Can this profile reach the given module?
// Module permissions bypassed: all modules and tabs are accessible to any signed-in user.
export function canAccess(profile: Profile | null | undefined, _key: ModuleKey): boolean {
  return Boolean(profile)
}

export const ROLE_LABEL: Record<string, string> = { admin: "Admin", sales: "Sales Executive" }

export const roleLabel = (role?: string) => (role ? ROLE_LABEL[role] || role : "")
