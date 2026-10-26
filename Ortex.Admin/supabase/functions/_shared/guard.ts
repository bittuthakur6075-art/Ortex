// Abuse guards shared by the Edge Functions (2026-09-26 security audit):
// a constant-time secret compare, the caller's IP, a rate limit backed by
// public.rate_limit_hit (migration 0050) and a module check on the caller's own
// session. Import from here, never redefine.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/** Constant-time compare; an empty secret never matches. */
export function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (!ab.length || ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

/** The caller's IP as Supabase's edge sees it. */
export function clientIp(req: Request): string {
  // Supabase sits behind Cloudflare, which overwrites cf-connecting-ip and APPENDS the real IP to x-forwarded-for, so only those two are unforgeable (a client's own x-forwarded-for value stays on the left).
  return req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",").pop()!.trim() || "unknown"
}

/**
 * Spread into a Gemini Live `auth_tokens` body: the token opens only this model
 * (the `LIVE_MODEL` of every client). `fieldMask: "model"` locks the model alone,
 * so each client still sends its own system prompt, tools, speech and session
 * settings; a constraint WITHOUT a field mask would lock every config field and
 * silently drop them. Changing the model means changing it here too.
 */
export const LIVE_LOCK = {
  bidiGenerateContentSetup: { model: "models/gemini-3.1-flash-live-preview" },
  fieldMask: "model",
}

// Live models a client may ask orty-live-token for, so one client can move to
// a new model without breaking the ones still built against the old: the
// website asks for gemini-3.8-live, the console's Call agent test call sends
// nothing and keeps LIVE_LOCK's model. Anything else falls back to LIVE_LOCK.
const LIVE_MODELS = new Set(["gemini-3.1-flash-live-preview", "gemini-3.8-live"])

/** LIVE_LOCK for the model a client asked for, if it is on the allow-list. */
export function liveLockFor(model: unknown) {
  const name = String(model ?? "").replace(/^models\//, "")
  return LIVE_MODELS.has(name) ? { ...LIVE_LOCK, bidiGenerateContentSetup: { model: `models/${name}` } } : LIVE_LOCK
}

/**
 * One hit against `key`; false once it has had more than `max` hits in the
 * current `windowSec` window. Fails OPEN (true) when the limiter itself is
 * unavailable, so a missing migration can never take a public page down.
 */
export async function withinLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !service) return true
  try {
    const { data, error } = await createClient(url, service).rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_sec: windowSec,
    })
    if (error) {
      console.error("rate limit unavailable", error.message)
      return true
    }
    return data !== false
  } catch (e) {
    console.error("rate limit unavailable", e)
    return true
  }
}

/**
 * Cloudflare Turnstile check of a browser token. "ok" passed, "fail" was
 * answered and refused (bad, reused or foreign token), "skip" means there was
 * nothing to verify: no TURNSTILE_SECRET set, no token sent, or Cloudflare did
 * not answer within 3 s. A caller decides what a skip costs.
 */
export async function verifyTurnstile(token: unknown, ip: string, hostnames: string[]): Promise<"ok" | "fail" | "skip"> {
  const secret = Deno.env.get("TURNSTILE_SECRET")
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return "skip"
  try {
    const form = new FormData()
    form.append("secret", secret)
    form.append("response", token)
    if (ip !== "unknown") form.append("remoteip", ip)
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(3000),
    })
    if (!r.ok) return "skip"
    const data = await r.json()
    return data?.success === true && hostnames.includes(String(data.hostname || "")) ? "ok" : "fail"
  } catch (e) {
    console.error("turnstile unavailable", e)
    return "skip"
  }
}

/** Does the CALLER (their own session, not the service role) hold `module`? */
/** Per-user quota for paid or metered work (Gemini, Workers AI): a 10 minute
 *  burst cap and a daily cap, on separate keys so the two windows never share
 *  a counter. Any signed-in staff member could otherwise loop a function and
 *  spend the quota the website assistant also runs on. */
export async function withinUserQuota(feature: string, userId: string, burst: number, daily: number): Promise<boolean> {
  return (await withinLimit(`${feature}:user:${userId}:10m`, burst, 600)) &&
    (await withinLimit(`${feature}:user:${userId}:day`, daily, 86400))
}

export const QUOTA_MESSAGE = "You have used this a lot just now. Please wait a few minutes and try again."

export async function callerHasModule(req: Request, module: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const client = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
  const { data, error } = await client.rpc("has_module_access", { p_module: module })
  return !error && data === true
}

/**
 * A request body with every string cut to `max` characters and every list to
 * 100 items, one level deep: what reaches an LLM prompt is bounded however big
 * the request was.
 */
// deno-lint-ignore no-explicit-any
export function clipStrings(body: any, max = 500): Record<string, any> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {}
  // deno-lint-ignore no-explicit-any
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") out[k] = v.slice(0, max)
    else if (Array.isArray(v)) out[k] = v.slice(0, 100).map((x) => (typeof x === "string" ? x.slice(0, max) : x))
    else out[k] = v
  }
  return out
}
