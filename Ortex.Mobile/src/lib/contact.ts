import * as Clipboard from "expo-clipboard"
import { Linking } from "react-native"

import { feedback } from "@/lib/feedback"

// Reaching a customer. This is the whole point of the Contacts tab, so every
// helper here is deliberately forgiving about how a number was typed — leads
// arrive from a website form, a voice assistant and manual entry, and none of
// them agree on whether to include +91.

/** Digits only, last 10 kept — the same key the console folds voice calls by. */
export function phoneDigits(phone = ""): string {
  const d = String(phone).replace(/\D/g, "")
  return d.length > 10 ? d.slice(-10) : d
}

/**
 * wa.me needs a full international number, but leads are normalised to a bare
 * 10-digit Indian mobile before saving, so add the country code.
 * PORT OF `whatsappNumber` in Ortex.Admin/src/lib/customerStats.js.
 */
export function whatsappNumber(phone = ""): string {
  const d = String(phone).replace(/\D/g, "")
  if (d.length === 10) return `91${d}`
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`
  return d
}

export function prettyPhone(phone = ""): string {
  const ten = phoneDigits(phone)
  return ten.length === 10 ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : phone || ""
}

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url)
    return true
  } catch {
    // canOpenURL is unreliable across Android 11 package visibility, so we try
    // the intent and report the failure rather than pre-checking and lying.
    feedback.error()
    return false
  }
}

export function callNumber(phone?: string): Promise<boolean> {
  const d = String(phone || "").replace(/\D/g, "")
  if (!d) return Promise.resolve(false)
  feedback.tap()
  return open(`tel:${d}`)
}

/** Opens the WhatsApp chat, optionally pre-filled with a message. */
export function whatsapp(phone?: string, text?: string): Promise<boolean> {
  const n = whatsappNumber(phone || "")
  if (!n) return Promise.resolve(false)
  feedback.tap()
  const query = text ? `?text=${encodeURIComponent(text)}` : ""
  return open(`https://wa.me/${n}${query}`)
}

export function email(address?: string, subject?: string, body?: string): Promise<boolean> {
  if (!address) return Promise.resolve(false)
  feedback.tap()
  const params: string[] = []
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
  if (body) params.push(`body=${encodeURIComponent(body)}`)
  return open(`mailto:${address}${params.length ? `?${params.join("&")}` : ""}`)
}

export async function copy(value: string): Promise<void> {
  await Clipboard.setStringAsync(value).catch(() => {})
  feedback.tap()
}
