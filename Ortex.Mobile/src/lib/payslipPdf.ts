import { File, Paths } from "expo-file-system"
import * as Print from "expo-print"
import * as Sharing from "expo-sharing"

import { payslipHtml } from "@/documents/payslipHtml"
import type { Settings } from "@/domain/settings"
import { monthKey, monthLabel, type Payslip } from "@/features/pay/payFormat"
import { feedback } from "@/lib/feedback"

// The payslip PDF, rendered the way lib/pdf.ts renders a quotation: expo-print
// hands the HTML to the platform's own engine at A4, the file is renamed to
// something a person recognises, and expo-sharing opens the share sheet (which
// is also how it is saved to Files or Drive: Android has no "download" for an
// app's private cache).

/** A4 at 72dpi, the unit expo-print measures in. */
const A4 = { width: 595, height: 842 }

async function renderPayslip(slip: Payslip, settings: Settings | null): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html: payslipHtml(slip, settings),
    width: A4.width,
    height: A4.height,
    base64: false,
  })
  try {
    const source = new File(uri)
    const target = new File(Paths.cache, `Payslip-${monthKey(slip.data.month).slice(0, 7)}.pdf`)
    if (target.exists) target.delete()
    await source.move(target)
    return target.uri
  } catch {
    return uri
  }
}

/** Render and open the share sheet: save to Files, send to WhatsApp, mail to a bank. */
export async function sharePayslipPdf(slip: Payslip, settings: Settings | null): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device")
  }
  const uri = await renderPayslip(slip, settings)
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: `Payslip ${monthLabel(slip.data.month)}`,
  })
  feedback.created()
}

/** The same document through the OS print dialog. */
export async function printPayslip(slip: Payslip, settings: Settings | null): Promise<void> {
  await Print.printAsync({ html: payslipHtml(slip, settings) })
}
