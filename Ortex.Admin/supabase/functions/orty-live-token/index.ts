import { cors, json } from "../_shared/http.ts"
import { callerHasModule, clientIp, liveLockFor, verifyTurnstile, withinLimit } from "../_shared/guard.ts"
// Edge Function: orty-live-token
//
// Mints a short-lived, single-use EPHEMERAL token for the Gemini Live API so the
// website's voice assistant (Anu, "Live Orty" in code) can open the realtime
// WebSocket from the browser WITHOUT ever seeing the real Gemini API key. The
// key stays here as a Supabase secret (GEMINI_API_KEY). Also used by the
// console's Call agent test call (pages/telecaller/useLiveCall.js). Staff Anu
// (console and phone) uses anu-staff-token only; Anu in Team chat uses no
// language model and no token.
//
// Public: called by anonymous website visitors. The token is single-use,
// expires in minutes and is locked to one model (`liveLockFor` in _shared/guard.ts:
// the body's `model` if it is on the allow-list, else LIVE_LOCK's), so exposure is minimal.
// Free-tier Live quota applies.
//
// Deploy:
//   supabase functions deploy orty-live-token
//   (uses the same GEMINI_API_KEY secret as product-copywriter; optional
//   TURNSTILE_SECRET switches on the Cloudflare Turnstile check below)

// Where a Turnstile token may have been solved: both websites, and a dev server.
const SITE_HOSTS = ["bizgift.ortexindustries.in", "ortexindustries.in", "www.ortexindustries.in", "localhost"]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) return json({ error: "Live assistant is not configured." }, 500)

  // Public, so bounded: a visitor gets a handful of sessions (6 per 10 minutes,
  // 20 a day per IP), and the whole site a daily ceiling, so nobody can script
  // away the shared Gemini quota. Staff testing the Call agent from the console
  // (signed in, with the telecaller module) draw on their own pool, so a public
  // flood cannot lock the console out.
  //
  // With TURNSTILE_SECRET set, a visitor must also send a Cloudflare Turnstile
  // token (body.turnstile) from one of our sites: a refused token is "busy", and
  // a missing one (script blocked) or an unreachable Cloudflare falls back to 2
  // tokens per IP per 10 minutes. Without the secret the check is skipped.
  const ip = clientIp(req)
  const busy = () => json({ error: "The voice assistant is busy right now. Please try again in a few minutes." }, 429)
  const payload = await req.json().catch(() => ({}))
  // A visitor's request carries the anon key; only a signed-in session is worth
  // the extra round trip to check for staff access.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const staff = Boolean(bearer) && bearer !== (Deno.env.get("SUPABASE_ANON_KEY") ?? "") && (await callerHasModule(req, "telecaller"))
  if (staff) {
    if (!(await withinLimit(`orty-live:staff:${ip}`, 30, 600)) || !(await withinLimit("orty-live:staff", 300, 86400))) return busy()
  } else {
    if (Deno.env.get("TURNSTILE_SECRET")) {
      const check = await verifyTurnstile(payload?.turnstile, ip, SITE_HOSTS)
      if (check === "fail") return busy()
      if (check === "skip" && !(await withinLimit(`orty-live:unverified:${ip}`, 2, 600))) return busy()
    }
    if (
      !(await withinLimit(`orty-live:ip:${ip}`, 6, 600)) ||
      !(await withinLimit(`orty-live:ipday:${ip}`, 20, 86400)) ||
      !(await withinLimit("orty-live:all", 400, 86400))
    ) {
      return busy()
    }
  }

  try {
    const asked = payload?.model
    const now = Date.now()
    // The visitor must START a session within 2 minutes; the session itself may
    // run up to 12 minutes before the token expires. The server's goAway ends a
    // Live connection at about 10 minutes anyway, and a short life makes a token
    // copied out of the browser worth little.
    const body = {
      uses: 1,
      newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
      expireTime: new Date(now + 12 * 60 * 1000).toISOString(),
      ...liveLockFor(asked),
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
