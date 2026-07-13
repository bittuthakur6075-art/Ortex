// Edge Function: orty-live-token
//
// Mints a short-lived, single-use EPHEMERAL token for the Gemini Live API so the
// website's voice assistant ("Live Orty") can open the realtime WebSocket from
// the browser WITHOUT ever seeing the real Gemini API key. The key stays here as
// a Supabase secret (GEMINI_API_KEY).
//
// Public: called by anonymous website visitors. The token is single-use and
// expires in minutes, so exposure is minimal. Free-tier Live quota applies.
//
// Deploy:
//   supabase functions deploy orty-live-token
//   (uses the same GEMINI_API_KEY secret as orty-chat / product-copywriter)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) return json({ error: "Live assistant is not configured." }, 500)

  try {
    const now = Date.now()
    // The visitor must START a session within 2 minutes; the session itself may
    // run up to 30 minutes before the token fully expires.
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
      console.error("token mint failed", r.status, JSON.stringify(data).slice(0, 300))
      return json({ error: "Could not start the voice assistant." }, 502)
    }

    // data.name is "auth_tokens/xxxxx" — the ephemeral token the client uses.
    return json({ token: data.name, expiresAt: body.expireTime })
  } catch (err) {
    console.error("orty-live-token error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
