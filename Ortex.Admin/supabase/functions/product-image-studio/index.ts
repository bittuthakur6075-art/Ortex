// Edge Function: product-image-studio
//
// Re-shoots an existing product photo: a new background, better light, the
// clutter gone. It EDITS the photo we already have; it never invents a product.
//
// Provider: Cloudflare Workers AI, `@cf/black-forest-labs/flux-2-klein-4b`.
// Chosen because it is the one hosted image EDITING model that is both free to
// run at our volume (Workers AI gives 10,000 neurons a day, roughly 80 edits at
// 1024px) and licensed for commercial use (FLUX.2 [klein] 4B is Apache 2.0, unlike
// FLUX.1 Kontext [dev], which is non-commercial). Past the daily allowance it
// bills about $0.0014 an image.
//
// ⚠️ FIDELITY IS THE WHOLE PROBLEM. Ortex sells made-to-order goods: a buyer who
// orders from a photo expects the logo, the engraving and the acrylic's edge to
// be exactly what arrives. Every style below therefore asks for the SCENE to
// change and orders the product itself left alone, the result is saved as a NEW
// photo beside the original (never over it), and both apps show before/after
// for a person to accept. The model still sees only a sub-512px copy, so fine
// print can soften; the review step exists for that.
//
// Callable only by active staff. The Cloudflare token never leaves the server.
//
// Deploy:
//   supabase functions deploy product-image-studio
//   supabase secrets set CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=...
//   (the token needs the "Workers AI: Read" and "Workers AI: Edit" permissions)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { logAiUsage } from "../_shared/gemini.ts"
import { fetchImage, fromBase64, ownStorageUrl, shrinkToJpeg, sniffImageMime } from "../_shared/images.ts"

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b"
const BUCKET = "product-images"
/** Klein refuses reference images of 512px or more on a side. */
const REFERENCE_MAX_SIDE = 511
const OUTPUT_SIZE = 1024

/**
 * The fixed styles. Kept to a short, named list rather than a free prompt box
 * alone, because the words that keep a product intact are easy to leave out and
 * a rep in the field should not have to know them.
 */
const STYLES: Record<string, string> = {
  studio:
    "Place the product on a seamless pure white studio background with a soft, natural contact shadow beneath it. Even, bright, diffused e-commerce lighting.",
  lifestyle:
    "Place the product in a tasteful, realistic setting where it would be used, such as a modern office desk or reception counter, with the background softly out of focus.",
  clean:
    "Remove clutter, dust, fingerprints, stray objects and distracting background elements. Keep the existing setting but make it neat and tidy.",
  lighting:
    "Improve the lighting and colour balance: correct the white balance, lift the shadows, add gentle highlights and make the photo crisp and professional. Keep the same background.",
  gradient:
    "Place the product on a smooth, soft light grey to white gradient studio backdrop with a subtle reflection beneath it.",
}

const KEEP_PRODUCT =
  "The product in image 0 must stay exactly as it is: identical shape, proportions, material, colours, printed artwork, logos, engraving and any text on it. Do not add, remove, redraw or change any lettering or logo on the product. Do not add any new text, watermark or logo anywhere. Keep the product centred and fully in frame. Photorealistic product photography."

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")
    const token = Deno.env.get("CLOUDFLARE_API_TOKEN")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!account || !token) {
      return json({ error: "The photo studio is not configured (missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN)." }, 500)
    }
    if (!service) return json({ error: "The photo studio is not configured (missing service role)." }, 500)

    const staff = await requireStaff(req)
    if (staff instanceof Response) return staff

    const body = await req.json().catch(() => ({}))
    if (!ownStorageUrl(body.imageUrl)) {
      return json({ error: "Upload the photo first, then enhance it." }, 400)
    }
    const style = String(body.style || "studio")
    const instruction = String(body.instruction || "").trim().slice(0, 400)
    if (!STYLES[style] && !instruction) return json({ error: "Choose a style or describe the change." }, 400)

    // 1) The reference photo, shrunk under Klein's 512px ceiling.
    let reference: Uint8Array | null
    try {
      const original = await fetchImage(body.imageUrl)
      reference = await shrinkToJpeg(original.bytes, REFERENCE_MAX_SIDE)
    } catch (e) {
      console.error("image-studio fetch failed", e)
      return json({ error: "Could not read that photo." }, 400)
    }
    if (!reference) {
      return json({ error: "This photo's format cannot be edited. Re-upload it as a JPG or PNG." }, 400)
    }

    const productName = String(body.productName || "").trim().slice(0, 120)
    const prompt = [
      productName ? `The product is: ${productName}.` : "",
      STYLES[style] || "",
      instruction ? `Also: ${instruction}.` : "",
      KEEP_PRODUCT,
    ]
      .filter(Boolean)
      .join(" ")

    // 2) Render. Multipart even for the prompt, as Workers AI requires for FLUX.2.
    const form = new FormData()
    form.append("prompt", prompt)
    form.append("input_image_0", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "reference.jpg")
    form.append("width", String(OUTPUT_SIZE))
    form.append("height", String(OUTPUT_SIZE))
    form.append("seed", String(crypto.getRandomValues(new Uint32Array(1))[0]))

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`
    let imageB64 = ""
    let lastDetail = ""
    for (let attempt = 0; attempt < 2 && !imageB64; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: AbortSignal.timeout(60_000),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok || !payload?.success) {
          lastDetail = `${res.status} ${JSON.stringify(payload?.errors || payload).slice(0, 300)}`
          // A spent daily allowance or a bad token will not fix itself on retry.
          if (res.status === 429 || res.status === 401 || res.status === 403) break
          continue
        }
        imageB64 = String(payload?.result?.image || "")
        if (!imageB64) lastDetail = "no image in response"
      } catch (e) {
        lastDetail = e instanceof Error ? e.message : String(e)
      }
    }

    if (!imageB64) {
      console.error("image-studio render failed", lastDetail)
      const quota = lastDetail.startsWith("429")
      const auth = lastDetail.startsWith("401") || lastDetail.startsWith("403")
      return json(
        {
          error: quota
            ? "Today's free photo edits are used up. Try again tomorrow."
            : auth
              ? "The photo studio's Cloudflare token was refused. Check CLOUDFLARE_API_TOKEN."
              : "The photo studio did not respond. Try again in a moment.",
        },
        quota ? 429 : 502,
      )
    }

    // 3) Save as a NEW object beside the product's photos. Never overwrite.
    const bytes = fromBase64(imageB64)
    const mime = sniffImageMime(bytes) || "image/png"
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png"
    const path = `products/ai/${crypto.randomUUID()}.${ext}`
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, service)
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "31536000",
    })
    if (upErr) {
      console.error("image-studio upload failed", upErr)
      return json({ error: "Could not save the new photo." }, 500)
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    await logAiUsage("image-studio", `cloudflare/${MODEL}`, undefined)
    return json({ image: pub.publicUrl, style })
  } catch (err) {
    console.error("product-image-studio error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
