import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import DocumentSheet from "./DocumentSheet"
import { quotationFileName } from "../../lib/quotationShare"

// The PDF path shared by DocumentView's "Download PDF" and the WhatsApp share.
//
// html2pdf.js (html2canvas + jsPDF) captures the sheet at exactly 794px (A4 at
// 96dpi) at scale 2, as Keystone does, so the page is always a true A4.

// Build a jsPDF from a rendered DocumentSheet element. The caller decides what
// to do with it (save, or turn it into a File for the share sheet).
export async function buildSheetPdf(el, fileStem) {
  const html2pdf = (await import("html2pdf.js")).default
  const prev = { width: el.style.width, minHeight: el.style.minHeight, margin: el.style.margin, boxShadow: el.style.boxShadow }
  el.style.width = "794px"
  el.style.minHeight = "1123px"
  el.style.margin = "0"
  el.style.boxShadow = "none"
  try {
    // Build the PDF, then drop any trailing page the content does not reach.
    // The sheet is exactly one A4 tall, so a fraction of a point of rounding
    // would otherwise spill a blank second page (Keystone: > 1pt tolerance).
    const worker = html2pdf()
      .set({
        margin: 0,
        filename: `${fileStem}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", letterRendering: false },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(el)
      .toPdf()
    const pdf = await worker.get("pdf")
    const canvas = await worker.get("canvas")
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgH = (canvas.height * pageW) / canvas.width
    const ratio = imgH / pageH
    if (ratio > 1 && ratio <= 1.35) {
      // Slightly taller than one A4 (long terms, a few extra lines): scale
      // the whole sheet to fit a single page rather than spilling a footer
      // onto a second one. Beyond ~35% over, let it paginate normally.
      const w = pageW / ratio
      pdf.addPage()
      while (pdf.internal.getNumberOfPages() > 1) pdf.deletePage(1)
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", (pageW - w) / 2, 0, w, pageH)
    } else {
      const needed = Math.max(1, Math.ceil((imgH - 1) / pageH))
      while (pdf.internal.getNumberOfPages() > needed) pdf.deletePage(pdf.internal.getNumberOfPages())
    }
    return pdf
  } finally {
    Object.assign(el.style, prev)
  }
}

// Render a document off screen and build its PDF, for callers that are not
// showing the full-size sheet (the quotation editor only has the scaled
// LivePreview, which must not be captured at its transform).
export async function renderDocumentPdf(doc, settings, type, fileStem) {
  const host = document.createElement("div")
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: "794px", pointerEvents: "none" })
  host.setAttribute("aria-hidden", "true")
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    let el = null
    flushSync(() => {
      root.render(<DocumentSheet ref={(n) => { el = n }} doc={doc} settings={settings} type={type} className="!m-0 !shadow-none" />)
    })
    if (document.fonts?.ready) await document.fonts.ready
    return await buildSheetPdf(el, fileStem)
  } finally {
    root.unmount()
    host.remove()
  }
}

// ---- WhatsApp share ---------------------------------------------------------
//
// A wa.me link carries TEXT only; no web page can put a file into a particular
// WhatsApp chat (the phone app hits the same wall, Ortex.Mobile/src/lib/pdf.ts).
// Two honest routes:
//  - "native": a touch device whose browser can share files (Android Chrome,
//    iOS Safari) gets the OS share sheet with the PDF. The person picks
//    WhatsApp and the chat; the message is on the clipboard for the caption,
//    because WhatsApp drops the text that rides with a document.
//  - "handoff": everywhere else the PDF downloads, the message goes to the
//    clipboard, and the customer's chat opens in a new tab with the message
//    typed in. The person attaches the downloaded file.

function canShareFiles() {
  try {
    if (typeof navigator === "undefined" || !navigator.canShare) return false
    // Desktop Chrome also answers yes and then opens the Windows share panel,
    // which is not where a salesperson at the console expects WhatsApp to be.
    if (!window.matchMedia?.("(pointer: coarse)").matches) return false
    return navigator.canShare({ files: [new File([""], "q.pdf", { type: "application/pdf" })] })
  } catch {
    return false
  }
}

// Call SYNCHRONOUSLY inside the click handler, before any await: a tab opened
// after an async PDF render is a popup the browser blocks, and Safari only lets
// the clipboard be written during the gesture.
// `openChat` false (no phone number) skips the tab: there is no chat to open.
export function beginWhatsAppShare(message, { openChat = true } = {}) {
  const native = canShareFiles()
  const copied = navigator.clipboard?.writeText
    ? navigator.clipboard.writeText(message).then(() => true, () => false)
    : Promise.resolve(false)
  let win = null
  if (!native && openChat) {
    win = window.open("", "_blank")
    if (win) {
      try {
        win.document.title = "Opening WhatsApp"
        win.document.body.style.font = "14px system-ui, sans-serif"
        win.document.body.textContent = "Preparing the quotation PDF, then opening WhatsApp..."
      } catch {
        // A browser that isolates the new tab still navigates it below.
      }
      win.opener = null
    }
  }
  return { native, win, copied, message }
}

export function abandonWhatsAppShare(ctx) {
  try {
    ctx?.win?.close()
  } catch {
    // already gone
  }
}

// Returns { outcome: "shared" | "cancelled" | "handoff", copied, url, opened }.
// "cancelled" means the person closed the OS share sheet: nothing went out, so
// the caller must not mark the quotation sent.
export async function shareQuotationOnWhatsApp(ctx, { doc, settings, waUrl }) {
  const name = quotationFileName(doc)
  let pdf
  try {
    pdf = await renderDocumentPdf(doc, settings, "quotation", name.replace(/\.pdf$/, ""))
  } catch (err) {
    abandonWhatsAppShare(ctx)
    throw err
  }
  const copied = await ctx.copied

  if (ctx.native) {
    try {
      const file = new File([pdf.output("blob")], name, { type: "application/pdf" })
      await navigator.share({ files: [file], title: name.replace(/\.pdf$/, ""), text: ctx.message })
      return { outcome: "shared", copied }
    } catch (err) {
      if (err?.name === "AbortError") return { outcome: "cancelled", copied }
      // NotAllowedError: the render outlived the tap's permission. Fall through
      // to the download + chat route rather than failing the send.
    }
  }

  pdf.save(name)
  let opened = false
  if (waUrl) {
    if (ctx.win && !ctx.win.closed) {
      ctx.win.location.href = waUrl
      opened = true
    } else {
      // Not the "noopener" feature: with it window.open returns null even on
      // success, and a blocked popup could not be told apart.
      const w = window.open(waUrl, "_blank")
      if (w) w.opener = null
      opened = !!w
    }
  } else {
    abandonWhatsAppShare(ctx)
  }
  return { outcome: "handoff", copied, url: waUrl, opened, fileName: name }
}
