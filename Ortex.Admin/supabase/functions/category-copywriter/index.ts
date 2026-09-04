// Edge Function: category-copywriter
//
// Generates SEO- and marketing-optimised copy for a product CATEGORY (intro
// paragraph, SEO title, SEO description) with Gemini. Callable ONLY by a
// signed-in, active staff member — the caller's JWT is checked against their
// profile before the Gemini key is used. The key never reaches the browser.
//
// Deploy:
//   supabase functions deploy category-copywriter
//   supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
//   (optional) supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform automatically.

import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { generateContent, extractText, logAiUsage } from "../_shared/gemini.ts"

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest"

function buildPrompt(input: Record<string, unknown>) {
  return `You are an expert e-commerce SEO copywriter for Ortex Industries, an Indian manufacturer of customized products (MDF, acrylic, lanyards, badges, corporate gifts, and more). Write copy that ranks on Google and converts B2B buyers.

Write copy for this PRODUCT CATEGORY landing page:
- Category name: ${input.name || "(none given)"}
- Display heading: ${input.displayName || "(same as name)"}
- Default HSN: ${input.hsn || "(unknown)"}
- Existing notes / keywords: ${input.description || "(none)"}

Produce:
1. "intro": 2 to 3 sentences of persuasive, benefit-led marketing copy for the top of the category page. Mention what the category covers, the in-house custom manufacturing, and a key use-case or benefit for businesses. Indian English. No em dashes. Do NOT invent prices, discounts, MOQs, certifications, or specs.
2. "seoTitle": a concise, keyword-rich page title (max ~60 characters), Title Case, ending with " | Ortex Industries". Front-load the primary keyword buyers search for. No ALL CAPS, no emojis, no quotes.
3. "seoDescription": a compelling meta description (~150 to 160 characters) that reads naturally and includes the primary keyword and a call to action. No em dashes.

Return ONLY a JSON object with exactly these keys: "intro", "seoTitle", "seoDescription". No markdown, no code fences, no extra text.`
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
    const body = await req.json().catch(() => ({}))
    if (!body.name && !body.displayName && !body.description) {
      return json({ error: "Enter a category name or a few keywords first." }, 400)
    }

    // 3) Call Gemini, asking for strict JSON.
    const gemRes = await generateContent(MODEL, apiKey, {
      contents: [{ role: "user", parts: [{ text: buildPrompt(body) }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
        responseMimeType: "application/json",
      },
    })
    if (!gemRes || !gemRes.ok) {
      return json({ error: "Copywriter is temporarily unavailable." }, 502)
    }

    const data = await gemRes.json()
    const raw = extractText(data)

    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
    let parsed: { intro?: string; seoTitle?: string; seoDescription?: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: "Could not parse AI response." }, 502)
    }

    await logAiUsage("category-copywriter", MODEL, data?.usageMetadata)

    return json({
      intro: (parsed.intro || "").trim(),
      seoTitle: (parsed.seoTitle || "").trim(),
      seoDescription: (parsed.seoDescription || "").trim(),
    })
  } catch (err) {
    console.error("category-copywriter error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
