import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { convertQuotationToInvoice, updateQuotation } from "../../data/domain/domain"
import { notifyMessage, notifyQuotationSent } from "../../services/notify"
import { beginWhatsAppShare, renderDocumentPdf, shareQuotationOnWhatsApp } from "../../components/documents/documentPdf"
import { hasPhone, quotationFileName, quotationShareMessage, whatsappLink } from "../../lib/quotationShare"

// Every outward action a quotation takes, shared by the list, the editor and
// the preview-and-send screen. A send stamps `sentAt` and appends to
// `sendLog`, so the list can say when it went and the send screen can show
// the history; a status change stamps `statusAt[status]`.

const stamp = () => new Date().toISOString()

function sentPatch(q, channel, extra = {}) {
  const at = stamp()
  return {
    status: ["draft", "expired", "sent"].includes(q.status) ? "sent" : q.status,
    sentAt: at,
    sendLog: [...(q.sendLog || []), { at, channel, ...extra }],
  }
}

// Email the quotation (EmailJS or mailto per settings). Returns true when the
// send went through.
export async function sendQuotation(q, settings) {
  if (!q?.id) {
    toast.error("Save the quotation first")
    return false
  }
  const res = await notifyQuotationSent(q, settings)
  const m = notifyMessage(res)
  if (res?.error) {
    toast.error(m?.text || res.error)
    return false
  }
  if (m) toast[m.tone === "success" ? "success" : "message"](m.text)
  await repo.update("quotations", q.id, sentPatch(q, "email", { to: q.customer?.email || "" }))
  return true
}

// Share the PDF on WhatsApp. `ctx` comes from beginWhatsAppShare, which the
// click handler must call before its first await (popup and clipboard rules);
// documentPdf.jsx explains why the PDF cannot be put into the chat itself.
export async function shareOnWhatsApp(q, settings, ctx) {
  let res
  try {
    res = await shareQuotationOnWhatsApp(ctx, { doc: q, settings, waUrl: whatsappLink(q.customer?.phone, ctx.message) })
  } catch (err) {
    console.error(err)
    toast.error("Could not generate the PDF.")
    return false
  }
  if (res.outcome === "cancelled") return false
  const copied = res.copied ? "The message is copied too, paste it as the caption." : undefined
  if (res.outcome === "shared") {
    toast.success("Quotation shared", { description: copied })
  } else if (!res.url) {
    toast.message(`${res.fileName} downloaded`, { description: "No phone number on this quotation, so no chat was opened." })
    return false
  } else if (res.opened) {
    toast.success("PDF downloaded, attach it in the chat", { description: res.copied ? "The message is typed in and also copied." : undefined })
  } else {
    toast.message("PDF downloaded, attach it in the chat", {
      description: "The browser blocked the new tab.",
      action: { label: "Open WhatsApp", onClick: () => window.open(res.url, "_blank") },
    })
  }
  if (q.id) await repo.update("quotations", q.id, sentPatch(q, "whatsapp", { to: q.customer?.phone || "" }))
  return true
}

// From a click: start the share synchronously, then build the PDF.
export function startWhatsAppShare(q, settings, message) {
  const ctx = beginWhatsAppShare(message || quotationShareMessage(q, settings), { openChat: hasPhone(q.customer?.phone) })
  return shareOnWhatsApp(q, settings, ctx)
}

export async function downloadPdf(q, settings) {
  try {
    const name = quotationFileName(q)
    const pdf = await renderDocumentPdf(q, settings, "quotation", name.replace(/\.pdf$/, ""))
    pdf.save(name)
    toast.success(`Downloaded ${name}`)
  } catch (err) {
    console.error(err)
    toast.error("Could not generate the PDF.")
  }
}

export async function setQuoteStatus(q, status, extra = {}) {
  await repo.update("quotations", q.id, { status, statusAt: { ...q.statusAt, [status]: stamp() }, ...extra })
}

// Validity runs from the issue date, so extending it adds days to validityDays;
// updateQuotation re-derives validUntil the same way the editor does.
export async function extendValidity(q, days = 15) {
  await updateQuotation(q.id, { validityDays: (Number(q.validityDays) || 0) + days, ...(q.status === "expired" ? { status: "sent" } : {}) })
  toast.success(`Validity extended by ${days} days`)
}

// One conversion per quotation at a time: a second click (or the I key) while
// the first is still minting a number does nothing. Callers confirm first
// (ConvertDialog.jsx).
const converting = new Set()
export async function convertToInvoice(q) {
  if (!q?.id || converting.has(q.id)) return null
  converting.add(q.id)
  try {
    const inv = await convertQuotationToInvoice(q.id)
    if (!inv) {
      toast.error("Could not convert this quotation to an invoice.")
      return null
    }
    toast.success(`Invoice ${inv.number} generated`)
    const m = notifyMessage(inv._notify)
    if (m) toast[m.tone === "error" ? "error" : "message"](m.text)
    return inv
  } catch (err) {
    toast.error(err?.message || "Could not convert this quotation to an invoice.")
    return null
  } finally {
    converting.delete(q.id)
  }
}

// A copy as a fresh draft: same customer, lines and terms, today's date, no
// number (the editor mints one on create), no send history.
export function duplicateDraft(q) {
  const copy = { ...q }
  for (const k of ["number", "sentAt", "sendLog", "statusAt", "invoiceId", "createdAt", "updatedAt", "createdBy", "updatedBy", "totals", "validUntil", "lostReason"]) delete copy[k]
  return { ...copy, id: null, status: "draft", issueDate: stamp() }
}
