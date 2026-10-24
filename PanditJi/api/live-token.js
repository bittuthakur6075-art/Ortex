// Mints a short-lived, single-use EPHEMERAL token for the Gemini Live API, so
// the browser opens the realtime voice + camera session without ever seeing
// GEMINI_API_KEY. The token opens only LIVE_MODEL (fieldMask "model" locks the
// model alone; the page still sends its own prompt, voice and tools).
// A long pooja reconnects every few minutes with session resumption, and each
// reconnect asks for a new token, so the per-IP limit allows for that.
import { clientIp, foreignOrigin, overLimit } from "../server/limit.js"

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live"
const PER_IP_PER_HOUR = 40
const PER_DAY = 2000
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

// Lets the live room say up front when the key is missing, instead of after "Join".
export function GET() {
  return json({ configured: Boolean(process.env.GEMINI_API_KEY) })
}

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return json({ error: "Pandit Ji is not configured yet." }, 500)
  if (foreignOrigin(request)) return json({ error: "Not allowed." }, 403)
  if (overLimit(`live:${clientIp(request)}`, PER_IP_PER_HOUR, 60 * 60 * 1000) || overLimit("live:all", PER_DAY, 24 * 60 * 60 * 1000)) {
    return json({ error: "Pandit Ji is very busy right now. Please try again in a few minutes." }, 429)
  }

  const now = Date.now()
  const body = {
    uses: 1,
    newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
    expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
    bidiGenerateContentSetup: { model: `models/${LIVE_MODEL}` },
    fieldMask: "model",
  }
  try {
    // Key in a header, not the query string, so it never lands in a URL log.
    const r = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok || !data?.name) {
      console.error("token mint failed", r.status, JSON.stringify(data).slice(0, 300))
      return json({ error: "Could not connect to Pandit Ji." }, 502)
    }
    return json({ token: data.name, model: LIVE_MODEL })
  } catch (err) {
    console.error("live-token error", err)
    return json({ error: "Something went wrong." }, 500)
  }
}
