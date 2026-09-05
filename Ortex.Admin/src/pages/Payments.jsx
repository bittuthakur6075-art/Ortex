import { useState, useMemo } from "react"
import { Wallet, Plus, ArrowDownLeft, ArrowUpRight, Trash2, ReceiptText } from "../components/ui/Icons"
import { toast } from "sonner"
import { useCollection, useSettings, useSorting } from "../hooks/useCollection"
import { removePayment, paidForInvoice, invoiceBalance } from "../data/domain/domain"
import { PAYMENT_TYPE, statusMeta } from "../data/domain/schema"
import ReceiptView from "../components/documents/ReceiptView"
import { formatDate, formatCurrency, round2 } from "../lib/format"
import { exportCsv } from "../lib/csv"
import RecordPaymentModal from "./invoices/RecordPaymentModal"
import { Button, ExportButton, ToolbarButton, Card, CardHeader, SearchInput, Badge, StatCard, EmptyState, Money, Chip, ChipGroup, PageLoader, SortTh } from "../components/ui/Ui"

export default function Payments() {
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
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ArrowDownLeft} label="Total received" value={<Money value={totals.inflow} />} accent="bg-success/10 text-success-text" />
        <StatCard icon={ArrowUpRight} label="Total paid out" value={<Money value={totals.payout} />} accent="bg-destructive/10 text-destructive-text" />
        <StatCard icon={Wallet} label="Net position" value={<Money value={totals.net} />} accent="bg-primary/10 text-primary" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <ChipGroup className="min-w-0">
          <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All
          </Chip>
          {PAYMENT_TYPE.map((t) => (
            <Chip key={t.id} active={typeFilter === t.id} onClick={() => setTypeFilter(t.id)}>
              {t.label}
            </Chip>
          ))}
        </ChipGroup>
        <div className="flex items-center gap-[10px] sm:ml-auto">
          <SearchInput
            className="w-full sm:w-[320px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search payments"
          />
          <ToolbarButton onClick={() => setNewPayment("payout")}>Payout</ToolbarButton>
          <ExportButton onClick={handleExport} disabled={!filtered.length} />
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
          <CardHeader
            title="Payments & payouts"
            action={<Button onClick={() => setNewPayment("inflow")}>Record receipt</Button>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="mt-head">
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
              <tbody className="mt-body">
                {filtered.map((p) => {
                  const meta = statusMeta(PAYMENT_TYPE, p.type)
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-subtle">
                      <td className="px-4 py-3">
                        <div className="font-medium tabular text-foreground">{p.number}</div>
                        {p.invoiceNumber && <div className="text-xs text-muted-foreground">{p.invoiceNumber}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.party || "-"}</div>
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
                            <Button
                              onClick={() => setReceiptFor(p)}
                              variant="ghost" size="sm" icon className="text-muted-foreground"
                              title="Print receipt"
                            >
                              <ReceiptText className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            onClick={async () => {
                              if (window.confirm("Delete this payment entry?")) {
                                await removePayment(p)
                                toast.success("Entry deleted")
                              }
                            }}
                            variant="dangerGhost" size="sm" icon className="text-muted-foreground"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

