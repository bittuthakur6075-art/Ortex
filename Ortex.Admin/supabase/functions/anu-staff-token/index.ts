// Edge Function: anu-staff-token
//
// Mints a short-lived, single-use Gemini Live ephemeral token for ANU IN THE
// MOBILE APP, the team's own voice assistant. Same token shape as
// orty-live-token (the website's public Anu), but callable ONLY by a signed-in,
// active staff member, so the staff assistant's Live quota cannot be drained by
// anyone who finds the anon key in the website bundle.
//
// The token grants Gemini access and nothing else. Every Ortex record Anu reads
// or changes is fetched by the phone itself, under the user's own Supabase
// session and RLS; this function never touches business data.
//
// Deploy:
//   supabase functions deploy anu-staff-token
//   (uses the same GEMINI_API_KEY secret as orty-live-token)
//
// Until it is deployed, the app falls back to orty-live-token (see
// Ortex.Mobile/src/features/anu/useAnuSession.ts mintToken).

import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const staff = await requireStaff(req)
  if (staff instanceof Response) return staff

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) return json({ error: "Anu is not configured." }, 500)

  try {
    const now = Date.now()
    // A staff call starts the moment the token arrives and is usually a quick
    // question, but a long working session is allowed up to 30 minutes.
    const body = {
      uses: 1,
      newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok || !data?.name) {
      console.error("anu-staff-token mint failed", r.status, JSON.stringify(data).slice(0, 300))
      return json({ error: "Could not start Anu." }, 502)
    }
    return json({ token: data.name, expiresAt: body.expireTime })
  } catch (err) {
    console.error("anu-staff-token error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
