// Edge Function: admin-create-user
//
// Creates a new auth user (email + password + role + module access). Callable
// ONLY by a signed-in admin — the caller's JWT is checked against their profile
// role before the service-role key is used to create the user. Role/name/
// modules are passed as user_metadata; the DB signup trigger copies them into
// public.profiles.
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

    // 3) Create the user with the service-role key.
    const admin = createClient(url, service)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name ?? "", role, modules: Array.isArray(modules) ? modules : [] },
    })
    if (error) return json({ error: error.message }, 400)

    return json({ ok: true, id: data.user?.id })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
