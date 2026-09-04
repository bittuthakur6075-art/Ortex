// Edge Function: admin-create-user
//
// Creates a new auth user (email + password + role + module access). Callable
// ONLY by a signed-in admin — the caller's JWT is checked against their profile
// role before the service-role key is used to create the user. This is the only
// supported way to mint a console login; there is no public signup.
//
// Deploy:  supabase functions deploy admin-create-user
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
//  automatically by the platform — no manual secrets needed.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // 1) Identify the caller and confirm they are an active admin.
    const staff = await requireStaff(req, ["admin"], "Admin access required")
    if (staff instanceof Response) return staff

    // 2) Validate input.
    const { email, password, name, role, modules } = await req.json()
    if (!email || !password) return json({ error: "Email and password are required" }, 400)
    if (String(password).length < 6) return json({ error: "Password must be at least 6 characters" }, 400)
    if (!["admin", "sales"].includes(role)) return json({ error: "Role must be admin or sales" }, 400)

    // 3) Create the user with the service-role key. The signup trigger seeds a
    //    least-privileged profile (sales / no modules) — it deliberately ignores
    //    user_metadata, since that is attacker-controlled on a public signup.
    const admin = createClient(url, service)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name ?? "" },
    })
    if (error) return json({ error: error.message }, 400)

    const id = data.user?.id
    if (!id) return json({ error: "User created but no id returned" }, 500)

    // 4) Grant the requested role/modules and activate the account — only
    //    reachable behind the admin check above. Service-role client bypasses
    //    RLS. Profiles are created inactive (migration 0015) so that an
    //    uninvited public signup never passes is_active_staff().
    const { error: grantErr } = await admin
      .from("profiles")
      .update({ role, modules: Array.isArray(modules) ? modules : [], active: true })
      .eq("id", id)
    if (grantErr) {
      // Don't leave a half-provisioned login behind.
      await admin.auth.admin.deleteUser(id)
      return json({ error: `Could not apply role: ${grantErr.message}` }, 500)
    }

    return json({ ok: true, id })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
