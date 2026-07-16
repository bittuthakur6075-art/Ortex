// Edge Function: social-creative
//
// Step 2 of the social pipeline. Renders one advertising creative with Gemini's
// image model and puts it in the PUBLIC social-media bucket, returning the URL.
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
//   supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
//   (optional) supabase secrets set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image"
const BUCKET = "social-media"

// Instagram feed accepts 1:1, 4:5 (portrait) and 1.91:1 (landscape).
const RATIOS: Record<string, string> = {
  square: "1:1",
  portrait: "4:5",
  landscape: "1.91:1",
}

async function logUsage(usage: Record<string, number> | undefined) {
  try {
    if (!usage) return
    const url = Deno.env.get("SUPABASE_URL")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !service) return
    const client = createClient(url, service)
    await client.from("ai_usage").insert({
      doc: {
        feature: "social-creative",
        model: MODEL,
        promptTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
    })
  } catch {
    /* usage logging must never break the response */
  }
}

function buildPrompt(imagePrompt: string) {
  return `Create a single photorealistic advertising creative for Ortex Industries, an Indian manufacturer of customized MDF, acrylic, lanyard, badge and corporate gift products.

The shot: ${imagePrompt}

Requirements:
- Photorealistic commercial product photography. Believable materials, real surface texture, accurate scale.
- Clean studio or contextual setting, soft directional key light, gentle shadow, shallow depth of field.
- Composition leaves calm negative space; the product is unmistakably the subject.
- NO text, letters, numbers, words, logos, watermarks, signatures, or UI of any kind anywhere in the image.
- No people's faces in focus. No recognisable third-party brand marks.
- Nothing implying an award, certification, rating, or price.`
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!
    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) return json({ error: "Creative generation is not configured (missing GEMINI_API_KEY)." }, 500)

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
    const aspectRatio = RATIOS[String(body.format || "square")] || RATIOS.square

    // 3) Render.
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
    let gemRes: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      gemRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(imagePrompt) }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio },
          },
        }),
      })
      if (gemRes.ok || (gemRes.status !== 500 && gemRes.status !== 503)) break
    }
    if (!gemRes || !gemRes.ok) {
      const detail = await gemRes?.text().catch(() => "")
      console.error("social-creative gemini error", gemRes?.status, detail)
      return json({ error: "Creative generation is temporarily unavailable." }, 502)
    }

    const data = await gemRes.json()

    // The model may refuse (safety) and return only text — treat that as a real
    // failure rather than uploading nothing.
    const parts = data?.candidates?.[0]?.content?.parts || []
    const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data)
    if (!imgPart) {
      const text = parts.map((p: { text?: string }) => p.text || "").join(" ").trim()
      const reason = data?.candidates?.[0]?.finishReason
      console.error("social-creative no image", reason, text.slice(0, 300))
      return json({
        error: reason === "IMAGE_SAFETY" || reason === "SAFETY"
          ? "The image model refused this prompt. Reword the creative brief and try again."
          : "The model returned no image. Try again.",
      }, 502)
    }

    const mime = imgPart.inlineData.mimeType || "image/png"
    const bytes = decodeBase64(imgPart.inlineData.data)
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

    await logUsage(data?.usageMetadata)

    return json({ image: pub.publicUrl })
  } catch (err) {
    console.error("social-creative error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
