// Edge Function: social-creative
//
// Step 2 of the social pipeline. Renders one advertising creative and puts it in
// the PUBLIC social-media bucket, returning the URL. Two ways:
//
//   · RESTYLE a real photo (`referenceUrl`, one of OUR stored photos: a product,
//     a work photo, or an upload). The product stays exactly as photographed and
//     only the scene around it changes. This is the honest default for a
//     made-to-order business: the ad shows the thing that will arrive.
//   · GENERATE from the prompt alone, for a mood or concept shot.
//
// Provider: Cloudflare Workers AI, the same account as product-image-studio.
// FLUX.2 [klein] 4B does both jobs (Apache 2.0, commercial use allowed). A
// text-only render that Klein refuses falls back to FLUX.1 [schnell] (also
// Apache 2.0). Workers AI's free 10,000 neurons a day cover dozens of creatives.
// Pollinations, used before, silently swapped the requested model for another
// and rate-limited anonymous callers (tested 2026-09-19), so it is gone.
//
// Output is ALWAYS a JPEG cropped to the chosen Instagram ratio: the Instagram
// publishing API accepts JPEG only, between 4:5 and 1.91:1.
//
// Callable only by active staff. Nothing here publishes; it only produces an
// image for a human to look at.
//
// Deploy:
//   supabase functions deploy social-creative
//   needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (already set for the studio)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts"
import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { logAiUsage } from "../_shared/gemini.ts"
import { fetchImage, fromBase64, ownStorageUrl, shrinkToJpeg } from "../_shared/images.ts"

const KLEIN = "@cf/black-forest-labs/flux-2-klein-4b"
const SCHNELL = "@cf/black-forest-labs/flux-1-schnell"
const BUCKET = "social-media"
/** Klein refuses reference images of 512px or more on a side. */
const REFERENCE_MAX_SIDE = 511

// Instagram feed ratios. Render sizes are multiples of 16 (what FLUX models
// want); the final crop gives the exact published size.
const FORMATS: Record<string, { render: [number, number]; out: [number, number] }> = {
  square: { render: [1024, 1024], out: [1080, 1080] },
  portrait: { render: [1024, 1280], out: [1080, 1350] },
  landscape: { render: [1216, 640], out: [1200, 628] },
}

const STYLE =
  "Photorealistic commercial advertising photography for Ortex Industries, an Indian manufacturer of customized MDF, acrylic, lanyard, badge and corporate gift products. Believable materials, real surface texture, accurate scale. Clean studio or contextual setting, soft directional key light, gentle shadow, shallow depth of field, calm negative space. No text, no letters, no numbers, no words, no logos, no watermarks anywhere in the image except what is already printed on the product. No faces in focus, no third-party brand marks."

const KEEP_PRODUCT =
  "The product in image 0 must stay exactly as it is: identical shape, proportions, material, colours, printed artwork, logos, engraving and any text on it. Do not add, remove, redraw or change any lettering or logo on the product. Only the scene, background and lighting around it change. Keep the product fully in frame and clearly the subject."

type Render = { b64: string; model: string } | { error: string; status: number }

async function runKlein(account: string, token: string, prompt: string, size: [number, number], reference?: Uint8Array): Promise<Render> {
  const form = new FormData()
  form.append("prompt", prompt)
  if (reference) form.append("input_image_0", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "reference.jpg")
  form.append("width", String(size[0]))
  form.append("height", String(size[1]))
  form.append("seed", String(crypto.getRandomValues(new Uint32Array(1))[0]))
  return await callCloudflare(account, token, KLEIN, { method: "POST", body: form })
}

async function runSchnell(account: string, token: string, prompt: string): Promise<Render> {
  return await callCloudflare(account, token, SCHNELL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 8 }),
  })
}

