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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest"

async function logUsage(usage: Record<string, number> | undefined) {
  try {
    if (!usage) return
    const url = Deno.env.get("SUPABASE_URL")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !service) return
    const client = createClient(url, service)
    await client.from("ai_usage").insert({
      doc: {
        feature: "category-copywriter",
        model: MODEL,
        promptTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        thoughtTokens: usage.thoughtsTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
    })
  } catch {
    /* usage logging must never break the response */
  }
}

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
    const url = Deno.env.get("SUPABASE_URL")!
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!
    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) return json({ error: "Copywriter is not configured (missing GEMINI_API_KEY)." }, 500)

    // 1) Authenticate the caller and confirm they are active staff.
    const authHeader = req.headers.get("Authorization") ?? ""
    const jwt = authHeader.replace(/^bearer\s+/i, "").trim()
    if (!jwt) return json({ error: "Not authenticated" }, 401)

    const { data: userData, error: userErr } = await createClient(url, anon).auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401)

    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const reader = service
      ? createClient(url, service)
      : createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: prof } = await reader
      .from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle()
    if (!prof || prof.active === false || !["admin", "sales"].includes(prof.role)) {
      return json({ error: "Staff access required" }, 403)
    }

    // 2) Validate input.
    const body = await req.json().catch(() => ({}))
    if (!body.name && !body.displayName && !body.description) {
      return json({ error: "Enter a category name or a few keywords first." }, 400)
    }

    // 3) Call Gemini, asking for strict JSON.
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
    let gemRes: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      gemRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(body) }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          },
        }),
      })
      if (gemRes.ok || (gemRes.status !== 500 && gemRes.status !== 503)) break
    }
    if (!gemRes || !gemRes.ok) {
      return json({ error: "Copywriter is temporarily unavailable." }, 502)
    }

    const data = await gemRes.json()
    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text || "")
      .join("")
      .trim()

    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
    let parsed: { intro?: string; seoTitle?: string; seoDescription?: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: "Could not parse AI response." }, 502)
    }

    await logUsage(data?.usageMetadata)

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
