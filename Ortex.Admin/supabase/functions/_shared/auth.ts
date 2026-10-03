// Staff authentication gate shared by every Edge Function that must only be
// callable from the Admin console.
//
// The JWT is validated explicitly with `auth.getUser(jwt)` (more reliable than
// a global-header client), then the profile is read with the service-role key
// so RLS can never hide it — a previous version produced false 403s that way.
// When the service key is absent we fall back to the caller's own session.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { json } from "./http.ts"

// Untyped client: the functions work on JSON documents, and the bare
// SupabaseClient / ReturnType<typeof createClient> types collapse every table
// to never under supabase-js 2.115 typings.
// deno-lint-ignore no-explicit-any
export type Db = SupabaseClient<any, any, any, any, any>

export type Staff = {
  userId: string
  email: string | undefined
  role: string
  /** profiles.is_owner (migration 0067): the one permanent Owner. */
  isOwner: boolean
  /** Service-role client when the key is configured, otherwise the caller's own session. */
  db: Db
}

/** Every role (migration 0032). Super Admin is an admin wherever "admin" is asked. */
export const ALL_ROLES = ["super_admin", "admin", "accounts", "sales", "staff"]
export const ADMIN_ROLES = ["super_admin", "admin"]
export const isAdminRole = (role: unknown) => role === "admin" || role === "super_admin"
/** The database's refusal for the same rule (0067, owner_only_message()). */
export const OWNER_ONLY = "Only the Owner (Louis Sharma) can make or remove a Super Admin."

/** The refusal when someone other than the Super Admin sends `companies` (0075, protect_profile_privileges). */
export const COMPANIES_SUPER_ADMIN_ONLY = "Only the Super Admin can choose which companies someone works in."

/**
 * A profile's `companies` (migration 0075): a non-empty list of ids that exist
 * in `companies`, de-duplicated, in the order given (the first is where their
 * new records go). Returns the list, or the error text to send back.
 */
export async function checkCompanies(db: Db, value: unknown): Promise<string[] | string> {
  if (!Array.isArray(value) || !value.length || value.some((c) => typeof c !== "string" || !c.trim())) {
    return "Companies must be a list of at least one company id"
  }
  const ids = [...new Set((value as string[]).map((c) => c.trim()))]
  const { data, error } = await db.from("companies").select("id").in("id", ids)
  if (error) return `Could not check the companies: ${error.message}`
  const found = new Set((data || []).map((c: { id: string }) => c.id))
  const missing = ids.filter((c) => !found.has(c))
  return missing.length ? `Unknown company: ${missing.join(", ")}` : ids
}

/**
 * Resolve the caller to an active staff profile with one of `roles`.
 * Returns a ready-to-send 401/403 `Response` on failure, so callers can write
 * `const staff = await requireStaff(req); if (staff instanceof Response) return staff`.
 */
export async function requireStaff(
  req: Request,
  roles: string[] = ALL_ROLES,
  forbiddenMessage = "Staff access required",
): Promise<Staff | Response> {
  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const authHeader = req.headers.get("Authorization") ?? ""
  const jwt = authHeader.replace(/^bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Not authenticated" }, 401)

  const { data: userData, error: userErr } = await createClient(url, anon).auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401)

  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const reader = service
    ? createClient(url, service)
    : createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: prof } = await reader
    .from("profiles").select("role, active, is_owner").eq("id", userData.user.id).maybeSingle()
  // Asking for "admin" admits the Super Admin too: they are an admin with more.
  const allowed = roles.includes("admin") ? [...roles, "super_admin"] : roles
  if (!prof || prof.active === false || !allowed.includes(prof.role)) {
    return json({ error: forbiddenMessage }, 403)
  }
  return { userId: userData.user.id, email: userData.user.email, role: prof.role, isOwner: prof.is_owner === true, db: reader }
}
