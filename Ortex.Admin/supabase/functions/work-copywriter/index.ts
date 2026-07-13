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
        feature: "work-copywriter",
        model: MODEL,
        promptTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        thoughtTokens: usage.thoughtsTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
    })
  } catch (_) {
    /* usage logging must never break the response */
  }
}

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
    if (!body.category && !body.title && !body.notes) {
      return json({ error: "Pick a category or enter a few keywords first." }, 400)
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
            maxOutputTokens: 300,
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
    let parsed: { title?: string; alt?: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: "Could not parse AI response." }, 502)
    }

    await logUsage(data?.usageMetadata)

    return json({
      title: (parsed.title || "").trim(),
      alt: (parsed.alt || "").trim(),
    })
  } catch (err) {
    console.error("work-copywriter error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
