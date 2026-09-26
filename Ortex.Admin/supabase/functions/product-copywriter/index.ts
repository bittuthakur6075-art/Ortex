// Edge Function: product-copywriter
//
// Generates SEO- and marketing-optimised product copy (title, description,
// best-fit category and a material suggestion) with Gemini, LOOKING AT the
// product's first photo when the caller sends `imageUrl` (one of our stored
// photos only; see _shared/images.ts). Callable ONLY by a signed-in, active staff
// member — the caller's JWT is checked against their profile before the Gemini
// key is used. The key never reaches the browser.
//
// Deploy:
//   supabase functions deploy product-copywriter
//   supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
//   (optional) supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform automatically.

import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { generateContent, extractText, logAiUsage } from "../_shared/gemini.ts"
import { fetchImage, ownStorageUrl, toBase64 } from "../_shared/images.ts"
import { clipStrings } from "../_shared/guard.ts"

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest"

// Gemini reads these inline; anything else (a GIF, an AVIF) is written without the photo.
const VISION_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]

function buildPrompt(input: Record<string, unknown>, allowed: string[], withPhoto: boolean) {
  return `You are an expert e-commerce SEO copywriter for Ortex Industries, an Indian manufacturer of customized products (MDF, acrylic, lanyards, badges, corporate gifts, and more). Write copy that ranks on Google and converts B2B buyers.
${
    withPhoto
      ? `
A PHOTO OF THE PRODUCT IS ATTACHED. Use it: describe what is actually visible (form, finish, colours, how the branding is applied). Trust the photo over a vague draft name, but never read a customer's logo or brand name out of the photo into the copy.
`
      : ""
  }
Write copy for this product based on the details provided:
- Draft name / keywords: ${input.name || "(none given)"}
- Current category: ${input.category || "(unknown)"}
- Material / spec: ${input.material || "(unknown)"}
- Base price: ${input.basePrice ? "Rs " + input.basePrice : "(unknown)"} per ${input.unit || "pc"}
- MOQ: ${input.moq || "(unknown)"}

Produce:
1. "name": a concise, keyword-rich product title (max ~60 characters). Front-load the primary keyword buyers search for. Title Case. No ALL CAPS, no emojis, no quotes.
2. "description": 3 to 5 sentences of persuasive, benefit-led marketing copy that also reads well for SEO. Cover the material and finish, how it can be customised with the buyer's branding, and two or three real use-cases (corporate gifting, events, offices, schools, retail). Indian English. Do NOT invent prices, discounts, certifications, dimensions or specs not implied by the inputs or the photo. No em dashes.
3. "category": choose the single best-fit category, and it MUST be EXACTLY one of this allowed list: ${JSON.stringify(allowed)}.
4. "material": the main material in 1 to 4 words (for example "MDF", "Clear acrylic", "Polyester satin", "Stainless steel"), taken from the inputs or clearly visible in the photo. Empty string if you cannot tell.

Return ONLY a JSON object with exactly these keys: "name", "description", "category", "material". No markdown, no code fences, no extra text.`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) return json({ error: "Copywriter is not configured (missing GEMINI_API_KEY)." }, 500)

    // 1) Authenticate the caller and confirm they are active staff.
    const staff = await requireStaff(req)
    if (staff instanceof Response) return staff

    // 2) Validate input.
    const body = clipStrings(await req.json().catch(() => ({})))
    const allowed: string[] = Array.isArray(body.allowedCategories) ? body.allowedCategories.filter(Boolean) : []
    if (!allowed.length) return json({ error: "No categories provided" }, 400)
    const hasPhoto = ownStorageUrl(body.imageUrl)
    if (!body.name && !body.material && !body.category && !hasPhoto) {
      return json({ error: "Add a photo, or enter a product name, keywords or material first." }, 400)
    }

    // 3) The photo, when there is one of ours. A photo that cannot be read is not
    //    worth failing the copy over: write from the fields alone.
    // deno-lint-ignore no-explicit-any
    let photoPart: any = null
    if (hasPhoto) {
      try {
        const photo = await fetchImage(body.imageUrl)
        if (VISION_MIME.includes(photo.mime)) {
          photoPart = { inlineData: { mimeType: photo.mime, data: toBase64(photo.bytes) } }
        }
      } catch (e) {
        console.warn("product-copywriter photo skipped", e)
      }
    }

    // 4) Call Gemini, asking for strict JSON.
    const parts = [{ text: buildPrompt(body, allowed, !!photoPart) }, ...(photoPart ? [photoPart] : [])]
    const gemRes = await generateContent(MODEL, apiKey, {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 900,
        responseMimeType: "application/json",
      },
    })
    if (!gemRes || !gemRes.ok) {
      return json({ error: "Copywriter is temporarily unavailable." }, 502)
    }

    const data = await gemRes.json()
    const raw = extractText(data)

    // Strip code fences, locate the outermost JSON object if model added prose, and parse.
    const fenceStripped = raw.replace(/```(?:json)?/gi, "").trim()
    const jsonMatch = fenceStripped.match(/\{[\s\S]*\}/)
    const toParse = jsonMatch ? jsonMatch[0] : fenceStripped

    let parsed: { name?: string; description?: string; category?: string; material?: string }
    try {
      parsed = JSON.parse(toParse)
    } catch (parseErr) {
      console.error("product-copywriter JSON parse failure:", parseErr, "Raw text:", raw)
      return json({ error: "Could not parse AI response." }, 502)
    }

    // Constrain the category to the allowed list (case-insensitive match).
    const match = allowed.find((c) => c.toLowerCase() === String(parsed.category || "").toLowerCase())

    await logAiUsage("copywriter", MODEL, data?.usageMetadata)

    return json({
      name: (parsed.name || "").trim(),
      description: (parsed.description || "").trim(),
      category: match || body.category || allowed[0],
      // Only ever a suggestion: callers fill it into an EMPTY material field and
      // leave a material the person typed alone.
      material: (parsed.material || "").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, 60),
      usedPhoto: !!photoPart,
    })
  } catch (err) {
    console.error("product-copywriter error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
