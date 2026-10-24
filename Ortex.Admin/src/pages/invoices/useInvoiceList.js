import { useMemo } from "react"
import { paidForInvoice, invoiceBalance, resolveInvoiceStatus } from "../../data/domain/domain"
import { byNumberDesc, dateValue, sortRows } from "../../lib/listSort"

function invoiceSortValue(inv, key) {
  if (key === "customer") return inv.customer?.company || inv.customer?.name || ""
  if (key === "grandTotal") return Number(inv.totals?.grandTotal) || 0
  // An invoice without an issue date sorts by when it was made.
  if (key === "issueDate") return dateValue(inv.issueDate) ?? dateValue(inv.createdAt)
  if (key === "dueDate") return dateValue(inv.dueDate)
  return inv[key]
}

// Enriches invoices with payment-derived fields, then applies the status chip,
// search query and column sort. Returns both the full enriched list (`rows`)
// and the visible subset (`filtered`).
export default function useInvoiceList({ items, payments, query, statusFilter, sort }) {
  const rows = useMemo(() => {
    return items.map((inv) => ({
      ...inv,
      _paid: paidForInvoice(inv.id, payments),
      _balance: invoiceBalance(inv, payments),
      _status: resolveInvoiceStatus(inv, payments),
    }))
  }, [items, payments])

  const filtered = useMemo(() => {
    let list = rows
    if (statusFilter !== "all") list = list.filter((i) => i._status === statusFilter)
    const s = query.trim().toLowerCase()
    if (s) {
      list = list.filter((i) =>
        [i.number, i.customer?.name, i.customer?.company].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
      )
    }

    // Ties (same day, same total) fall back to the newest number first.
    return sortRows(list, sort, invoiceSortValue, byNumberDesc((i) => i.number))
  }, [rows, query, statusFilter, sort])

  return { rows, filtered }
}
