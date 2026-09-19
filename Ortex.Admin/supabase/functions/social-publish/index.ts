// Edge Function: social-publish
//
// Step 3 of the social pipeline, and the ONLY thing that talks to Meta. It holds
// the Page access token, which is why publishing cannot live in the browser.
//
// Two ways in:
//   a) An ADMIN (or the Super Admin) pressing Publish. Sales staff can research,
//      draft, and queue, but they cannot push to the company profile. This is
//      where that line is drawn, because the Meta token is here and nowhere else.
//   b) The scheduler (pg_cron) with { mode: "due" }, sweeping posts whose
//      scheduledFor has arrived. It proves itself with the `x-social-secret`
//      header (SOCIAL_CRON_SECRET) plus the public anon key as the bearer, so the
//      service-role key never has to sit in cron.job. The service-role key as the
//      bearer is still accepted for an existing job.
//
// NEVER TWICE (migration 0034). A post is CLAIMED before Meta is called: a
// conditional update to `publishing` that only succeeds while the row is still in
// the status it was read in, so a double-click, an overlapping sweep or a sweep
// racing an admin all end with one winner. Each platform's result is written the
// moment it lands, and a retry skips every platform that already has an id. A
// row stuck in `publishing` (a run killed mid-way) is turned into `failed` by the
// next sweep with a message asking a person to look first; it is never re-sent
// automatically, because Instagram may already have it.
//
// Deploy:
//   supabase functions deploy social-publish
//   supabase secrets set META_ACCESS_TOKEN=your-permanent-system-user-token
//   supabase secrets set META_IG_USER_ID=17841400000000000
//   supabase secrets set META_PAGE_ID=100000000000000
//   supabase secrets set SOCIAL_CRON_SECRET=<random string, also used in the cron job>
//   (optional) supabase secrets set META_GRAPH_VERSION=v25.0

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { requireStaff, type Db } from "../_shared/auth.ts"

// v21.0 expires on 21 January 2027 (Meta's version schedule); v25.0 runs to July 2028.
const GRAPH = Deno.env.get("META_GRAPH_VERSION") || "v25.0"
const api = (path: string) => `https://graph.facebook.com/${GRAPH}/${path}`

// Instagram's own limits, checked before anything is claimed or sent, so a
// post that cannot go out says why instead of failing half-way.
const IG_MAX_CAPTION = 2200
const IG_MAX_HASHTAGS = 30

// A sweep stops STARTING posts after this long, so it finishes well inside the
// ~150 s wall clock (one Instagram post can take a minute).
const SWEEP_BUDGET_MS = 75_000
// A claim older than this belongs to a run that was killed.
const STALE_CLAIM_MS = 10 * 60_000

type Post = Record<string, unknown>
type Row = { id: string; doc: Post }
type Result = { id?: string; permalink?: string; error?: string }

/** Caption + hashtags exactly as Meta receives them. Mirrors socialCaptionText. */
function captionText(doc: Post) {
  const tags = (Array.isArray(doc.hashtags) ? doc.hashtags : [])
    .filter(Boolean)
    .map((t) => `#${String(t).replace(/^#/, "")}`)
  return [String(doc.caption || "").trim(), tags.join(" ")].filter(Boolean).join("\n\n")
}

