// Staff authentication gate shared by every Edge Function that must only be
// callable from the Admin console.
//
// The JWT is validated explicitly with `auth.getUser(jwt)` (more reliable than
// a global-header client), then the profile is read with the service-role key
// so RLS can never hide it — a previous version produced false 403s that way.
// When the service key is absent we fall back to the caller's own session.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { json } from "./http.ts"

export type Staff = {
  userId: string
  email: string | undefined
  role: string
  /** Service-role client when the key is configured, otherwise the caller's own session. */
  db: SupabaseClient
}

/**
 * Resolve the caller to an active staff profile with one of `roles`.
 * Returns a ready-to-send 401/403 `Response` on failure, so callers can write
 * `const staff = await requireStaff(req); if (staff instanceof Response) return staff`.
 */
export async function requireStaff(
  req: Request,
  roles: string[] = ["admin", "sales"],
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
    .from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle()
  if (!prof || prof.active === false || !roles.includes(prof.role)) {
    return json({ error: forbiddenMessage }, 403)
  }
  return { userId: userData.user.id, email: userData.user.email, role: prof.role, db: reader }
}
