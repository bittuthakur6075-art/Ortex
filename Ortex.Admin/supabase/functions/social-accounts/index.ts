// Edge Function: social-accounts
//
// Which social accounts the Social page can publish to, and connecting LinkedIn.
//
//   POST { action: "status" }      any active staff: what is connected (never a token)
//   POST { action: "connect" }     admin: the LinkedIn sign-in URL to send the browser to
//   POST { action: "disconnect" }  admin: forget the LinkedIn tokens
//   POST { action: "instagram-connect", token }  admin: keep a pasted Instagram token
//   POST { action: "instagram-disconnect" }       admin: forget it
//   GET  ?code=…&state=…           LinkedIn's redirect after sign-in (the OAuth callback)
//
// The callback arrives from LinkedIn with no Supabase session, so this function
// is deployed with --no-verify-jwt; every POST checks the caller itself, and the
// callback trusts only a `state` it signed (HMAC with the LinkedIn client secret)
// naming the admin who started it, expiring after 10 minutes, and carrying the
// console address to return to, which must be CONSOLE_URL or a localhost dev
// server. Tokens are written with the service role to `social_connections`
// (migration 0037), which no browser session can read.
//
// Deploy:
//   supabase functions deploy social-accounts --no-verify-jwt
//   supabase secrets set LINKEDIN_CLIENT_ID=… LINKEDIN_CLIENT_SECRET=…
//   (optional) LINKEDIN_ORG_ID=<number>   when the admin runs several Company Pages
//   (optional) LINKEDIN_API_VERSION=YYYYMM, LINKEDIN_SCOPES="…"
//   and add the redirect URL https://<ref>.supabase.co/functions/v1/social-accounts
//   in the LinkedIn app's Auth tab.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { loadIgConnection, saveToken } from "../_shared/instagram.ts"
import {
  adminOrganizations, authorizeUrl, exchangeCode, liConfigured, loadConnection, organizationName, redirectUri, tokenFields,
} from "../_shared/linkedin.ts"

const ADMINS = ["admin", "super_admin"]
const ALL_STAFF = ["super_admin", "admin", "accounts", "sales", "staff"]
const STATE_TTL_MS = 10 * 60_000

// ---- signed state ---------------------------------------------------------------

const enc = new TextEncoder()
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(Deno.env.get("LINKEDIN_CLIENT_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)))
}

type State = { u: string; r: string; e: number; n: string }

async function signState(s: State) {
  const body = b64url(enc.encode(JSON.stringify(s)))
  return `${body}.${b64url(await hmac(body))}`
}

async function readState(raw: string): Promise<State | null> {
  const [body, sig] = raw.split(".")
  if (!body || !sig) return null
  const expected = b64url(await hmac(body))
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as State
    return s.e > Date.now() ? s : null
  } catch {
    return null
  }
}

// ---- where to send the browser back -----------------------------------------------

function consoleOrigin(): string | null {
  try {
    return new URL(Deno.env.get("CONSOLE_URL") || "").origin
  } catch {
    return null
  }
}

/** The console origin to return to: the production console or a local dev server. */
function allowedReturn(origin: unknown): string | null {
  if (typeof origin !== "string") return null
  try {
    const u = new URL(origin)
    if (u.origin === consoleOrigin()) return u.origin
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && /^https?:$/.test(u.protocol)) return u.origin
  } catch { /* not a URL */ }
  return null
}

function backToConsole(origin: string | null, params: Record<string, string>) {
  const base = origin || consoleOrigin()
  if (!base) return json({ ...params, note: "Close this tab and go back to the console." })
  return new Response(null, { status: 302, headers: { Location: `${base}/social?${new URLSearchParams(params)}` } })
}

// ---- the callback -----------------------------------------------------------------

