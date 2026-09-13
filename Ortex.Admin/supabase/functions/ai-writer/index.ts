// Edge Function: ai-writer
//
// The one writer behind every "Write with AI" button in the console and the
// field-sales app. A form does not get its own function: it names WHAT the field
// is (`purpose`), hands over the record around it (`context`), and says what to
// do (`mode`). One prompt, one set of house rules, one usage row per call, so a
// rule added here (no em dashes, never invent a price) reaches every form at once.
//
// Gemini Flash-Lite on the free tier. That tier may use prompts to improve
// Google's products, which is why `context` is for the record being written and
// callers must not stuff unrelated customer data into it.
//
// Callable only by active staff; the key never leaves the server.
//
// Deploy:
//   supabase functions deploy ai-writer
//   supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
//   (optional) supabase secrets set GEMINI_MODEL=gemini-flash-lite-latest

import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { extractText, generateContent, logAiUsage } from "../_shared/gemini.ts"

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest"

type Mode = "write" | "improve" | "shorten" | "expand" | "formal" | "friendly" | "fix"

const MODES: Record<Mode, { task: string; temperature: number }> = {
  write: { task: "Write this field from scratch using the context. Ignore the current text unless it holds useful facts.", temperature: 0.8 },
  improve: { task: "Rewrite the current text so it is clearer, more persuasive and better organised. Keep every fact it states.", temperature: 0.6 },
  shorten: { task: "Make the current text noticeably shorter. Keep the key facts, drop repetition and filler.", temperature: 0.4 },
  expand: { task: "Expand the current text with more useful detail drawn from the context. Do not pad.", temperature: 0.7 },
  formal: { task: "Rewrite the current text in a formal, professional business tone. Keep every fact.", temperature: 0.5 },
  friendly: { task: "Rewrite the current text in a warm, friendly but professional tone. Keep every fact.", temperature: 0.6 },
  fix: { task: "Fix spelling, grammar and punctuation in the current text. Change nothing else.", temperature: 0.1 },
}

/** How the answer should be laid out, because a terms list and a paragraph are not the same field. */
const FORMATS: Record<string, string> = {
  paragraph: "Plain prose in one or two short paragraphs.",
  lines: "One item per line. No bullet symbols, numbers or dashes at the start of a line.",
  short: "A single short line.",
  message: "A short message suitable for WhatsApp or email. Plain text, line breaks allowed.",
}

const MAX_CONTEXT_CHARS = 4000

function contextBlock(context: unknown): string {
  if (!context || typeof context !== "object") return "(none)"
  // Drop empty values so the model is not told a field exists and is blank.
  const cleaned = Object.fromEntries(
    Object.entries(context as Record<string, unknown>).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && !v.length),
    ),
  )
  const text = JSON.stringify(cleaned, null, 1)
  return text.length > MAX_CONTEXT_CHARS ? text.slice(0, MAX_CONTEXT_CHARS) + "…" : text
}

function buildPrompt(body: Record<string, unknown>, mode: Mode) {
  const maxChars = Math.min(Math.max(Number(body.maxChars) || 0, 0), 4000)
  const format = FORMATS[String(body.format || "paragraph")] || FORMATS.paragraph
  const current = String(body.current || "").slice(0, 4000)
  const instruction = String(body.instruction || "").trim().slice(0, 500)

  return `You write text for Ortex Industries, an Indian manufacturer of customised MDF and acrylic products, lanyards, badges, trophies, corporate gifts and OEM/white-label production. The reader is a B2B buyer or a colleague at Ortex.

FIELD: ${String(body.purpose || "A text field").slice(0, 300)}

TASK: ${MODES[mode].task}
${instruction ? `EXTRA INSTRUCTION FROM THE USER: ${instruction}\n` : ""}
CONTEXT (the record this field belongs to):
${contextBlock(body.context)}

CURRENT TEXT:
${current || "(empty)"}

RULES:
- Indian English. Plain text only: no markdown, no asterisks, no headings, no emojis.
- Never use em dashes or en dashes. Use commas, full stops or "and".
- Never invent prices, discounts, quantities, dates, deadlines, phone numbers, emails, GST numbers, certifications, awards or specifications that are not in the context or current text.
- If the context is thin, stay general rather than making details up.
- Layout: ${format}
${maxChars ? `- Stay under ${maxChars} characters.\n` : ""}- Return ONLY the finished text for the field. No preamble, no quotes around it, no explanation.`
}

/** Scrub what the rules forbid but models still sometimes do. */
function tidy(text: string, format: string) {
  let out = text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\s*[—–]\s*/g, ", ")
    .trim()
  if (format === "lines") {
    out = out
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .join("\n")
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) return json({ error: "The AI writer is not configured (missing GEMINI_API_KEY)." }, 500)

    const staff = await requireStaff(req)
    if (staff instanceof Response) return staff

    const body = await req.json().catch(() => ({}))
    const mode = (String(body.mode || "write") as Mode) in MODES ? (String(body.mode || "write") as Mode) : "write"
    if (mode !== "write" && !String(body.current || "").trim()) {
      return json({ error: "There is no text to rewrite yet. Use Write instead." }, 400)
    }
    if (!String(body.purpose || "").trim()) return json({ error: "Missing purpose" }, 400)

    const gemRes = await generateContent(MODEL, apiKey, {
      contents: [{ role: "user", parts: [{ text: buildPrompt(body, mode) }] }],
      generationConfig: { temperature: MODES[mode].temperature, maxOutputTokens: 900 },
    })
    if (!gemRes.ok) {
      const status = gemRes.status
      return json(
        {
          error:
            status === 429
              ? "The AI writer is busy right now (free daily limit). Try again in a minute."
              : "The AI writer is temporarily unavailable.",
        },
        status === 429 ? 429 : 502,
      )
    }

    const data = await gemRes.json()
    const text = tidy(extractText(data), String(body.format || "paragraph"))
    if (!text) return json({ error: "The AI writer returned nothing. Try again." }, 502)

    await logAiUsage("writer", MODEL, data?.usageMetadata)
    return json({ text })
  } catch (err) {
    console.error("ai-writer error", err)
    return json({ error: "Something went wrong." }, 500)
  }
})