function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (!ab.length || ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

async function graph(path: string, params: Record<string, string>, method = "POST") {
  const token = Deno.env.get("META_ACCESS_TOKEN")!
  const form = new URLSearchParams({ ...params, access_token: token })
  const res = method === "GET"
    ? await fetch(`${api(path)}?${form}`)
    : await fetch(api(path), { method: "POST", body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) {
    // Meta's message is the actionable part ("The image is too large", "token
    // expired"). Surface it rather than a generic failure.
    const e = data?.error || {}
    throw new Error(e.error_user_msg || e.message || `Meta API error (${res.status})`)
  }
  return data
}

/** Instagram: create a media container, wait for it to finish, then publish. */
async function publishInstagram(igUserId: string, imageUrl: string, caption: string): Promise<Result> {
  const container = await graph(`${igUserId}/media`, { image_url: imageUrl, caption })
  if (!container?.id) throw new Error("Instagram did not return a media container.")

  // Meta fetches the image asynchronously; publishing before it is FINISHED
  // fails. Poll up to ~45 s.
  let status = ""
  for (let i = 0; i < 15; i++) {
    const check = await graph(`${container.id}`, { fields: "status_code,status" }, "GET")
    status = String(check?.status_code || "")
    if (status === "FINISHED") break
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Instagram could not process the image (${status}): ${check?.status || "no detail"}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  if (status !== "FINISHED") throw new Error("Instagram is still processing the image. Try again in a minute.")

  const published = await graph(`${igUserId}/media_publish`, { creation_id: String(container.id) })
  if (!published?.id) throw new Error("Instagram did not return a post id.")

  let permalink = ""
  try {
    const meta = await graph(`${published.id}`, { fields: "permalink" }, "GET")
    permalink = String(meta?.permalink || "")
  } catch {
    /* the post is live; a missing permalink is cosmetic */
  }
  return { id: String(published.id), permalink }
}

/** Facebook Page: a photo post carries the caption in `message`. */
async function publishFacebook(pageId: string, imageUrl: string, caption: string): Promise<Result> {
  const res = await graph(`${pageId}/photos`, { url: imageUrl, message: caption, published: "true" })
  const id = String(res?.post_id || res?.id || "")
  if (!id) throw new Error("Facebook did not return a post id.")
  return { id, permalink: res?.post_id ? `https://www.facebook.com/${res.post_id}` : "" }
}

/**
 * Everything that would make Meta refuse the post, found BEFORE claiming it.
 * Returns the sentence to show, or "" when the post can go.
 */
async function problemWith(doc: Post): Promise<string> {
  const platforms = Array.isArray(doc.platforms) ? doc.platforms as string[] : []
  const image = String(doc.image || "")
  const caption = captionText(doc)
  if (!image) return "This post has no creative yet."
  if (!caption) return "This post has no caption yet."
  if (!platforms.length) return "No platform selected for this post."

  if (platforms.includes("instagram")) {
    if (caption.length > IG_MAX_CAPTION) {
      return `The caption and hashtags are ${caption.length} characters; Instagram allows ${IG_MAX_CAPTION}.`
    }
    const tags = (Array.isArray(doc.hashtags) ? doc.hashtags : []).filter(Boolean).length
    if (tags > IG_MAX_HASHTAGS) return `${tags} hashtags; Instagram allows ${IG_MAX_HASHTAGS}.`
    // Instagram's publishing API takes JPEG only. Ask the storage what it is.
    try {
      const head = await fetch(image, { method: "HEAD", signal: AbortSignal.timeout(10_000) })
      if (!head.ok) return "The creative's image could not be reached. Upload or generate it again."
      const type = (head.headers.get("content-type") || "").split(";")[0].trim()
      if (type && type !== "image/jpeg") {
        return `Instagram only accepts JPEG images and this creative is ${type}. Upload or generate it again.`
      }
    } catch {
      return "The creative's image could not be reached. Upload or generate it again."
    }
  }
  return ""
}

/**
 * Take the row for this caller, or return null when someone else already has
 * it. The WHERE on the status is the whole point: two callers that read the same
 * `scheduled` row both issue this update, and Postgres lets exactly one match.
 */
async function claim(db: Db, row: Row, expected: string): Promise<Post | null> {
  const doc = { ...row.doc, status: "publishing", publishingSince: new Date().toISOString(), error: "" }
  const { data, error } = await db
    .from("social").update({ doc })
    .eq("id", row.id).eq("doc->>status", expected)
    .select("id")
  if (error) throw new Error(`Could not claim the post: ${error.message}`)
  return data?.length ? doc : null
}

async function writeDoc(db: Db, id: string, doc: Post) {
  const { error } = await db.from("social").update({ doc }).eq("id", id)
  if (error) console.error("social-publish write failed", id, error.message)
}

/** Publish a CLAIMED row across its platforms, saving each result as it lands. */
async function publishClaimed(db: Db, id: string, claimed: Post) {
  const igUserId = Deno.env.get("META_IG_USER_ID")
  const pageId = Deno.env.get("META_PAGE_ID")
  const platforms = (Array.isArray(claimed.platforms) ? claimed.platforms : []) as string[]
  const caption = captionText(claimed)
  const image = String(claimed.image || "")

  let doc: Post = { ...claimed, results: { ...(claimed.results as Record<string, Result>) } }
  const results = doc.results as Record<string, Result>
  const errors: string[] = []

  for (const p of platforms) {
    // Never re-post a platform that already succeeded.
    if (results[p]?.id) continue
    try {
      if (p === "instagram") {
        if (!igUserId) throw new Error("Instagram is not configured (missing META_IG_USER_ID).")
        results[p] = await publishInstagram(igUserId, image, caption)
      } else if (p === "facebook") {
        if (!pageId) throw new Error("Facebook is not configured (missing META_PAGE_ID).")
        results[p] = await publishFacebook(pageId, image, caption)
      } else {
        throw new Error(`Publishing to ${p} is not supported yet.`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results[p] = { error: msg }
      errors.push(`${p}: ${msg}`)
    }
    // Saved after EVERY platform, so a run killed after Instagram accepted the
    // post still leaves a record that it did.
    doc = { ...doc, results: { ...results } }
    await writeDoc(db, id, doc)
  }

  const anyLive = platforms.some((p) => results[p]?.id)
  const allLive = platforms.every((p) => results[p]?.id)
  doc = {
    ...doc,
    // Partial success stays 'failed' so it stays visible and retryable; the
    // platforms that did land are recorded and will be skipped on retry.
    status: allLive ? "published" : "failed",
    publishedAt: anyLive ? new Date().toISOString() : doc.publishedAt || null,
    publishingSince: null,
    error: errors.join(" | "),
  }
  await writeDoc(db, id, doc)
  if (!allLive) throw new Error(errors.join(" | ") || "Publishing failed.")
  return results
}

/**
 * Proof that a post was approved by an admin, re-checked server-side. The
 * database already refuses a non-admin writing the approval stamp (0014); this
 * also catches an approver who has since been deactivated or demoted.
 */
async function approvedByActiveAdmin(db: Db, doc: Post): Promise<boolean> {
  const approvedBy = String(doc.approvedBy || "").trim()
  if (!approvedBy || !doc.approvedAt) return false
  const { data: prof } = await db
    .from("profiles").select("role, active").eq("email", approvedBy).maybeSingle()
  return !!prof && prof.active !== false && (prof.role === "admin" || prof.role === "super_admin")
}

/** The scheduled sweep: recover killed runs, then publish what is due. */
async function sweep(db: Db) {
  const started = Date.now()
  const out: { id: string; ok: boolean; error?: string }[] = []

  // 1) A claim that outlived any possible run: the run was killed. Say so and
  //    stop; Instagram may already have the post, so a person decides.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const { data: stuck } = await db
    .from("social").select("id, doc")
    .eq("doc->>status", "publishing")
    .lt("doc->>publishingSince", staleBefore)
    .limit(20)
  for (const row of (stuck || []) as Row[]) {
    await writeDoc(db, row.id, {
      ...row.doc,
      status: "failed",
      publishingSince: null,
      error: "Publishing was interrupted. Check Instagram and Facebook for this post before pressing Publish again; platforms already recorded below will be skipped.",
    })
    out.push({ id: row.id, ok: false, error: "interrupted run recovered" })
  }

  // 2) Due posts, oldest first, while there is time to finish one.
  const now = new Date().toISOString()
  const { data: rows } = await db
    .from("social").select("id, doc")
    .eq("doc->>status", "scheduled")
    .lte("doc->>scheduledFor", now)
    .not("doc->>approvedAt", "is", null)
    .order("doc->>scheduledFor", { ascending: true })
    .limit(5)

  for (const row of (rows || []) as Row[]) {
    if (Date.now() - started > SWEEP_BUDGET_MS) break // the next sweep takes the rest
    if (!(await approvedByActiveAdmin(db, row.doc))) {
      await writeDoc(db, row.id, {
        ...row.doc,
        status: "failed",
        error: `Not published: ${row.doc.approvedBy || "the approver"} is no longer an active admin. An admin needs to publish it.`,
      })
      out.push({ id: row.id, ok: false, error: "approver no longer an active admin" })
      continue
    }
    const problem = await problemWith(row.doc)
    if (problem) {
      await writeDoc(db, row.id, { ...row.doc, status: "failed", error: problem })
      out.push({ id: row.id, ok: false, error: problem })
      continue
    }
    const claimed = await claim(db, row, "scheduled")
    if (!claimed) continue // an admin or another sweep got there first
    try {
      await publishClaimed(db, row.id, claimed)
      out.push({ id: row.id, ok: true })
    } catch (err) {
      out.push({ id: row.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!service) return json({ error: "Publishing is not configured (missing service role)." }, 500)
    if (!Deno.env.get("META_ACCESS_TOKEN")) {
      return json({ error: "Publishing is not configured yet (missing META_ACCESS_TOKEN). See docs/guides/META_SETUP.md." }, 500)
    }

    const db = createClient(url, service)
    const authHeader = req.headers.get("Authorization") ?? ""
    const bearer = authHeader.replace(/^bearer\s+/i, "").trim()
    if (!bearer) return json({ error: "Not authenticated" }, 401)

    const body = await req.json().catch(() => ({}))
    const cronSecret = Deno.env.get("SOCIAL_CRON_SECRET") || ""
    const isScheduler = bearer === service || secretsMatch(req.headers.get("x-social-secret") || "", cronSecret)

    // --- b) Scheduler sweep ----------------------------------------------------
    if (body.mode === "due") {
      if (!isScheduler) return json({ error: "Scheduler access required" }, 403)
      const results = await sweep(db)
      return json({ processed: results.length, results })
    }

    // --- a) Interactive: an admin pressing Publish ---------------------------
    const staff = await requireStaff(req, ["admin", "super_admin"], "Only an admin can publish to the company profile.")
    if (staff instanceof Response) return staff

    const postId = String(body.postId || "")
    if (!postId) return json({ error: "postId is required" }, 400)

    const { data: row } = await db.from("social").select("id, doc").eq("id", postId).maybeSingle()
    if (!row) return json({ error: "Post not found" }, 404)

    const status = String((row.doc as Post)?.status || "")
    if (status === "published") return json({ error: "This post is already published." }, 400)
    if (status === "publishing") return json({ error: "This post is being published right now. Refresh in a minute." }, 409)
    // The approval gate. Anything not approved is not going out, whatever the
    // caller says. 'failed' is allowed so a partial failure can be retried.
    if (!["approved", "scheduled", "failed"].includes(status)) {
      return json({ error: "This post has not been approved yet." }, 400)
    }

    const problem = await problemWith(row.doc as Post)
    if (problem) return json({ error: problem }, 400)

    const claimed = await claim(db, row as Row, status)
    if (!claimed) return json({ error: "This post is already being published. Refresh in a minute." }, 409)

    const results = await publishClaimed(db, row.id, claimed)
    return json({ ok: true, results })
  } catch (err) {
    console.error("social-publish error", err)
    return json({ error: err instanceof Error ? err.message : "Something went wrong." }, 500)
  }
})