async function callCloudflare(account: string, token: string, model: string, init: RequestInit): Promise<Render> {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`
  try {
    const res = await fetch(endpoint, {
      ...init,
      headers: { ...(init.headers as Record<string, string> || {}), Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    })
    const payload = await res.json().catch(() => null)
    const b64 = String(payload?.result?.image || "")
    if (!res.ok || !payload?.success || !b64) {
      console.error("social-creative", model, res.status, JSON.stringify(payload?.errors || payload).slice(0, 300))
      return { error: `${res.status}`, status: res.status }
    }
    return { b64, model }
  } catch (e) {
    console.error("social-creative", model, e)
    return { error: "timeout", status: 504 }
  }
}

/** Scale to cover w×h, centre-crop, and encode as JPEG. */
async function toFeedJpeg(bytes: Uint8Array, [w, h]: [number, number]): Promise<Uint8Array | null> {
  let img: Image
  try {
    const decoded = await decode(bytes)
    if (!(decoded instanceof Image)) return null
    img = decoded
  } catch {
    return null
  }
  const scale = Math.max(w / img.width, h / img.height)
  img.resize(Math.max(w, Math.round(img.width * scale)), Math.max(h, Math.round(img.height * scale)))
  img.crop(Math.floor((img.width - w) / 2), Math.floor((img.height - h) / 2), w, h)
  return await img.encodeJPEG(90)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")
    const token = Deno.env.get("CLOUDFLARE_API_TOKEN")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!account || !token) {
      return json({ error: "Creative generation is not configured (missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN)." }, 500)
    }
    if (!service) return json({ error: "Creative generation is not configured (missing service role)." }, 500)

    const staff = await requireStaff(req)
    if (staff instanceof Response) return staff

    const body = await req.json().catch(() => ({}))
    const imagePrompt = String(body.imagePrompt || "").trim().slice(0, 600)
    const format = FORMATS[String(body.format || "square")] || FORMATS.square
    const referenceUrl = body.referenceUrl ? String(body.referenceUrl) : ""
    if (referenceUrl && !ownStorageUrl(referenceUrl)) {
      return json({ error: "Only photos stored in Ortex can be restyled. Upload it first." }, 400)
    }
    if (!referenceUrl && !imagePrompt) return json({ error: "An image prompt is required." }, 400)

    // 1) Render.
    let result: Render
    if (referenceUrl) {
      let reference: Uint8Array | null
      try {
        reference = await shrinkToJpeg((await fetchImage(referenceUrl)).bytes, REFERENCE_MAX_SIDE)
      } catch (e) {
        console.error("social-creative reference fetch failed", e)
        return json({ error: "Could not read that photo." }, 400)
      }
      if (!reference) return json({ error: "This photo's format cannot be restyled. Upload it as a JPG or PNG." }, 400)
      const scene = imagePrompt || "a clean, premium studio scene that suits the product"
      result = await runKlein(account, token, `Advertising photo. Scene: ${scene}. ${KEEP_PRODUCT} ${STYLE}`, format.render, reference)
    } else {
      const prompt = `${STYLE} The shot: ${imagePrompt}.`
      result = await runKlein(account, token, prompt, format.render)
      // A refusal of a text-only render (not a spent allowance or a bad token)
      // gets one more try on FLUX.1 [schnell].
      if ("error" in result && ![401, 403, 429].includes(result.status)) {
        result = await runSchnell(account, token, prompt)
      }
    }

    if ("error" in result) {
      const quota = result.status === 429
      const auth = result.status === 401 || result.status === 403
      return json(
        {
          error: quota
            ? "Today's free image allowance is used up. Try again tomorrow, or upload a photo instead."
            : auth
              ? "The image service's Cloudflare token was refused. Check CLOUDFLARE_API_TOKEN."
              : "The image generator did not respond. Try again in a moment.",
        },
        quota ? 429 : 502,
      )
    }

    // 2) Exact Instagram size, as JPEG.
    const jpeg = await toFeedJpeg(fromBase64(result.b64), format.out)
    if (!jpeg) return json({ error: "The generated image could not be processed. Try again." }, 502)

    // 3) Save as a new public object (Meta fetches it from this URL).
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, service)
    const path = `creatives/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, jpeg, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "31536000",
    })
    if (upErr) {
      console.error("social-creative upload failed", upErr)
      return json({ error: "Could not save the generated image." }, 500)
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    await logAiUsage("social-creative", `cloudflare/${result.model}`, undefined)
    return json({ image: pub.publicUrl, model: result.model })
  } catch (err) {
    console.error("social-creative error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
