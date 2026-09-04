// Edge Function: product-copywriter
//
// Generates SEO- and marketing-optimised product copy (title, description, and
// best-fit category) with Gemini. Callable ONLY by a signed-in, active staff
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

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest"

function buildPrompt(input: Record<string, unknown>, allowed: string[]) {
  return `You are an expert e-commerce SEO copywriter for Ortex Industries, an Indian manufacturer of customized products (MDF, acrylic, lanyards, badges, corporate gifts, and more). Write copy that ranks on Google and converts B2B buyers.

Write copy for this product based on the details provided:
- Draft name / keywords: ${input.name || "(none given)"}
- Current category: ${input.category || "(unknown)"}
- Material / spec: ${input.material || "(unknown)"}
- Base price: ${input.basePrice ? "Rs " + input.basePrice : "(unknown)"} per ${input.unit || "pc"}
- MOQ: ${input.moq || "(unknown)"}

Produce:
1. "name": a concise, keyword-rich product title (max ~60 characters). Front-load the primary keyword buyers search for. Title Case. No ALL CAPS, no emojis, no quotes.
2. "description": 2 to 4 sentences of persuasive, benefit-led marketing copy that also reads well for SEO. Mention the material and a key use-case or benefit. Indian English. Do NOT invent prices, discounts, certifications, or specs not implied by the inputs. No em dashes.
3. "category": choose the single best-fit category, and it MUST be EXACTLY one of this allowed list: ${JSON.stringify(allowed)}.

Return ONLY a JSON object with exactly these keys: "name", "description", "category". No markdown, no code fences, no extra text.`
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
    const allowed: string[] = Array.isArray(body.allowedCategories) ? body.allowedCategories.filter(Boolean) : []
    if (!allowed.length) return json({ error: "No categories provided" }, 400)
    if (!body.name && !body.material && !body.category) {
      return json({ error: "Enter a product name, keywords, or material first." }, 400)
    }

    // 3) Call Gemini, asking for strict JSON.
    const gemRes = await generateContent(MODEL, apiKey, {
      contents: [{ role: "user", parts: [{ text: buildPrompt(body, allowed) }] }],
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

    // Strip any accidental code fences, then parse.
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
    let parsed: { name?: string; description?: string; category?: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: "Could not parse AI response." }, 502)
    }

    // Constrain the category to the allowed list (case-insensitive match).
    const match = allowed.find((c) => c.toLowerCase() === String(parsed.category || "").toLowerCase())

    await logAiUsage("copywriter", MODEL, data?.usageMetadata)

    return json({
      name: (parsed.name || "").trim(),
      description: (parsed.description || "").trim(),
      category: match || body.category || allowed[0],
    })
  } catch (err) {
    console.error("product-copywriter error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