async function callback(url: URL) {
  const state = await readState(url.searchParams.get("state") || "")
  const origin = state ? allowedReturn(state.r) : null
  const fail = (reason: string) => backToConsole(origin, { linkedin: "error", reason: reason.slice(0, 300) })

  if (url.searchParams.get("error")) {
    const why = url.searchParams.get("error_description") || url.searchParams.get("error") || "cancelled"
    return fail(why === "user_cancelled_authorize" || why === "user_cancelled_login" ? "Sign-in was cancelled." : why)
  }
  if (!state) return fail("The sign-in link expired or was not started from the console. Try Connect LinkedIn again.")
  const code = url.searchParams.get("code")
  if (!code) return fail("LinkedIn did not return a sign-in code.")

  try {
    const tokens = await exchangeCode(code)

    // Which Company Page: the one this person administers, or LINKEDIN_ORG_ID
    // when they run several.
    const wanted = (Deno.env.get("LINKEDIN_ORG_ID") || "").trim()
    let orgs: string[] = []
    try {
      orgs = await adminOrganizations(tokens.access_token)
    } catch (e) {
      if (!wanted) throw e
    }
    let urn = ""
    if (wanted) {
      urn = `urn:li:organization:${wanted.replace(/^urn:li:organization:/, "")}`
      if (orgs.length && !orgs.includes(urn)) {
        return fail("The LinkedIn account you signed in with is not an admin of the Ortex Company Page. Sign in with a page admin.")
      }
    } else if (orgs.length === 1) {
      urn = orgs[0]
    } else if (orgs.length === 0) {
      return fail("That LinkedIn account is not an admin of any Company Page. Sign in with an admin of the Ortex page.")
    } else {
      return fail("That LinkedIn account runs several Company Pages. Set LINKEDIN_ORG_ID to the Ortex page's number and try again.")
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const { error } = await db.from("social_connections").upsert({
      platform: "linkedin",
      ...tokenFields(tokens),
      account_urn: urn,
      account_name: await organizationName(tokens.access_token, urn),
      connected_by: state.u,
      connected_at: new Date().toISOString(),
    })
    if (error) throw new Error(`Could not save the connection: ${error.message}`)
    return backToConsole(origin, { linkedin: "connected" })
  } catch (e) {
    console.error("social-accounts callback", e)
    return fail(e instanceof Error ? e.message : "LinkedIn sign-in failed.")
  }
}

// ---- entry ----------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  const url = new URL(req.url)

  try {
    if (req.method === "GET") {
      if (!liConfigured()) return json({ error: "LinkedIn is not configured." }, 500)
      return await callback(url)
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || "status")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!service) return json({ error: "Not configured (missing service role)." }, 500)
    const db = createClient(Deno.env.get("SUPABASE_URL")!, service)

    if (action === "status") {
      const staff = await requireStaff(req, ALL_STAFF)
      if (staff instanceof Response) return staff
      const conn = liConfigured() ? await loadConnection(db).catch(() => null) : null
      const now = Date.now()
      const accessOk = conn ? new Date(conn.access_expires_at).getTime() > now : false
      const refreshUntil = conn?.refresh_expires_at || null
      const renewable = conn?.refresh_token && refreshUntil ? new Date(refreshUntil).getTime() > now : false
      const ig = await loadIgConnection(db).catch(() => null)
      const igLive = Boolean(ig) && new Date(ig!.access_expires_at).getTime() > now
      const viaPage = Boolean(Deno.env.get("META_ACCESS_TOKEN") && Deno.env.get("META_IG_USER_ID"))
      return json({
        meta: {
          configured: Boolean(Deno.env.get("META_ACCESS_TOKEN")),
          // Kept as the one flag both apps read: postable, by either route.
          instagram: igLive || viaPage,
          facebook: Boolean(Deno.env.get("META_ACCESS_TOKEN") && Deno.env.get("META_PAGE_ID")),
        },
        instagram: {
          connected: igLive || viaPage,
          via: igLive ? "instagram" : viaPage ? "facebook" : null,
          expired: Boolean(ig) && !igLive,
          username: ig?.account_name || null,
          // Renewed weekly by the publish sweep; this is the date it would lapse
          // if the sweep stopped running.
          renewsBy: ig?.access_expires_at || null,
        },
        linkedin: {
          configured: liConfigured(),
          connected: Boolean(conn) && (accessOk || Boolean(renewable)),
          expired: Boolean(conn) && !accessOk && !renewable,
          name: conn?.account_name || null,
          urn: conn?.account_urn || null,
          // The date an admin must click Connect again: when the refresh token
          // ends, or, with no refresh token, when the access token does.
          reconnectBy: conn ? (refreshUntil || conn.access_expires_at) : null,
          redirectUri: redirectUri(),
        },
      })
    }

    const admin = await requireStaff(req, ADMINS, "Only an admin can connect or disconnect social accounts.")
    if (admin instanceof Response) return admin

    if (action === "connect") {
      if (!liConfigured()) {
        return json({ error: "LinkedIn is not set up yet: LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are missing. See docs/guides/LINKEDIN_SETUP.md." }, 400)
      }
      const r = allowedReturn(body.returnTo)
      if (!r) return json({ error: "Connect LinkedIn from the console itself." }, 400)
      const state = await signState({ u: admin.userId, r, e: Date.now() + STATE_TTL_MS, n: crypto.randomUUID() })
      return json({ url: authorizeUrl(state) })
    }

    if (action === "disconnect") {
      const { error } = await db.from("social_connections").delete().eq("platform", "linkedin")
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    // Instagram on its own: an admin pastes the long-lived token from the Meta
    // app's "Generate token". It is checked against Instagram before it is kept.
    if (action === "instagram-connect") {
      const who = await saveToken(db, String(body.token || ""), admin.userId)
      return json({ ok: true, username: who.username })
    }

    if (action === "instagram-disconnect") {
      const { error } = await db.from("social_connections").delete().eq("platform", "instagram")
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: `Unknown action ${action}` }, 400)
  } catch (err) {
    console.error("social-accounts error", err)
    return json({ error: err instanceof Error ? err.message : "Something went wrong." }, 500)
  }
})
