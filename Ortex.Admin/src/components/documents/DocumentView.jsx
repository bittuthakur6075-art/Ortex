import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Printer, X, Download } from "../ui/Icons"
import DocumentSheet from "./DocumentSheet"

// Full-screen, printable A4 document overlay for a quotation or tax invoice.
// Overlay chrome ported from the Keystone invoice document: a dark fixed
// toolbar (Print / Download PDF / close) over the sheet, portaled to <body>
// so printing can drop the whole app shell. The sheet itself is DocumentSheet.
//
// PDF: html2pdf.js (html2canvas + jsPDF) captures the sheet at exactly 794px
// (A4 at 96dpi) at scale 2, as Keystone does, so the page is always a true A4.
// `type` is "quotation" | "invoice".
export default function DocumentView({ open, onClose, doc, settings, type }) {
  const sheetRef = useRef(null)
  const [busy, setBusy] = useState(false)

  // Mark <body> while open so the print stylesheet can hide the app shell.
  useEffect(() => {
    if (!open) return
    document.body.classList.add("doc-open")
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.classList.remove("doc-open")
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open || !doc) return null

  const isInvoice = type === "invoice"
  const heading = isInvoice ? "Tax invoice" : "Quotation"
  const fileStem = `${isInvoice ? "Invoice" : "Quotation"}-${doc.number || "draft"}`

  const print = () => window.print()

  const download = async () => {
    const el = sheetRef.current
    if (!el) return
    setBusy(true)
    try {
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
        pdf.save(`${fileStem}.pdf`)
        toast.success(`Downloaded ${fileStem}.pdf`)
      } finally {
        Object.assign(el.style, prev)
      }
    } catch (err) {
      console.error(err)
      toast.error("Could not generate the PDF.")
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="doc-overlay" role="dialog" aria-modal="true" aria-label={`${heading} ${doc.number || "draft"}`}>
      <div className="doc-toolbar no-print">
        <span className="doc-toolbar-title">
          {heading} {doc.number || "draft"}
          {doc.customer && (doc.customer.company || doc.customer.name) && <small>{doc.customer.company || doc.customer.name}</small>}
        </span>
        <button type="button" className="doc-tb-btn ghost" onClick={print}>
          <Printer className="h-4 w-4" /> Print
        </button>
        <button type="button" className="doc-tb-btn primary" onClick={download} disabled={busy}>
          <Download className="h-4 w-4" /> {busy ? "Preparing…" : "Download PDF"}
        </button>
        <button type="button" className="doc-tb-close" onClick={onClose} aria-label="Close">
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="doc-scroll">
        <DocumentSheet ref={sheetRef} doc={doc} settings={settings} type={type} />
      </div>
    </div>,
    document.body,
  )
}
