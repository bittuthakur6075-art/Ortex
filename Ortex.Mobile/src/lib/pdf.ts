import * as Clipboard from "expo-clipboard"
import { File, Paths } from "expo-file-system"
import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import { NativeModules, Platform } from "react-native"
import Share, { Social, type ShareSingleOptions } from "react-native-share"

import { quotationHtml } from "@/documents/quotationHtml"
import type { Quotation } from "@/domain/schema"
import type { Settings } from "@/domain/settings"
import { whatsapp, whatsappNumber } from "@/lib/contact"
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
  | {
      send(filePath: string, mimeType: string, number: string, message: string): Promise<boolean>
      firstPageAsImage(pdfPath: string): Promise<string>
    }
  | undefined

/**
 * Put the quotation in front of ONE customer, in their own WhatsApp chat, with
 * the covering message attached to it rather than trailing after it.
 *
 * WHY A PICTURE AND NOT THE PDF. WhatsApp keeps a caption on an IMAGE and
 * throws it away on a DOCUMENT — that is its rule, not a bug in the intent, and
 * it is why every earlier attempt landed the file with no message. So the first
 * page is rasterised (natively, PdfRenderer at 150dpi) and sent as a picture
 * WITH the message as its caption: one message, both things, nothing to paste.
 * `attachQuotationPdf` then sends the real document as a second attachment, so
 * the customer still gets something they can download and forward.
 *
 * Everything else here is the hard-won part: ONE intent carrying `jid` and
 * EXTRA_STREAM together (react-native-share fires two ~10ms apart and a Samsung
 * that throttles background starts drops the second, landing you in the right
 * chat with nothing in it), and ClipData plus an explicit package grant, because
 * FLAG_GRANT_READ_URI_PERMISSION never looks inside extras and WhatsApp cannot
 * read a URI it was not granted — silently, with no error.
 *
 * Returns false when WhatsApp is absent or refuses, so the caller falls back to
 * the ordinary share sheet.
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
    // The clipboard stays useful whatever happens next: a caption can be
    // retyped, and on the fallback paths there is no caption at all.
    await Clipboard.setStringAsync(message).catch(() => {})

    if (Platform.OS === "android" && WhatsAppDoc) {
      const image = await WhatsAppDoc.firstPageAsImage(uri)
      await WhatsAppDoc.send(image, "image/png", number, message)
      feedback.created()
      return true
    }

    // iOS, and any Android build older than the native module.
    await Share.shareSingle({
      social: Social.Whatsapp,
      whatsAppNumber: number,
      url: uri,
      type: "application/pdf",
      filename: `Quotation-${(doc.number || "draft").replace(/[^w-]/g, "")}`,
      message,
    } as ShareSingleOptions & { whatsAppNumber: string })
    feedback.created()
    return true
  } catch {
    return false
  }
}

/**
 * The document itself, into the same chat, as a second attachment. No caption —
 * WhatsApp would drop it, and the message already went with the picture.
 */
export async function attachQuotationPdf(
  doc: Quotation,
  settings: Settings,
  phone: string,
): Promise<boolean> {
  const number = whatsappNumber(phone)
  if (!number) return false
  try {
    const uri = await renderPdf(doc, settings)
    if (Platform.OS === "android" && WhatsAppDoc) {
      await WhatsAppDoc.send(uri, "application/pdf", number, "")
      feedback.created()
      return true
    }
    await shareQuotationPdf(doc, settings)
    return true
  } catch {
    return false
  }
}

/**
 * Open the same customer's chat with the covering note already typed into the
 * compose box, for them to send.
 *
 * This is the OTHER half of "send them the quotation": the PDF intent cannot
 * carry the note (WhatsApp drops EXTRA_TEXT for a document), so the note has to
 * travel as its own message. No app can press send on someone's behalf —
 * WhatsApp always requires the human tap — so the most that can be automated is
 * landing in the right chat with the right words already in the box.
 */
export function sendQuotationMessage(phone: string, message: string): Promise<boolean> {
  return whatsapp(phone, message)
}

/** Hand the same document to the OS print dialog. */
export async function printQuotation(doc: Quotation, settings: Settings): Promise<void> {
  await Print.printAsync({ html: quotationHtml(doc, settings) })
}
