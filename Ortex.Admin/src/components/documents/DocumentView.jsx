import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Printer, X, Download, MessageCircle } from "../ui/Icons"
import DocumentSheet from "./DocumentSheet"
import { buildSheetPdf } from "./documentPdf"

// Full-screen, printable A4 document overlay for a quotation or tax invoice.
// Overlay chrome ported from the Keystone invoice document: a dark fixed
// toolbar (Print / Download PDF / close) over the sheet, portaled to <body>
// so printing can drop the whole app shell. The sheet itself is DocumentSheet.
//
// PDF: buildSheetPdf (documentPdf.jsx), html2pdf.js at a true A4.
// `type` is "quotation" | "invoice". `onShareWhatsApp(doc)` is optional: when
// given (a saved quotation), the toolbar offers "Share on WhatsApp" and the
// caller runs the share, since it also owns the status change.
export default function DocumentView({ open, onClose, doc, settings, type, onShareWhatsApp }) {
  const sheetRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)

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
      const pdf = await buildSheetPdf(el, fileStem)
      pdf.save(`${fileStem}.pdf`)
      toast.success(`Downloaded ${fileStem}.pdf`)
    } catch (err) {
      console.error(err)
      toast.error("Could not generate the PDF.")
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    if (!onShareWhatsApp) return
    setSharing(true)
    try {
      await onShareWhatsApp(doc)
    } finally {
      setSharing(false)
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
        {onShareWhatsApp && doc.id && (
          <button type="button" className="doc-tb-btn ghost" onClick={share} disabled={sharing}>
            <MessageCircle className="h-4 w-4" /> {sharing ? "Preparing…" : "Share on WhatsApp"}
          </button>
        )}
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
