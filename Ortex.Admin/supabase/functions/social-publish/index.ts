// Edge Function: social-publish
//
// Step 3 of the social pipeline, and the ONLY thing that talks to Meta. It holds
// the Page access token, which is why publishing cannot live in the browser.
//
// Two ways in:
//   a) An ADMIN pressing Publish. Sales staff can research, draft, and queue,
//      but they cannot push to the company profile — this is where that line is
//      drawn, because the Meta token is here and nowhere else.
//   b) The scheduler (pg_cron), passing the service-role key as the bearer, with
//      { mode: "due" } to sweep posts whose scheduledFor has arrived. Same
//      pattern as indiamart-pull.
//
// A post is only ever published from status 'approved' or 'scheduled', and only
// if it has not been published already — a double-fire must not double-post.
//
// Deploy:
//   supabase functions deploy social-publish
//   supabase secrets set META_ACCESS_TOKEN=your-long-lived-page-token
//   supabase secrets set META_IG_USER_ID=17841400000000000
//   supabase secrets set META_PAGE_ID=100000000000000
//   (optional) supabase secrets set META_GRAPH_VERSION=v21.0

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const GRAPH = Deno.env.get("META_GRAPH_VERSION") || "v21.0"
const api = (path: string) => `https://graph.facebook.com/${GRAPH}/${path}`

type Post = Record<string, unknown>

