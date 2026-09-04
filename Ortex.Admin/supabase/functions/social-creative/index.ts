// Edge Function: social-creative
//
// Step 2 of the social pipeline. Renders one advertising creative and puts it in
// the PUBLIC social-media bucket, returning the URL.
//
// Provider is Pollinations (FLUX), which is free and needs no API key. Gemini's
// image model was the original choice but it has NO free tier — an unbilled key
// is capped at `limit: 0`, so every call 429s no matter how long you wait.
// Pollinations has no such wall. It is slower (5-45s) and a little less polished,
// and the creative is reviewed by a human before publishing anyway.
//
// It has to land in a public bucket because Instagram's publishing API fetches
// the image from a URL we hand it — Meta's servers must be able to read it
// anonymously. See migration 0013.
//
// Callable only by active staff. Nothing here publishes; it only produces an
// image for a human to look at.
//
// Deploy:
//   supabase functions deploy social-creative
//   (optional) supabase secrets set IMAGE_MODEL=flux

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"

const MODEL = Deno.env.get("IMAGE_MODEL") || "flux"
const BUCKET = "social-media"

// Instagram feed accepts 1:1, 4:5 (portrait) and 1.91:1 (landscape). Pollinations
// takes pixels rather than a ratio, so these are the ratios at feed resolution.
const SIZES: Record<string, [number, number]> = {
  square: [1024, 1024],
  portrait: [1024, 1280],
  landscape: [1200, 628],
}

// The bucket only accepts these three (migration 0013).
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"]

// A cold render can take ~45s. Give one attempt room to finish, but keep the
// total under the platform's ~150s wall-clock cap or the whole call is killed
// and the caller gets a connection error instead of our message.
const RENDER_TIMEOUT_MS = 60_000
const TOTAL_DEADLINE_MS = 130_000

// Pollinations bills nothing and reports no tokens, but the Settings usage card
// counts rows, so keep logging one row per render to preserve the request count.
async function logUsage() {
  try {
    const url = Deno.env.get("SUPABASE_URL")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !service) return
    const client = createClient(url, service)
    await client.from("ai_usage").insert({
      doc: {
        feature: "social-creative",
        model: `pollinations/${MODEL}`,
        promptTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    })
  } catch {
    /* usage logging must never break the response */
  }
}

// The prompt travels in the URL path, so it stays on one line and stays short.
function buildPrompt(imagePrompt: string) {
  return [
    "Photorealistic commercial advertising product photography for Ortex Industries,",
    "an Indian manufacturer of customized MDF, acrylic, lanyard, badge and corporate gift products.",
    `The shot: ${imagePrompt}.`,
    "Believable materials, real surface texture, accurate scale.",
    "Clean studio or contextual setting, soft directional key light, gentle shadow, shallow depth of field.",
    "Calm negative space, the product is unmistakably the subject.",
    "No text, no letters, no numbers, no words, no logos, no watermarks, no signatures.",
    "No faces in focus, no third-party brand marks, nothing implying an award or price.",
  ].join(" ")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!service) return json({ error: "Creative generation is not configured (missing service role)." }, 500)

    // 1) Authenticate the caller and confirm they are active staff.
    const authHeader = req.headers.get("Authorization") ?? ""
    const jwt = authHeader.replace(/^bearer\s+/i, "").trim()
    if (!jwt) return json({ error: "Not authenticated" }, 401)

    const { data: userData, error: userErr } = await createClient(url, anon).auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401)

    const admin = createClient(url, service)
    const { data: prof } = await admin
      .from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle()
    if (!prof || prof.active === false || !["admin", "sales"].includes(prof.role)) {
      return json({ error: "Staff access required" }, 403)
    }

    // 2) Validate input.
    const body = await req.json().catch(() => ({}))
    const imagePrompt = String(body.imagePrompt || "").trim()
    if (!imagePrompt) return json({ error: "An image prompt is required." }, 400)
    const [width, height] = SIZES[String(body.format || "square")] || SIZES.square

    // 3) Render. Pollinations takes the whole prompt in the URL path and streams
    //    the image straight back, so there is no JSON envelope to unwrap.
    const prompt = buildPrompt(imagePrompt.slice(0, 600))
    let bytes: Uint8Array | undefined
    let mime = "image/jpeg"
    let lastDetail = ""
    const startedAt = Date.now()

    for (let attempt = 0; attempt < 3; attempt++) {
      // Never start an attempt that cannot finish before the platform kills us.
      if (attempt > 0 && Date.now() - startedAt > TOTAL_DEADLINE_MS - RENDER_TIMEOUT_MS) break

      // A fresh seed each attempt, so a retry is a genuinely new render rather
      // than the same cached image coming back.
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const endpoint =
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        `?width=${width}&height=${height}&model=${encodeURIComponent(MODEL)}` +
        `&nologo=true&seed=${seed}&referrer=ortex-industries`

      const abort = AbortSignal.timeout(RENDER_TIMEOUT_MS)
      try {
        const res = await fetch(endpoint, { signal: abort })
        const type = (res.headers.get("content-type") || "").split(";")[0].trim()
        if (!res.ok) {
          lastDetail = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`
          continue
        }
        // An overloaded node can answer 200 with an HTML error page. Only bytes
        // the bucket will actually accept count as success.
        if (!ALLOWED_MIME.includes(type)) {
          lastDetail = `unexpected content-type ${type}`
          await res.body?.cancel().catch(() => {})
          continue
        }
        bytes = new Uint8Array(await res.arrayBuffer())
        mime = type
        if (bytes.length > 0) break
        lastDetail = "empty image body"
        bytes = undefined
      } catch (e) {
        lastDetail = e instanceof Error ? e.message : String(e)
      }
    }

    if (!bytes) {
      console.error("social-creative render failed", lastDetail)
      return json({ error: "The image generator did not respond. Try again in a moment." }, 502)
    }

    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png"
    const path = `creatives/${crypto.randomUUID()}.${ext}`

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "31536000",
    })
    if (upErr) {
      console.error("social-creative upload failed", upErr)
      return json({ error: "Could not save the generated image." }, 500)
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    await logUsage()

    return json({ image: pub.publicUrl })
  } catch (err) {
    console.error("social-creative error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
