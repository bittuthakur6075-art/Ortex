// ---------------------------------------------------------------------------
// P3: Velocity, cohorts and messaging impact.
// ---------------------------------------------------------------------------

import { resolveInvoiceStatus } from "../../data/domain/domain"
import { inRange } from "./period"
import { median } from "./stats"

const daysBetween = (a, b) => {
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.max(0, Math.round((tb - ta) / 86400000))
}

// Sales-cycle timing across the document chain:
// enquiry --(quotation.enquiryId)--> quotation --(invoice.quotationId)-->
// invoice --(payment.invoiceId)--> paid. Each stage is measured independently
// over every pair that exists, so a missing link (e.g. a quotation created
// without an enquiry) drops that pair, not the whole record.
export function computeVelocity({ enquiries = [], quotations = [], invoices = [], payments = [] }) {
  const enquiryById = Object.fromEntries(enquiries.map((e) => [e.id, e]))
  const quoteById = Object.fromEntries(quotations.map((q) => [q.id, q]))
  const live = invoices.filter((i) => i.status !== "cancelled")

  const enquiryToQuote = quotations
    .map((q) => {
      const e = q.enquiryId && enquiryById[q.enquiryId]
      return e ? daysBetween(e.submittedAt || e.createdAt, q.issueDate || q.createdAt) : null
    })
    .filter((v) => v !== null)

  const quoteToInvoice = live
    .map((i) => {
      const q = i.quotationId && quoteById[i.quotationId]
      return q ? daysBetween(q.issueDate || q.createdAt, i.issueDate) : null
    })
    .filter((v) => v !== null)

  // Invoice → paid: only invoices that actually settled; measured to the LAST
  // linked inflow (the payment that closed the balance).
  const inflowsByInvoice = {}
  payments
    .filter((p) => (p.type ?? "inflow") === "inflow" && p.invoiceId)
    .forEach((p) => (inflowsByInvoice[p.invoiceId] = inflowsByInvoice[p.invoiceId] || []).push(p))
  const invoiceToPaid = live
    .filter((i) => resolveInvoiceStatus(i, payments) === "paid" && inflowsByInvoice[i.id])
    .map((i) => {
      const last = inflowsByInvoice[i.id].reduce((m, p) => Math.max(m, new Date(p.date).getTime() || 0), 0)
      return last ? daysBetween(i.issueDate, last) : null
    })
    .filter((v) => v !== null)

  // Full chain, where every link exists: enquiry → final payment.
  const fullCycle = live
    .filter((i) => resolveInvoiceStatus(i, payments) === "paid" && inflowsByInvoice[i.id])
    .map((i) => {
      const q = i.quotationId && quoteById[i.quotationId]
      const e = q?.enquiryId && enquiryById[q.enquiryId]
      if (!e) return null
      const last = inflowsByInvoice[i.id].reduce((m, p) => Math.max(m, new Date(p.date).getTime() || 0), 0)
      return last ? daysBetween(e.submittedAt || e.createdAt, last) : null
    })
    .filter((v) => v !== null)

  return {
    enquiryToQuote: median(enquiryToQuote),
    quoteToInvoice: median(quoteToInvoice),
    invoiceToPaid: median(invoiceToPaid),
    fullCycle: median(fullCycle),
    samples: {
      enquiryToQuote: enquiryToQuote.length,
      quoteToInvoice: quoteToInvoice.length,
      invoiceToPaid: invoiceToPaid.length,
      fullCycle: fullCycle.length,
    },
  }
}

// Monthly enquiry cohorts: of the enquiries that arrived in month M, how many
// were ever quoted, and how many won? Answers "is this month's intake
// converting better or worse than last month's" — the growth question the
// period-scoped dashboard can't, because it mixes intake months.
export function computeCohorts({ enquiries = [], quotations = [] }, months = 6, now = new Date()) {
  const quotesByEnquiry = {}
  quotations.forEach((q) => {
    if (q.enquiryId) (quotesByEnquiry[q.enquiryId] = quotesByEnquiry[q.enquiryId] || []).push(q)
  })

  const rows = []
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const cohort = enquiries.filter((e) => inRange(e.submittedAt || e.createdAt, start.getTime(), end.getTime()))
    const quoted = cohort.filter((e) => (quotesByEnquiry[e.id] || []).length > 0).length
    const won = cohort.filter((e) =>
      (quotesByEnquiry[e.id] || []).some((q) => q.status === "accepted" || q.status === "invoiced"),
    ).length
    rows.push({
      label: start.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      enquiries: cohort.length,
      quoted,
      won,
      quotedPct: cohort.length ? Math.round((quoted / cohort.length) * 100) : null,
      wonPct: cohort.length ? Math.round((won / cohort.length) * 100) : null,
    })
  }
  return rows
}
