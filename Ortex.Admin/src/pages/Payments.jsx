import { useState, useMemo } from "react"
import { Wallet, Plus, Search, ArrowDownLeft, ArrowUpRight, Download, Trash2, ReceiptText } from "../components/ui/Icons"
import { toast } from "sonner"
import { useCollection, useSettings, useSorting } from "../hooks/useCollection"
import { removePayment, paidForInvoice, invoiceBalance } from "../data/domain/domain"
import { PAYMENT_TYPE, statusMeta } from "../data/domain/schema"
import ReceiptView from "../components/documents/ReceiptView"
import { formatDate, formatCurrency, round2 } from "../lib/format"
import { exportCsv } from "../lib/csv"
import PageHeader, { ActionBar } from "../components/layout/PageHeader"
import RecordPaymentModal from "./invoices/RecordPaymentModal"
import { Button, Card, Input, Badge, StatCard, EmptyState, Money, Chip, PageLoader, SortTh } from "../components/ui/Ui"

export default function Payments({ embedded = false }) {
  const Header = embedded ? ActionBar : PageHeader
  const { items, loading } = useCollection("payments")
  const { items: invoices } = useCollection("invoices")
  const settings = useSettings()
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [newPayment, setNewPayment] = useState(null) // "inflow" | "payout" | null
  const [receiptFor, setReceiptFor] = useState(null)
  const [sort, onSort] = useSorting("date", true)

  const filtered = useMemo(() => {
    let rows = items
    if (typeFilter !== "all") rows = rows.filter((p) => p.type === typeFilter)
    const s = query.trim().toLowerCase()
    if (s) {
      rows = rows.filter((p) =>
        [p.number, p.party, p.invoiceNumber, p.method, p.reference, p.note].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
      )
    }
    const { key, desc } = sort
    const sorted = [...rows].sort((a, b) => {
      let valA = a[key]
      let valB = b[key]
      if (key === "date") {
        valA = valA ? new Date(valA).getTime() : 0
        valB = valB ? new Date(valB).getTime() : 0
      }
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "string") return desc ? valB.localeCompare(valA) : valA.localeCompare(valB)
      return desc ? valB - valA : valA - valB
    })
    return sorted
  }, [items, query, typeFilter, sort])

  const totals = useMemo(() => {
    const inflow = round2(items.filter((p) => p.type === "inflow").reduce((s, p) => s + p.amount, 0))
    const payout = round2(items.filter((p) => p.type === "payout").reduce((s, p) => s + p.amount, 0))
    return { inflow, payout, net: round2(inflow - payout) }
  }, [items])

  const handleExport = () => {
    exportCsv(
      `ortex-payments-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Number", value: (p) => p.number },
        { header: "Date", value: (p) => formatDate(p.date) },
        { header: "Type", value: (p) => p.type },
        { header: "Party", value: (p) => p.party },
        { header: "Invoice", value: (p) => p.invoiceNumber },
        { header: "Method", value: (p) => p.method },
        { header: "Reference", value: (p) => p.reference },
        { header: "Amount", value: (p) => p.amount },
      ],
      filtered,
    )
  }

  return (
    <div>
      <Header title="Payments & payouts" subtitle="Money received from customers and paid to vendors">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => setNewPayment("payout")}>
          <ArrowUpRight className="h-4 w-4" /> Payout
        </Button>
        <Button size="sm" onClick={() => setNewPayment("inflow")}>
          <Plus className="h-4 w-4" /> Record receipt
        </Button>
      </Header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ArrowDownLeft} label="Total received" value={<Money value={totals.inflow} />} accent="bg-success/10 text-success-text" />
        <StatCard icon={ArrowUpRight} label="Total paid out" value={<Money value={totals.payout} />} accent="bg-destructive/10 text-destructive-text" />
        <StatCard icon={Wallet} label="Net position" value={<Money value={totals.net} />} accent="bg-primary/10 text-primary" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-[320px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search party, invoice, reference…" className="pl-10" />
        </div>
        <div className="flex gap-1.5">
          <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All
          </Chip>
          {PAYMENT_TYPE.map((t) => (
            <Chip key={t.id} active={typeFilter === t.id} onClick={() => setTypeFilter(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payments recorded"
          description="Record customer receipts against invoices, or vendor payouts, to track cash flow."
          action={
            <Button onClick={() => setNewPayment("inflow")}>
              <Plus className="h-4 w-4" /> Record receipt
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-subtle text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
                <tr>
                  <SortTh sortKey="number" sort={sort} onSort={onSort}>Ref</SortTh>
                  <SortTh sortKey="party" sort={sort} onSort={onSort}>Party</SortTh>
                  <SortTh sortKey="method" sort={sort} onSort={onSort}>Method</SortTh>
                  <SortTh sortKey="type" sort={sort} onSort={onSort}>Type</SortTh>
                  <SortTh sortKey="amount" sort={sort} onSort={onSort} align="right">Amount</SortTh>
                  <SortTh sortKey="date" sort={sort} onSort={onSort}>Date</SortTh>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border rows-in">
                {filtered.map((p) => {
                  const meta = statusMeta(PAYMENT_TYPE, p.type)
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-subtle">
                      <td className="px-4 py-3">
                        <div className="font-medium tabular text-foreground">{p.number}</div>
                        {p.invoiceNumber && <div className="text-xs text-muted-foreground">{p.invoiceNumber}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.party || "—"}</div>
                        {p.note && <div className="max-w-xs truncate text-xs text-muted-foreground">{p.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.method}
                        {p.reference && <span className="block text-xs">{p.reference}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular ${p.type === "inflow" ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                        {p.type === "inflow" ? "+" : "−"}
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(p.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {p.type === "inflow" && (
                            <button
                              onClick={() => setReceiptFor(p)}
                              className="text-muted-foreground hover:text-primary"
                              title="Print receipt"
                            >
                              <ReceiptText className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (window.confirm("Delete this payment entry?")) {
                                await removePayment(p)
                                toast.success("Entry deleted")
                              }
                            }}
                            className="text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {newPayment && (
        <RecordPaymentModal
          type={newPayment}
          invoices={invoices}
          payments={items}
          onClose={() => setNewPayment(null)}
          onDone={() => setNewPayment(null)}
        />
      )}

      {settings && receiptFor && (
        <ReceiptView
          open
          onClose={() => setReceiptFor(null)}
          payment={receiptFor}
          settings={settings}
          invoice={receiptFor.invoiceId ? invoices.find((i) => i.id === receiptFor.invoiceId) : null}
          allocation={
            receiptFor.invoiceId && invoices.find((i) => i.id === receiptFor.invoiceId)
              ? {
                  cumulative: paidForInvoice(receiptFor.invoiceId, items),
                  balance: invoiceBalance(invoices.find((i) => i.id === receiptFor.invoiceId), items),
                }
              : null
          }
        />
      )}
    </div>
  )
}

