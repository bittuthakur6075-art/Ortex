// LinkedIn Company Page publishing, shared by `social-accounts` (connect,
// status) and `social-publish` (posting).
//
// Needs the app's "Community Management API" product (a vetted LinkedIn
// product; see docs/guides/LINKEDIN_SETUP.md). The token comes from an admin of
// the Company Page clicking "Connect LinkedIn": access tokens last 60 days, the
// refresh token a year from that click (renewing does NOT extend it), after
// which the admin connects again. Tokens live in `social_connections`
// (migration 0037), readable only with the service role.
//
// Every REST call carries `Linkedin-Version: YYYYMM` and
// `X-Restli-Protocol-Version: 2.0.0`. A version is supported for about a year;
// LINKEDIN_API_VERSION overrides the default when it ages out.

import type { Db } from "./auth.ts"

export const LI_VERSION = Deno.env.get("LINKEDIN_API_VERSION") || "202608"
export const LI_SCOPES = Deno.env.get("LINKEDIN_SCOPES") || "w_organization_social r_organization_social rw_organization_admin"
export const LI_MAX_COMMENTARY = 3000

const OAUTH = "https://www.linkedin.com/oauth/v2"
const REST = "https://api.linkedin.com/rest"

export type Connection = {
  platform: string
  access_token: string
  access_expires_at: string
  refresh_token: string | null
  refresh_expires_at: string | null
  account_urn: string
  account_name: string | null
}

export function liConfigured() {
  return Boolean(Deno.env.get("LINKEDIN_CLIENT_ID") && Deno.env.get("LINKEDIN_CLIENT_SECRET"))
}

