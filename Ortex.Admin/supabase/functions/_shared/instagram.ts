// Instagram on its own: "Instagram API with Instagram Login" (graph.instagram.com),
// which publishes to a Business or Creator account with NO Facebook Page.
// Shared by `social-accounts` (connect, status) and `social-publish`.
//
// The token is a long-lived Instagram user token, generated in the Meta app's
// dashboard (Instagram → API setup with Instagram login → Generate token) and
// pasted into the console once. It lasts 60 days; Meta allows a refresh once it
// is at least 24 hours old, and each refresh gives 60 more days, so the publish
// sweep renews it weekly and it never lapses while the sweep runs. It is stored
// in `social_connections` (migrations 0037 + 0041), service-role only.
//
// The Facebook-Page route (META_ACCESS_TOKEN + META_IG_USER_ID on
// graph.facebook.com, in social-publish) still works; this route wins when both
// are set, because it needs no Page.

import type { Db } from "./auth.ts"

const IG_VERSION = Deno.env.get("INSTAGRAM_API_VERSION") || "v25.0"
const IG = `https://graph.instagram.com/${IG_VERSION}`

const DAY = 86_400_000
const LIFETIME_MS = 60 * DAY
/** Renew once the token is a week old (so it always has 53+ days left). */
const RENEW_WHEN_LEFT_MS = 53 * DAY

export type IgConnection = {
  platform: string
  access_token: string
  access_expires_at: string
  account_urn: string // the Instagram professional account id (IG_ID) posts go to
  account_name: string | null // @username
}

async function igGet(path: string, params: Record<string, string>) {
  const res = await fetch(`${IG}/${path}?${new URLSearchParams(params)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) throw igError(data, res.status)
  return data
}

async function igPost(path: string, params: Record<string, string>) {
  const res = await fetch(`${IG}/${path}`, { method: "POST", body: new URLSearchParams(params) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) throw igError(data, res.status)
  return data
}

function igError(data: Record<string, unknown>, status: number) {
  const e = (data?.error || {}) as Record<string, unknown>
  const msg = String(e.error_user_msg || e.message || `Instagram API error (${status})`)
  if (e.code === 190 || /access token|session has expired|OAuth/i.test(msg)) {
    return new Error(`Instagram refused the token (${msg}). Generate a new one in the Meta app and paste it again.`)
  }
  return new Error(msg)
}

/** Check a pasted token and find the account it posts to. */
export async function inspectToken(token: string): Promise<{ id: string; username: string | null }> {
  // Instagram Login only issues tokens to professional (Business or Creator)
  // accounts, so a token that answers here belongs to one.
  const me = await igGet("me", { fields: "user_id,username", access_token: token })
  const id = String(me?.user_id || me?.id || "")
  if (!id) throw new Error("Instagram did not say which account this token belongs to.")
  return { id, username: me?.username ? String(me.username) : null }
}

/** Save a token as THE Instagram connection, replacing any earlier one. */
export async function saveToken(db: Db, token: string, connectedBy: string | null) {
  const clean = token.trim()
  if (clean.length < 50 || /\s/.test(clean)) throw new Error("That does not look like an Instagram access token.")
  const who = await inspectToken(clean)
  const now = new Date()
  const { error } = await db.from("social_connections").upsert({
    platform: "instagram",
    access_token: clean,
    // A dashboard token is issued for 60 days; counted from now, it errs early.
    access_expires_at: new Date(now.getTime() + LIFETIME_MS - DAY).toISOString(),
    refresh_token: null,
    refresh_expires_at: null,
    account_urn: who.id,
    account_name: who.username,
    scope: "instagram_business_basic,instagram_business_content_publish",
    connected_by: connectedBy,
    connected_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
  if (error) throw new Error(`Could not save the Instagram connection: ${error.message}`)
  return who
}

export async function loadIgConnection(db: Db): Promise<IgConnection | null> {
  const { data, error } = await db.from("social_connections").select("*").eq("platform", "instagram").maybeSingle()
  if (error) throw new Error(`Could not read the Instagram connection: ${error.message}`)
  if (data) return data as IgConnection
  // A token set as a function secret instead of pasted in the console.
  const envToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN")
  if (envToken) {
    await saveToken(db, envToken, null)
    return await loadIgConnection(db)
  }
  return null
}

/**
 * The connection with a usable token, renewed first when it is a week or more
 * old. Throws a sentence a person can act on when it cannot be used.
 */
export async function usableIgConnection(db: Db): Promise<IgConnection> {
  const conn = await loadIgConnection(db)
  if (!conn) throw new Error("Instagram is not connected. An admin needs to paste the token under Connect Instagram on the Social page.")
  const left = new Date(conn.access_expires_at).getTime() - Date.now()
  if (left <= 0) throw new Error("The Instagram token has expired. Generate a new one in the Meta app and paste it again.")
  if (left > RENEW_WHEN_LEFT_MS) return conn
  try {
    const fresh = await igGet("refresh_access_token", { grant_type: "ig_refresh_token", access_token: conn.access_token })
    const patch = {
      access_token: String(fresh.access_token),
      access_expires_at: new Date(Date.now() + (Number(fresh.expires_in) || LIFETIME_MS / 1000) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { error } = await db.from("social_connections").update(patch).eq("platform", "instagram")
    if (error) console.error("instagram token save failed", error.message)
    return { ...conn, ...patch }
  } catch (e) {
    // Too new to refresh, or a blip: the current token is still valid.
    console.error("instagram refresh skipped", e instanceof Error ? e.message : e)
    return conn
  }
}

/** One image post: container, wait until Instagram has fetched it, publish. */
export async function publishInstagramDirect(conn: IgConnection, imageUrl: string, caption: string) {
  const token = conn.access_token
  const container = await igPost(`${conn.account_urn}/media`, { image_url: imageUrl, caption, access_token: token })
  if (!container?.id) throw new Error("Instagram did not return a media container.")

  let status = ""
  for (let i = 0; i < 15; i++) {
    const check = await igGet(String(container.id), { fields: "status_code,status", access_token: token })
    status = String(check?.status_code || "")
    if (status === "FINISHED") break
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Instagram could not process the image (${status}): ${check?.status || "no detail"}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  if (status !== "FINISHED") throw new Error("Instagram is still processing the image. Try again in a minute.")

  const published = await igPost(`${conn.account_urn}/media_publish`, { creation_id: String(container.id), access_token: token })
  if (!published?.id) throw new Error("Instagram did not return a post id.")

  let permalink = ""
  try {
    const meta = await igGet(String(published.id), { fields: "permalink", access_token: token })
    permalink = String(meta?.permalink || "")
  } catch {
    /* the post is live; a missing permalink is cosmetic */
  }
  return { id: String(published.id), permalink }
}
