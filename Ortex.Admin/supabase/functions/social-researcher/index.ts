// Edge Function: social-researcher
//
// Step 1 of the social pipeline. Reads the live catalogue (products, categories,
// recent work photos) and asks Gemini for grounded post ideas — each with a
// hook, a caption, hashtags, and an image prompt that social-creative can run.
//
// Ideas are RETURNED, not written. The module creates the rows so a human sees
// every idea before it becomes a draft. Callable only by active staff.
//
// Deploy:
//   supabase functions deploy social-researcher
//   supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
//   (optional) supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest

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
        feature: "social-researcher",
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

const IDEAS_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          hook: { type: "string" },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          imagePrompt: { type: "string" },
          productName: { type: "string" },
        },
        required: ["topic", "hook", "caption", "hashtags", "imagePrompt"],
      },
    },
  },
  required: ["ideas"],
}

function buildPrompt(ctx: { products: string; categories: string; angle: string; count: number; recent: string }) {
  return `You are the social media strategist for Ortex Industries, an Indian manufacturer of customized products: MDF items, acrylic items, lanyards and ID card accessories, badges, examination boards, clipboards and writing pads, corporate gifts, and OEM / white-label production. The audience on Instagram and the Facebook Page is Indian B2B buyers: HR and admin teams, school and university procurement, event organisers, and resellers.

Our live catalogue:
${ctx.products || "(no products listed)"}

Our categories:
${ctx.categories || "(none)"}

Captions we have already used recently — do NOT repeat these angles:
${ctx.recent || "(none yet)"}

${ctx.angle ? `The user asked for this angle specifically: ${ctx.angle}` : "Pick the angles yourself; vary them across the set."}

Produce exactly ${ctx.count} DISTINCT post ideas. For each:
- "topic": 3 to 6 words naming the angle internally, Title Case.
- "hook": one line, plain internal English, on why this post earns attention from a buyer.
- "caption": the real Instagram caption. Indian English, 2 to 4 short paragraphs, under 500 characters total. Lead with the buyer's problem, not with our name. Concrete and specific. End with a clear call to action (DM, WhatsApp, or link in bio). No em dashes. No emoji spam; at most two, only if they earn their place.
- "hashtags": 8 to 12 relevant hashtags WITHOUT the leading '#'. Mix broad (corporategifting) and niche (lanyardmanufacturer). Lowercase.
- "imagePrompt": a detailed prompt for an image model to render ONE square advertising creative. Describe subject, materials, composition, lighting, and background. It must describe a PHOTOREALISTIC product shot of something Ortex actually makes, per the catalogue above. Do not ask for any text, logo, watermark, or lettering in the image; captions carry the words.
- "productName": the catalogue product this is grounded in, copied exactly, or "" if it spans several.

Hard rules: never invent a client name, a price, a discount, a certification, an award, a delivery time, or a production statistic. Nothing that is not supported by the catalogue above. If you cannot ground a claim, write about the buyer's problem instead.

Return ONLY a JSON object with one key "ideas".`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!
    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) return json({ error: "Research is not configured (missing GEMINI_API_KEY)." }, 500)

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

    const body = await req.json().catch(() => ({}))
    const count = Math.min(Math.max(Number(body.count) || 3, 1), 6)
    const angle = String(body.angle || "").slice(0, 500)

    // 2) Ground the model in the real catalogue rather than its own guesses.
    const [{ data: products }, { data: categories }, { data: recent }] = await Promise.all([
      reader.from("products").select("id, doc").limit(60),
      reader.from("categories").select("doc").limit(30),
      reader.from("social").select("doc").limit(20).order("created_at", { ascending: false }),
    ])

    const productLines = (products || [])
      .map((r: { doc: Record<string, unknown> }) => r.doc)
      .filter((d) => d && d.status !== "archived" && d.name)
      .map((d) => `- ${d.name}${d.category ? ` (${d.category})` : ""}${d.material ? `, material: ${d.material}` : ""}${d.moq ? `, MOQ ${d.moq}` : ""}`)
      .join("\n")

    const categoryLines = (categories || [])
      .map((r: { doc: Record<string, unknown> }) => r.doc)
      .filter((d) => d && d.active !== false && d.name)
      .map((d) => `- ${d.name}`)
      .join("\n")

    const recentLines = (recent || [])
      .map((r: { doc: Record<string, unknown> }) => r.doc)
      .filter((d) => d && d.topic)
      .map((d) => `- ${d.topic}`)
      .join("\n")

    if (!productLines && !categoryLines) {
      return json({ error: "Add a few products or categories first so the research has something to work from." }, 400)
    }

    // 3) Call Gemini, asking for strict JSON.
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
    let gemRes: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      gemRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: buildPrompt({ products: productLines, categories: categoryLines, angle, count, recent: recentLines }) }],
          }],
          generationConfig: {
            temperature: 0.9, // ideas should vary run to run
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
            responseSchema: IDEAS_SCHEMA,
          },
        }),
      })
      if (gemRes.ok || (gemRes.status !== 500 && gemRes.status !== 503)) break
    }
    if (!gemRes || !gemRes.ok) {
      console.error("social-researcher gemini error", gemRes?.status, await gemRes?.text().catch(() => ""))
      return json({ error: "Research is temporarily unavailable." }, 502)
    }

    const data = await gemRes.json()
    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text || "")
      .join("")
      .trim()

    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
    let parsed: { ideas?: Record<string, unknown>[] }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: "Could not parse AI response." }, 502)
    }

    await logUsage(data?.usageMetadata)

    // Map the model's productName back onto a real catalogue id — never trust it
    // to hand us an id directly.
    const byName = new Map(
      (products || [])
        .map((r: { doc: Record<string, unknown> }) => r.doc)
        .filter((d) => d?.name)
        .map((d) => [String(d.name).toLowerCase(), d]),
    )
    const productRows = products || []

    const ideas = (parsed.ideas || []).slice(0, count).map((i) => {
      const name = String(i.productName || "").toLowerCase()
      const hit = byName.get(name)
      const row = hit
        ? productRows.find((r: { doc: Record<string, unknown> }) => String(r.doc?.name || "").toLowerCase() === name)
        : null
      return {
        topic: String(i.topic || "").trim(),
        hook: String(i.hook || "").trim(),
        caption: String(i.caption || "").trim(),
        hashtags: (Array.isArray(i.hashtags) ? i.hashtags : [])
          .map((h: unknown) => String(h).replace(/^#/, "").trim())
          .filter(Boolean)
          .slice(0, 15),
        imagePrompt: String(i.imagePrompt || "").trim(),
        productId: (row as { id?: string } | null)?.id || null,
      }
    }).filter((i) => i.topic && i.caption)

    if (!ideas.length) return json({ error: "The model returned no usable ideas. Try again." }, 502)

    return json({ ideas })
  } catch (err) {
    console.error("social-researcher error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
