/**
 * The phone's route to the console's AI edge functions.
 *
 * Nothing AI runs on the handset and no key lives here: every call goes through
 * a staff-only function (`ai-writer`, `product-copywriter`, `product-image-studio`)
 * that holds the Gemini or Cloudflare key server-side, the same functions the
 * console calls, so a prompt fixed there is fixed on both.
 */

import { invokeEdge } from "@/lib/edgeFunction"

export type AiWriteMode = "write" | "improve" | "shorten" | "expand" | "formal" | "friendly" | "fix"
export type AiFormat = "paragraph" | "lines" | "short" | "message"

export type AiWriteOptions = {
  /** What the field is, in plain English: "Product description for the website catalogue". */
  purpose: string
  mode: AiWriteMode
  current?: string
  instruction?: string
  /** The record the field belongs to. Never unrelated customer data: the free tier may learn from prompts. */
  context?: Record<string, unknown>
  format?: AiFormat
  maxChars?: number
}

export async function aiWrite(opts: AiWriteOptions): Promise<{ text?: string; error?: string }> {
  const res = await invokeEdge<{ text?: string }>("ai-writer", opts)
  if (res.error) return { error: res.error }
  const text = (res.data?.text || "").trim()
  return text ? { text } : { error: "The AI writer returned nothing. Try again." }
}

export type ProductCopy = {
  name: string
  description: string
  category: string
  material: string
  usedPhoto: boolean
}

export async function aiProductCopy(opts: {
  name?: string
  category?: string
  material?: string
  basePrice?: number
  unit?: string
  moq?: number
  allowedCategories: string[]
  imageUrl?: string
}): Promise<{ data?: ProductCopy; error?: string }> {
  const res = await invokeEdge<Partial<ProductCopy>>("product-copywriter", opts)
  if (res.error) return { error: res.error }
  const d = res.data || {}
  return {
    data: {
      name: d.name || "",
      description: d.description || "",
      category: d.category || "",
      material: d.material || "",
      usedPhoto: Boolean(d.usedPhoto),
    },
  }
}

export type PhotoStyle = "studio" | "gradient" | "lifestyle" | "clean" | "lighting"

export async function aiEnhancePhoto(opts: {
  imageUrl: string
  style: PhotoStyle
  instruction?: string
  productName?: string
}): Promise<{ image?: string; error?: string }> {
  const res = await invokeEdge<{ image?: string }>("product-image-studio", opts)
  if (res.error) return { error: res.error }
  return res.data?.image ? { image: res.data.image } : { error: "The photo studio returned nothing. Try again." }
}

/** Only a photo already in our storage can be sent to the studio or the copywriter. */
export function isUploadedPhoto(uri?: string | null): uri is string {
  return typeof uri === "string" && /^https:\/\/.+\/storage\/v1\/object\/public\//.test(uri)
}
