// "India business pulse": a short daily briefing on national news, events and
// market mood that a corporate-gifting sales caller can use to open doors
// (budget week, election season, IPL, big trade fairs, weather disruptions).
// Generated once a day with Gemini + Google Search grounding and cached on
// settings.telecaller.pulse so every brief reads the same text. No stock tips:
// prices do not sell diaries, mood does.

import { generateContent, extractText, logAiUsage } from "./gemini.ts"
import type { Db } from "./auth.ts"
import { nowInIndia } from "./telecallerCalendar.ts"

const PULSE_MODEL = Deno.env.get("GEMINI_PULSE_MODEL") || "gemini-2.5-flash"
const FRESH_MS = 20 * 60 * 60 * 1000

export type Pulse = { text: string; at: string; model?: string; sources?: string[] }

export async function readPulse(db: Db): Promise<Pulse | null> {
  const { data } = await db.from("settings").select("doc").eq("id", true).maybeSingle()
  const p = data?.doc?.telecaller?.pulse
  return p && typeof p.text === "string" && p.text.trim() ? p as Pulse : null
}

export const isFresh = (p: Pulse | null) => !!p && Date.now() - new Date(p.at).getTime() < FRESH_MS

/** Regenerate the pulse with live search and store it. Returns the new pulse. */
export async function refreshPulse(db: Db): Promise<Pulse> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set")
  const now = nowInIndia()
  const prompt = `Today is ${now.text}. You are the research desk for a B2B sales team at Ortex Industries, a New Delhi manufacturer of customised corporate gifts and promotional products (keychains, diaries, bottles, lanyards, badges, acrylic/MDF items, trophies).

Using web search, write an "India business pulse" for their telecallers: plain text, at most 12 short lines, no headings, no markdown, no bullet symbols other than a leading dash.
Cover only what helps a sales conversation in the next 30 days:
- 3 to 5 national news items or upcoming events that drive corporate buying or gifting (union/state budgets, elections, cricket seasons like IPL, major trade fairs and expos, big conferences, new-company or IPO booms, policy changes affecting SMEs, festivals with unusual timing, weather or transport disruptions that affect delivery).
- One line on overall business mood (e.g. "markets buoyant, companies spending on year-end gifting" or "cautious quarter, pitch value and lower MOQs"). No index levels, no stock tips.
- 3 conversational hooks the caller can use to open a topic with a customer, each one sentence, natural, in English (the caller will translate to Hindi).
Facts only from the search results; if something is uncertain, leave it out. End with the line "As of ${now.ymd}".`

  const res = await generateContent(PULSE_MODEL, apiKey, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.3 },
  })
  if (!res.ok) throw new Error(`Pulse: Gemini ${res.status} ${await res.text().catch(() => "")}`)
  const data = await res.json()
  await logAiUsage("telecaller-pulse", PULSE_MODEL, data?.usageMetadata)
  const text = extractText(data).slice(0, 4000)
  if (!text) throw new Error("Pulse: empty response")
  const sources = (data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .map((c: { web?: { uri?: string } }) => c.web?.uri)
    .filter((u: unknown): u is string => typeof u === "string")
    .slice(0, 8)
  const pulse: Pulse = { text, at: new Date().toISOString(), model: PULSE_MODEL, sources }

  const { data: row } = await db.from("settings").select("doc").eq("id", true).maybeSingle()
  const doc = row?.doc || {}
  await db.from("settings").upsert({ id: true, doc: { ...doc, telecaller: { ...(doc.telecaller || {}), pulse } } })
  return pulse
}

/** Fresh pulse, regenerating if stale. Never throws: a failed refresh returns the old text or null. */
export async function ensurePulse(db: Db): Promise<Pulse | null> {
  const current = await readPulse(db)
  if (isFresh(current)) return current
  try {
    return await refreshPulse(db)
  } catch (e) {
    console.error("pulse refresh failed:", e instanceof Error ? e.message : e)
    return current
  }
}