/** The callback LinkedIn redirects to; must be listed in the app's Auth tab exactly. */
export function redirectUri() {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-accounts`
}

function restHeaders(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": LI_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  }
}

async function liError(res: Response, what: string) {
  const body = await res.text().catch(() => "")
  let detail = body.slice(0, 300)
  try {
    const j = JSON.parse(body)
    detail = j.message || j.error_description || j.error || detail
  } catch { /* not JSON */ }
  if (res.status === 401) return new Error(`LinkedIn refused the connection (${detail}). Reconnect LinkedIn.`)
  if (res.status === 403) return new Error(`LinkedIn denied ${what}: ${detail}. The connected person must be an admin of the Company Page, and the app needs the Community Management API.`)
  return new Error(`LinkedIn ${what} failed (${res.status}): ${detail}`)
}

// ---- OAuth --------------------------------------------------------------------

export type Tokens = {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: Deno.env.get("LINKEDIN_CLIENT_ID")!,
      client_secret: Deno.env.get("LINKEDIN_CLIENT_SECRET")!,
    }),
  })
  if (!res.ok) throw await liError(res, "sign-in")
  return await res.json()
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() })

const refreshTokens = (refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken })

export function authorizeUrl(state: string) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: Deno.env.get("LINKEDIN_CLIENT_ID")!,
    redirect_uri: redirectUri(),
    state,
    scope: LI_SCOPES,
  })
  return `${OAUTH}/authorization?${q}`
}

const inSeconds = (s: number | undefined) => (s ? new Date(Date.now() + s * 1000).toISOString() : null)

/** Row fields for freshly issued tokens. A refresh keeps the refresh token's own expiry. */
export function tokenFields(t: Tokens, previous?: Connection | null) {
  return {
    access_token: t.access_token,
    access_expires_at: inSeconds(t.expires_in)!,
    refresh_token: t.refresh_token || previous?.refresh_token || null,
    refresh_expires_at: inSeconds(t.refresh_token_expires_in) || previous?.refresh_expires_at || null,
    scope: t.scope || null,
    updated_at: new Date().toISOString(),
  }
}

// ---- which page -----------------------------------------------------------------

/** Organisations the signed-in member administers, as urn:li:organization:<id>. */
export async function adminOrganizations(token: string): Promise<string[]> {
  const q = new URLSearchParams({ q: "roleAssignee", role: "ADMINISTRATOR", state: "APPROVED", count: "50" })
  const res = await fetch(`${REST}/organizationAcls?${q}`, { headers: restHeaders(token) })
  if (!res.ok) throw await liError(res, "reading your Company Pages")
  const data = await res.json()
  return (data?.elements || [])
    .map((e: Record<string, string>) => e.organization || e.organizationTarget)
    .filter((u: string) => typeof u === "string" && u.startsWith("urn:li:organization:"))
}

export async function organizationName(token: string, urn: string): Promise<string | null> {
  const id = urn.split(":").pop()
  try {
    const res = await fetch(`${REST}/organizations/${id}`, { headers: restHeaders(token) })
    if (!res.ok) return null
    const data = await res.json()
    return data?.localizedName || null
  } catch {
    return null
  }
}

// ---- the stored connection ----------------------------------------------------------

const DAY = 86_400_000
/** Renew the access token once it has less than this left. */
const RENEW_WITHIN_MS = 10 * DAY

export async function loadConnection(db: Db): Promise<Connection | null> {
  const { data, error } = await db.from("social_connections").select("*").eq("platform", "linkedin").maybeSingle()
  if (error) throw new Error(`Could not read the LinkedIn connection: ${error.message}`)
  return data as Connection | null
}

/**
 * The connection with a usable access token, renewed first when it is close to
 * expiry. Throws a sentence a person can act on when it cannot be used.
 */
export async function usableConnection(db: Db): Promise<Connection> {
  const conn = await loadConnection(db)
  if (!conn) throw new Error("LinkedIn is not connected. An admin needs to click Connect LinkedIn on the Social page.")
  const now = Date.now()
  const accessLeft = new Date(conn.access_expires_at).getTime() - now
  if (accessLeft > RENEW_WITHIN_MS) return conn

  const refreshOk = conn.refresh_token && (!conn.refresh_expires_at || new Date(conn.refresh_expires_at).getTime() > now)
  if (!refreshOk) {
    if (accessLeft > 0) return conn // still valid for now; the page warns about the reconnect
    throw new Error("The LinkedIn connection has expired. An admin needs to click Connect LinkedIn again.")
  }
  const fresh = await refreshTokens(conn.refresh_token!)
  const patch = tokenFields(fresh, conn)
  const { error } = await db.from("social_connections").update(patch).eq("platform", "linkedin")
  if (error) console.error("linkedin token save failed", error.message)
  return { ...conn, ...patch }
}

// ---- text ---------------------------------------------------------------------------

// LinkedIn's "little" text format reserves these; each must be backslash-escaped
// or the post is rejected or garbled.
const RESERVED = /[|{}@[\]()<>#\\*_~]/g
export const escapeLittle = (s: string) => s.replace(RESERVED, (c) => `\\${c}`)

const hashtagTemplate = (tag: string) => `{hashtag|\\#|${escapeLittle(tag)}}`

/**
 * Caption + hashtags as LinkedIn commentary: all text escaped, and every
 * hashtag (written inline in the caption or in the hashtag list) turned into a
 * real, clickable LinkedIn hashtag.
 */
export function linkedInCommentary(caption: string, hashtags: string[]): string {
  const body = String(caption || "")
    .trim()
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) => (/^#[\p{L}\p{N}_]+$/u.test(part) ? hashtagTemplate(part.slice(1)) : escapeLittle(part)))
    .join("")
  const tags = hashtags.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean).map(hashtagTemplate).join(" ")
  return [body, tags].filter(Boolean).join("\n\n")
}

// ---- posting ------------------------------------------------------------------------

async function uploadImage(conn: Connection, imageUrl: string): Promise<string> {
  const img = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) })
  if (!img.ok) throw new Error(`Could not read the creative (${img.status}).`)
  const bytes = new Uint8Array(await img.arrayBuffer())
  const type = (img.headers.get("content-type") || "image/jpeg").split(";")[0].trim()

  const init = await fetch(`${REST}/images?action=initializeUpload`, {
    method: "POST",
    headers: restHeaders(conn.access_token),
    body: JSON.stringify({ initializeUploadRequest: { owner: conn.account_urn } }),
  })
  if (!init.ok) throw await liError(init, "preparing the image upload")
  const { value } = await init.json()
  if (!value?.uploadUrl || !value?.image) throw new Error("LinkedIn did not return an image upload address.")

  const put = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": type },
    body: bytes,
  })
  if (!put.ok) throw await liError(put, "uploading the image")

  // Give LinkedIn a moment to process it; a post naming an image that is still
  // WAITING_UPLOAD can be refused.
  for (let i = 0; i < 8; i++) {
    const check = await fetch(`${REST}/images/${encodeURIComponent(value.image)}`, { headers: restHeaders(conn.access_token, false) })
    if (check.ok) {
      const status = (await check.json())?.status
      if (status === "AVAILABLE") break
      if (status === "PROCESSING_FAILED") throw new Error("LinkedIn could not process the image.")
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return String(value.image)
}

/** One image post on the Company Page. Returns the post URN and its public link. */
export async function publishLinkedIn(conn: Connection, imageUrl: string, commentary: string, altText: string) {
  const image = await uploadImage(conn, imageUrl)
  const res = await fetch(`${REST}/posts`, {
    method: "POST",
    headers: restHeaders(conn.access_token),
    body: JSON.stringify({
      author: conn.account_urn,
      commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: image, altText: altText.slice(0, 120) } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!res.ok) throw await liError(res, "publishing the post")
  const id = res.headers.get("x-restli-id") || ""
  if (!id) throw new Error("LinkedIn did not return a post id.")
  return { id, permalink: `https://www.linkedin.com/feed/update/${id}/` }
}
