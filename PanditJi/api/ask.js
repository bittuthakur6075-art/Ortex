// Text chat with Pandit Ji, streamed back as plain text.
import { GoogleGenAI } from "@google/genai"
import { clientIp, foreignOrigin, overLimit, text } from "../server/limit.js"
import { textSystem } from "../src/lib/prompt.js"
import { poojaById } from "../src/data/poojas.js"

const MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash"
const MAX_MESSAGES = 20
const MAX_CHARS = 2000
const MAX_TOTAL_CHARS = 60_000

function validMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return false
  return messages.at(-1)?.role === "user" && messages.every((m, i) =>
    m?.role === (i % 2 === 0 ? "user" : "assistant") &&
    typeof m.content === "string" &&
    m.content.trim() &&
    m.content.length <= (m.role === "user" ? MAX_CHARS : 20_000)) &&
    messages.reduce((n, m) => n + m.content.length, 0) <= MAX_TOTAL_CHARS
}

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return text("Pandit Ji is not configured yet.", 500)
  if (foreignOrigin(request)) return text("Not allowed.", 403)
  if (overLimit(`ask:${clientIp(request)}`, 12, 60 * 1000) || overLimit("ask:all", 5000, 24 * 60 * 60 * 1000)) return text("Too many questions in a minute. Please wait a little.", 429)

  let body
  try {
    body = await request.json()
  } catch {
    return text("Bad request", 400)
  }
  const pooja = poojaById(body?.pooja)
  if (!pooja?.available || !validMessages(body.messages)) return text("Bad request", 400)

  let stream
  try {
    stream = await new GoogleGenAI({ apiKey }).models.generateContentStream({
      model: MODEL,
      contents: body.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      config: { systemInstruction: textSystem(pooja) },
    })
  } catch (err) {
    console.error("ask error", err)
    return text("Pandit Ji is not available right now. Please try again.", 502)
  }

  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.text) controller.enqueue(encoder.encode(chunk.text))
        }
      } catch (err) {
        console.error("ask stream error", err)
        controller.enqueue(encoder.encode("\n\nSorry, something went wrong. Please ask again."))
      }
      controller.close()
    },
  }), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } })
}
