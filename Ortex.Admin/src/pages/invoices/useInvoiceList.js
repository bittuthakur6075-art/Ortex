import { useMemo } from "react"
import { paidForInvoice, invoiceBalance, resolveInvoiceStatus } from "../../data/domain/domain"

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

    const { key, desc } = sort
    const sorted = [...list].sort((a, b) => {
      let valA = a[key]
      let valB = b[key]
      if (key === "customer") {
        valA = a.customer?.company || a.customer?.name || ""
        valB = b.customer?.company || b.customer?.name || ""
      } else if (key === "grandTotal") {
        valA = a.totals?.grandTotal || 0
        valB = b.totals?.grandTotal || 0
      }
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "string") return valA.localeCompare(valB)
      return valA - valB
    })
    return desc ? sorted.reverse() : sorted
  }, [rows, query, statusFilter, sort])

  return { rows, filtered }
}
