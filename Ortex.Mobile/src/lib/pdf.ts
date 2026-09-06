import { File, Paths } from "expo-file-system"
import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import Share, { Social, type ShareSingleOptions } from "react-native-share"

import { quotationHtml } from "@/documents/quotationHtml"
import type { Quotation } from "@/domain/schema"
import type { Settings } from "@/domain/settings"
import { whatsappNumber } from "@/lib/contact"
import { feedback } from "@/lib/feedback"

// Printing and sharing the quotation PDF.
//
// expo-print hands the HTML to the platform's own renderer (WebKit on iOS,
// Android's PrintDocumentAdapter), so the output is real, selectable text at A4
// rather than the rasterised canvas the console produces with html2canvas.

/** A4 at 72dpi, the unit expo-print measures in. */
const A4 = { width: 595, height: 842 }

async function renderPdf(doc: Quotation, settings: Settings): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html: quotationHtml(doc, settings),
    width: A4.width,
    height: A4.height,
    base64: false,
  })
  // printToFileAsync names the file with a random uuid. Rename it, because this
  // filename is what the customer sees when it lands in their WhatsApp.
  const safeNumber = (doc.number || "draft").replace(/[^\w-]/g, "")
  try {
    const source = new File(uri)
    const target = new File(Paths.cache, `Quotation-${safeNumber}.pdf`)
    if (target.exists) target.delete()
    await source.move(target)
    return target.uri
  } catch {
    // A rename failure is cosmetic — share the original rather than fail.
    return uri
  }
}

/**
 * Render and open the system share sheet. This is the path that actually puts
 * the PDF into WhatsApp, Gmail or Drive; a `wa.me` link can only carry text.
 */
export async function shareQuotationPdf(doc: Quotation, settings: Settings): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device")
  }
  const uri = await renderPdf(doc, settings)
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: `Quotation ${doc.number}`,
  })
  feedback.created()
}

/**
 * Send the PDF straight into ONE customer's WhatsApp chat.
 *
 * `wa.me` cannot do this: a deep link carries text only, so the file would be
 * dropped. react-native-share's `shareSingle` builds the Android intent WhatsApp
 * actually wants — ACTION_SEND at `com.whatsapp` with the number as the chat
 * target and a FileProvider content URI for the attachment — which is the only
 * route that skips both the system share sheet and the contact picker.
 *
 * It returns false rather than throwing when WhatsApp is absent or refuses the
 * intent, so the caller can fall back to the ordinary share sheet. A missed send
 * is not worth an error dialog when the share sheet is one line away.
 */
export async function shareQuotationOnWhatsApp(
  doc: Quotation,
  settings: Settings,
  phone: string,
  message: string,
): Promise<boolean> {
  const number = whatsappNumber(phone)
  if (!number) return false
  try {
    const uri = await renderPdf(doc, settings)
    await Share.shareSingle({
      social: Social.Whatsapp,
      // `whatsAppNumber` is missing from the shipped .d.ts but IS read by the
      // native module (android/.../social/WhatsAppShare.java opens the
      // conversation for it before attaching), so the option is widened here
      // rather than dropped — without it the send falls back to the contact
      // picker, which is the whole thing this function exists to skip.
      whatsAppNumber: number,
      url: uri,
      type: "application/pdf",
      filename: `Quotation-${(doc.number || "draft").replace(/[^\w-]/g, "")}`,
      message,
    } as ShareSingleOptions & { whatsAppNumber: string })
    feedback.created()
    return true
  } catch {
    return false
  }
}

/** Hand the same document to the OS print dialog. */
export async function printQuotation(doc: Quotation, settings: Settings): Promise<void> {
  await Print.printAsync({ html: quotationHtml(doc, settings) })
}
