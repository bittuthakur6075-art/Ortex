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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const authHeader = req.headers.get("Authorization") ?? ""

    // 1) Identify the caller and confirm they are an active admin.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await caller.auth.getUser()
    if (userErr || !userData.user) return json({ error: "Not authenticated" }, 401)

    const { data: prof } = await caller
      .from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle()
    if (!prof || prof.role !== "admin" || !prof.active) return json({ error: "Admin access required" }, 403)

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

    // 4) Grant the requested role/modules — only reachable behind the admin
    //    check above. Service-role client bypasses RLS.
    const { error: grantErr } = await admin
      .from("profiles")
      .update({ role, modules: Array.isArray(modules) ? modules : [] })
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
