// Invoice email notifications.
//
// No backend exists, so "send an email" resolves to one of two client-side
// strategies, chosen from settings:
//   1. EmailJS  — if serviceId/templateId/publicKey are set, POST to EmailJS'
//      REST endpoint and the mail is sent silently from the browser.
//   2. mailto   — otherwise open the user's mail client pre-composed with the
//      invoice details, ready to send.
//
// Both go through `notifyInvoiceCreated`, called once from the domain layer
// whenever an invoice is generated. Every attempt is logged to a lightweight
// `notifications` collection for an audit trail (Settings shows recent sends).
// To send server-side later, add an `api` branch here — nothing else changes.

import { repo } from "./repository"
import { formatCurrency, formatDate } from "../lib/format"

const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send"

// Build the subject + plain-text body for an invoice.
export function composeInvoiceEmail(invoice, settings) {
  const c = settings.company
  const t = invoice.totals || {}
  const cust = invoice.customer || {}
  const subject = `Invoice ${invoice.number} — ${c.name}`

  const lines = (invoice.lines || [])
    .map((l, i) => {
      const cl = t.lines?.[i] || {}
      return `  ${i + 1}. ${l.description} — ${l.quantity} × ${formatCurrency(l.rate)} = ${formatCurrency(cl.total || 0)}`
    })
    .join("\n")

  const tax = t.interState ? `IGST: ${formatCurrency(t.igst)}` : `CGST: ${formatCurrency(t.cgst)}  SGST: ${formatCurrency(t.sgst)}`

  const body = [
    `A new invoice has been generated.`,
    ``,
    `Invoice no : ${invoice.number}`,
    `Date       : ${formatDate(invoice.issueDate)}`,
    `Due date   : ${formatDate(invoice.dueDate)}`,
    `Customer   : ${cust.company || cust.name || "—"}${cust.company && cust.name ? ` (${cust.name})` : ""}`,
    cust.gstin ? `Buyer GSTIN: ${cust.gstin}` : null,
    ``,
    `Items:`,
    lines || "  (none)",
    ``,
    `Taxable value : ${formatCurrency(t.taxable)}`,
    `${tax}`,
    `Grand total   : ${formatCurrency(t.grandTotal)}`,
    ``,
    `— ${c.name}${c.gstin ? ` · GSTIN ${c.gstin}` : ""}`,
    c.phone ? `${c.phone} · ${c.email}` : c.email || "",
    ``,
    `(Open the console → Invoices → ${invoice.number} → Preview to print/PDF the full tax invoice.)`,
  ]
    .filter((l) => l !== null)
    .join("\n")

  return { subject, body }
}

// Human-readable summary of a notify result for a toast. Returns
// { text, tone } or null if there's nothing to say.
export function notifyMessage(result) {
  if (!result || result.skipped) return null
  if (result.error) return { text: `Email failed: ${result.error}`, tone: "error" }
  if (result.method === "emailjs") return { text: `Copy emailed to ${result.recipient}`, tone: "success" }
  return { text: `Opened your email app to send a copy to ${result.recipient}`, tone: "info" }
}

function openMailClient(recipient, subject, body) {
  const url = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  // Anchor click is more reliable than assigning location for mailto.
  const a = document.createElement("a")
  a.href = url
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function sendViaEmailJS({ serviceId, templateId, publicKey }, recipient, from, subject, body, invoice) {
  const res = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: recipient,
        from_email: from.email,
        from_name: from.name,
        reply_to: from.email,
        subject,
        message: body,
        invoice_number: invoice.number,
        customer: invoice.customer?.company || invoice.customer?.name || "",
        amount: formatCurrency(invoice.totals?.grandTotal),
      },
    }),
  })
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${await res.text()}`)
}

async function log(entry) {
  try {
    await repo.create("notifications", entry)
  } catch {
    /* logging is best-effort */
  }
}

// Called from the domain layer on invoice creation. Returns a small result the
// caller can surface as a toast: { skipped } | { method, recipient } | { error }.
export async function notifyInvoiceCreated(invoice, settings) {
  const n = settings?.notifications
  if (!n?.invoiceEmailEnabled || !n.recipient) return { skipped: true }

  const { subject, body } = composeInvoiceEmail(invoice, settings)
  const ej = n.emailjs || {}
  const useEmailJS = ej.serviceId && ej.templateId && ej.publicKey
  const from = { email: n.sender || settings.company?.email || "", name: settings.company?.name || "" }
  const base = { type: "invoice_email", to: n.recipient, from: from.email, invoiceId: invoice.id, invoiceNumber: invoice.number, at: new Date().toISOString() }

  if (useEmailJS) {
    try {
      await sendViaEmailJS(ej, n.recipient, from, subject, body, invoice)
      await log({ ...base, method: "emailjs", status: "sent" })
      return { method: "emailjs", recipient: n.recipient }
    } catch (err) {
      await log({ ...base, method: "emailjs", status: "failed", error: String(err.message || err) })
      return { error: String(err.message || err), recipient: n.recipient }
    }
  }

  openMailClient(n.recipient, subject, body)
  await log({ ...base, method: "mailto", status: "opened" })
  return { method: "mailto", recipient: n.recipient }
}
