import * as Clipboard from "expo-clipboard"
import { File, Paths } from "expo-file-system"
import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import { NativeModules, Platform } from "react-native"
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
 * Our own single-intent sender (android/app/src/main/java/.../WhatsAppDocModule.kt).
 * Absent on iOS, and on an Android build made before it existed — hence the
 * optional shape rather than a hard import.
 */
const WhatsAppDoc = NativeModules.WhatsAppDoc as
  | { send(filePath: string, mimeType: string, number: string, message: string): Promise<boolean> }
  | undefined

/**
 * Send the quotation PDF into ONE customer's WhatsApp chat.
 *
 * THE CHAT OPENS AND THE FILE DOES NOT ARRIVE — that is what react-native-share
 * does on this hardware, and why there is a native module here. `shareSingle`
 * with `whatsAppNumber` fires TWO intents ~10ms apart (WhatsAppShare.java): the
 * first opens `com.whatsapp.Conversation` for the number and ignores the
 * attachment, the second carries the file. A Samsung that freezes or defers
 * background starts drops the second, so the salesperson lands in the right
 * chat with nothing in it and no error anywhere — the worst possible failure,
 * because it looks like it worked. Our module sends ONE intent carrying the
 * `jid` and EXTRA_STREAM together: both arrive, or the send visibly fails.
 *
 * WHAT STILL CANNOT BE DONE: WhatsApp honours EXTRA_TEXT as a caption for an
 * IMAGE and drops it for a DOCUMENT. The covering note therefore cannot travel
 * with the PDF by any route, so it goes on the clipboard and the caller says
 * so, ready to paste into WhatsApp's own caption box. The intent carries the
 * text anyway, which costs nothing and starts working if WhatsApp relents.
 *
 * Returns false when WhatsApp is absent or refuses the intent, so the caller
 * can fall back to the ordinary share sheet.
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
    // Before WhatsApp opens, not after: by the time the send screen is up the
    // salesperson is already there to paste it.
    await Clipboard.setStringAsync(message).catch(() => {})

    if (Platform.OS === "android" && WhatsAppDoc) {
      await WhatsAppDoc.send(uri, "application/pdf", number, message)
      feedback.created()
      return true
    }

    // iOS, and any Android build older than the native module: the library's
    // two-intent path is still the only way to address one chat, and it does
    // work where background starts are not being throttled.
    await Share.shareSingle({
      social: Social.Whatsapp,
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
