// Gemini REST helpers shared by the copywriter / research / chat functions.
// The API key stays server-side; callers pass it in from Deno.env.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

/**
 * POST a generateContent payload, retrying up to `retries` times on 500/503
 * (the statuses Gemini returns when a node is overloaded). Resolves to the
 * last Response so callers keep their own status handling.
 */
export async function generateContent(
  model: string,
  apiKey: string,
  payload: Record<string, unknown>,
  retries = 3,
): Promise<Response> {
  const endpoint = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`
  let res!: Response
  for (let attempt = 0; attempt < retries; attempt++) {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok || (res.status !== 500 && res.status !== 503)) break
    // Drain the body before retrying so the connection can be reused. The final
    // attempt's body is left intact so callers can still read Gemini's error.
    if (attempt < retries - 1) await res.body?.cancel().catch(() => {})
  }
  return res
}

/** Concatenate the non-thought text parts of the first candidate. */
// deno-lint-ignore no-explicit-any
export function extractText(data: any): string {
  return (data?.candidates?.[0]?.content?.parts || [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text || "")
    .join("")
    .trim()
}

/**
 * Record one ai_usage row. Never throws — usage logging must not break the
 * response. Missing token counts are stored as 0 so request counts stay right.
 */
export async function logAiUsage(
  feature: string,
  model: string,
  usage: Record<string, number> | undefined,
) {
  try {
    const url = Deno.env.get("SUPABASE_URL")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !service) return
    await createClient(url, service).from("ai_usage").insert({
      doc: {
        feature,
        model,
        promptTokens: usage?.promptTokenCount || 0,
        outputTokens: usage?.candidatesTokenCount || 0,
        thoughtTokens: usage?.thoughtsTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
      },
    })
  } catch {
    /* swallow */
  }
}