/** Caption + hashtags exactly as Meta receives them. Mirrors socialCaptionText. */
function captionText(doc: Post) {
  const tags = (Array.isArray(doc.hashtags) ? doc.hashtags : [])
    .filter(Boolean)
    .map((t) => `#${String(t).replace(/^#/, "")}`)
  return [String(doc.caption || "").trim(), tags.join(" ")].filter(Boolean).join("\n\n")
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
async function publishInstagram(igUserId: string, imageUrl: string, caption: string) {
  const container = await graph(`${igUserId}/media`, { image_url: imageUrl, caption })
  if (!container?.id) throw new Error("Instagram did not return a media container.")

  // Meta fetches the image asynchronously; publishing before it is FINISHED
  // fails. Poll up to ~60s.
  let status = ""
  for (let i = 0; i < 20; i++) {
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
async function publishFacebook(pageId: string, imageUrl: string, caption: string) {
  const res = await graph(`${pageId}/photos`, { url: imageUrl, message: caption, published: "true" })
  const id = String(res?.post_id || res?.id || "")
  if (!id) throw new Error("Facebook did not return a post id.")
  return { id, permalink: res?.post_id ? `https://www.facebook.com/${res.post_id}` : "" }
}

/** Publish one row across its selected platforms and write the outcome back. */
async function publishOne(admin: ReturnType<typeof createClient>, row: { id: string; doc: Post }) {
  const doc = row.doc || {}
  const igUserId = Deno.env.get("META_IG_USER_ID")
  const pageId = Deno.env.get("META_PAGE_ID")

  const platforms: string[] = Array.isArray(doc.platforms) ? doc.platforms as string[] : []
  const caption = captionText(doc)
  const image = String(doc.image || "")

  if (!image) throw new Error("This post has no creative yet.")
  if (!caption) throw new Error("This post has no caption yet.")
  if (!platforms.length) throw new Error("No platform selected for this post.")

  const results: Record<string, unknown> = { ...(doc.results as Record<string, unknown>) }
  const errors: string[] = []

  for (const p of platforms) {
    // Never re-post a platform that already succeeded — a retry after a partial
    // failure must only fill the gap.
    if ((results[p] as { id?: string })?.id) continue
    try {
      if (p === "instagram") {
        if (!igUserId) throw new Error("Instagram is not configured (missing META_IG_USER_ID).")
        results[p] = await publishInstagram(igUserId, image, caption)
      } else if (p === "facebook") {
        if (!pageId) throw new Error("Facebook is not configured (missing META_PAGE_ID).")
        results[p] = await publishFacebook(pageId, image, caption)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results[p] = { error: msg }
      errors.push(`${p}: ${msg}`)
    }
  }

  const anyLive = platforms.some((p) => (results[p] as { id?: string })?.id)
  const allLive = platforms.every((p) => (results[p] as { id?: string })?.id)

  await admin.from("social").update({
    doc: {
      ...doc,
      results,
      // Partial success stays 'failed' so it stays visible and retryable; the
      // platforms that did land are recorded and will be skipped on retry.
      status: allLive ? "published" : "failed",
      publishedAt: anyLive ? new Date().toISOString() : doc.publishedAt || null,
      error: errors.join(" | "),
    },
  }).eq("id", row.id)

  if (!allLive) throw new Error(errors.join(" | ") || "Publishing failed.")
  return results
}

/**
 * Proof that a post was approved by an admin — re-checked server-side.
 *
 * The whole `doc` (including `status`, `approvedBy`, `approvedAt`) is written by
 * staff who hold the 'social' module, so none of those fields can be trusted on
 * their own. Before the scheduler pushes anything to Meta we re-resolve
 * `approvedBy` and require it to be an account that is *currently* an active
 * admin. Anything else is skipped, never published.
 */
async function approvedByActiveAdmin(admin: ReturnType<typeof createClient>, doc: Post): Promise<boolean> {
  const approvedBy = String(doc.approvedBy || "").trim()
  if (!approvedBy || !doc.approvedAt) return false
  const { data: prof } = await admin
    .from("profiles").select("role, active").eq("email", approvedBy).maybeSingle()
  return !!prof && prof.active !== false && prof.role === "admin"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!service) return json({ error: "Publishing is not configured (missing service role)." }, 500)
    if (!Deno.env.get("META_ACCESS_TOKEN")) {
      return json({ error: "Publishing is not configured yet (missing META_ACCESS_TOKEN). See docs/guides/META_SETUP.md." }, 500)
    }

    const admin = createClient(url, service)
    const authHeader = req.headers.get("Authorization") ?? ""
    const bearer = authHeader.replace(/^bearer\s+/i, "").trim()
    if (!bearer) return json({ error: "Not authenticated" }, 401)

    const body = await req.json().catch(() => ({}))
    const isScheduler = bearer === service

    // --- b) Scheduler sweep: publish everything whose time has come ----------
    if (isScheduler || body.mode === "due") {
      if (!isScheduler) return json({ error: "Scheduler access required" }, 403)
      const now = new Date().toISOString()
      // Only publish posts an admin actually approved. The publishable statuses
      // and the approval stamp are admin-gated at the DB layer (migration 0014's
      // social_approval_guard trigger); the per-row approvedByActiveAdmin check
      // below re-verifies provenance so an unapproved row can never be swept live
      // even if it somehow reaches 'scheduled'.
      const { data: rows } = await admin
        .from("social").select("id, doc")
        .eq("doc->>status", "scheduled")
        .lte("doc->>scheduledFor", now)
        .not("doc->>approvedAt", "is", null)
        .limit(10)

      const out: { id: string; ok: boolean; error?: string }[] = []
      for (const row of rows || []) {
        // The doc is staff-writable, so status='scheduled' and a stamped
        // approvedAt are not proof on their own. Re-resolve the approver and
        // require an active admin before anything goes to Meta; skip otherwise.
        if (!(await approvedByActiveAdmin(admin, row.doc as Post))) {
          out.push({ id: row.id, ok: false, error: "Skipped: not approved by an active admin." })
          continue
        }
        try {
          await publishOne(admin, row as { id: string; doc: Post })
          out.push({ id: row.id, ok: true })
        } catch (err) {
          out.push({ id: row.id, ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      }
      return json({ processed: out.length, results: out })
    }

    // --- a) Interactive: an admin pressing Publish ---------------------------
    const { data: userData, error: userErr } = await createClient(url, anon).auth.getUser(bearer)
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401)

    const { data: prof } = await admin
      .from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle()
    if (!prof || prof.active === false || prof.role !== "admin") {
      return json({ error: "Only an admin can publish to the company profile." }, 403)
    }

    const postId = String(body.postId || "")
    if (!postId) return json({ error: "postId is required" }, 400)

    const { data: row } = await admin.from("social").select("id, doc").eq("id", postId).maybeSingle()
    if (!row) return json({ error: "Post not found" }, 404)

    const status = String((row.doc as Post)?.status || "")
    if (status === "published") return json({ error: "This post is already published." }, 400)
    // The approval gate. Anything not approved is not going out, whatever the
    // caller says. 'failed' is allowed so a partial failure can be retried.
    if (!["approved", "scheduled", "failed"].includes(status)) {
      return json({ error: "This post has not been approved yet." }, 400)
    }

    const results = await publishOne(admin, row as { id: string; doc: Post })
    return json({ ok: true, results })
  } catch (err) {
    console.error("social-publish error", err)
    return json({ error: err instanceof Error ? err.message : "Something went wrong." }, 500)
  }
})
