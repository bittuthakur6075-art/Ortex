// Edge Function: work-copywriter
//
// Generates an SEO-friendly caption (title) and accessibility alt text for a
// Work showcase photo with Gemini. Callable ONLY by a signed-in, active staff
// member — the caller's JWT is checked against their profile before the Gemini
// key is used. The key never reaches the browser.
//
// Deploy:
//   supabase functions deploy work-copywriter
//   supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
//   (optional) supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform automatically.

import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { generateContent, extractText, logAiUsage } from "../_shared/gemini.ts"

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest"

function buildPrompt(input: Record<string, unknown>) {
  return `You are an expert SEO copywriter for Ortex Industries, an Indian manufacturer of customized products (MDF, acrylic, lanyards, badges, corporate gifts, and more). You are writing captions for the photo gallery on the company's "Our work" page, which showcases real production photography.

Write copy for ONE work photo based on these details:
- Category / product type: ${input.category || "(unknown)"}
- Draft title / keywords: ${input.title || "(none given)"}
- Notes: ${input.notes || "(none)"}

Produce:
1. "title": a short, specific, keyword-rich caption (3 to 6 words, Title Case) that a buyer would search for. No quotes, no emojis, no trailing punctuation.
2. "alt": a descriptive accessibility alt text (one sentence, ~12 to 20 words) that plainly describes what the photo shows, including the product, material, and any branding cue. Indian English. No em dashes.

Do NOT invent client names, prices, or specifics you cannot infer from the inputs. Keep it grounded in the category.

Return ONLY a JSON object with exactly these keys: "title", "alt". No markdown, no code fences, no extra text.`
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
    if (!body.category && !body.title && !body.notes) {
      return json({ error: "Pick a category or enter a few keywords first." }, 400)
    }

    // 3) Call Gemini, asking for strict JSON.
    const gemRes = await generateContent(MODEL, apiKey, {
      contents: [{ role: "user", parts: [{ text: buildPrompt(body) }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300,
        responseMimeType: "application/json",
      },
    })
    if (!gemRes || !gemRes.ok) {
      return json({ error: "Copywriter is temporarily unavailable." }, 502)
    }

    const data = await gemRes.json()
    const raw = extractText(data)

    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
    let parsed: { title?: string; alt?: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: "Could not parse AI response." }, 502)
    }

    await logAiUsage("work-copywriter", MODEL, data?.usageMetadata)

    return json({
      title: (parsed.title || "").trim(),
      alt: (parsed.alt || "").trim(),
    })
  } catch (err) {
    console.error("work-copywriter error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
