import * as Clipboard from "expo-clipboard"
import { Alert, Linking, Platform, ToastAndroid } from "react-native"

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

async function open(url: string, failure: string): Promise<boolean> {
  try {
    await Linking.openURL(url)
    return true
  } catch {
    // canOpenURL is unreliable across Android 11 package visibility, so we try
    // the intent and report the failure rather than pre-checking and lying.
    // The platform's own toast: this module has no React tree to reach ui/Toast.
    feedback.error()
    if (Platform.OS === "android") ToastAndroid.show(failure, ToastAndroid.SHORT)
    else Alert.alert(failure)
    return false
  }
}

/**
 * Dial with the country code kept: a bare 10-digit mobile becomes +91 (the
 * `whatsappNumber` rule), a number typed with its own code keeps it. Toll-free
 * 1800 numbers and short codes are dialled as typed.
 */
export function callNumber(phone?: string): Promise<boolean> {
  const d = String(phone || "").replace(/\D/g, "")
  if (!d) return Promise.resolve(false)
  feedback.tap()
  const n = whatsappNumber(d)
  return open(/^1800/.test(d) || n.length < 11 ? `tel:${d}` : `tel:+${n}`, "Could not open the phone app")
}

/** Opens the WhatsApp chat, optionally pre-filled with a message. */
export function whatsapp(phone?: string, text?: string): Promise<boolean> {
  const n = whatsappNumber(phone || "")
  if (!n) return Promise.resolve(false)
  feedback.tap()
  const query = text ? `?text=${encodeURIComponent(text)}` : ""
  return open(`https://wa.me/${n}${query}`, "Could not open WhatsApp")
}

export function email(address?: string, subject?: string, body?: string): Promise<boolean> {
  if (!address) return Promise.resolve(false)
  feedback.tap()
  const params: string[] = []
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
  if (body) params.push(`body=${encodeURIComponent(body)}`)
  return open(`mailto:${address}${params.length ? `?${params.join("&")}` : ""}`, "Could not open your email app")
}

export async function copy(value: string): Promise<void> {
  await Clipboard.setStringAsync(value).catch(() => {})
  feedback.tap()
}
