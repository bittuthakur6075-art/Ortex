// Pure helpers for the Invoices page (blank draft + CSV export).
import { newCustomer, newLine } from "../../data/domain/schema"
import { formatDate } from "../../lib/format"
import { exportCsv } from "../../lib/csv"

export const emptyDraft = (settings) => ({
  id: null,
  customer: newCustomer(),
  shipTo: null,
  lines: [newLine()],
  extraDiscountPercent: 0,
  paymentTerms: "",
  issueDate: new Date().toISOString(),
  dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
  notes: "",
  terms: settings?.quotation?.terms ?? "",
  status: "draft",
})

// Rows are the enriched list rows (carry _status / _paid / _balance).
export const exportInvoicesCsv = (rows) => {
  exportCsv(
    `ortex-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      { header: "Number", value: (i) => i.number },
      { header: "Date", value: (i) => formatDate(i.issueDate) },
      { header: "Customer", value: (i) => i.customer?.company || i.customer?.name },
      { header: "Status", value: (i) => i._status },
      { header: "Taxable", value: (i) => i.totals?.taxable },
      { header: "Grand total", value: (i) => i.totals?.grandTotal },
      { header: "Paid", value: (i) => i._paid },
      { header: "Balance", value: (i) => i._balance },
      { header: "Due", value: (i) => formatDate(i.dueDate) },
    ],
    rows,
  )
}
