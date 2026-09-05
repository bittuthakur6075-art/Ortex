import { File, Paths } from "expo-file-system"
import * as Print from "expo-print"
import * as Sharing from "expo-sharing"

import { quotationHtml } from "@/documents/quotationHtml"
import type { Quotation } from "@/domain/schema"
import type { Settings } from "@/domain/settings"
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

/** Hand the same document to the OS print dialog. */
export async function printQuotation(doc: Quotation, settings: Settings): Promise<void> {
  await Print.printAsync({ html: quotationHtml(doc, settings) })
}
