import { useEffect, useState, useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  MoneyIn, MoneyOut, WalletMoney, Bank, Cash, CreditCard, CardPos, Cheque, Smartphone, Wallet, ReceiptText, Trash2, Search,
} from "../components/ui/Icons"
import { useCollection, useSettings, useSorting } from "../hooks/useCollection"
import { removePayment, paidForInvoice, invoiceBalance } from "../data/domain/domain"
import ReceiptView from "../components/documents/ReceiptView"
import { formatDate, formatCurrency, round2 } from "../lib/format"
import { exportCsv } from "../lib/csv"
import RecordPaymentModal from "./invoices/RecordPaymentModal"
import { Button, ExportButton, Card, CardHeader, SearchInput, StatCard, EmptyState, Money, Chip, ChipGroup, PageLoader, SortTh } from "../components/ui/Ui"

// How the money moved, as an icon beside the method (PAYMENT_METHODS in schema.js).
const METHOD_ICON = {
  UPI: Smartphone,
  "Bank transfer / NEFT": Bank,
  RTGS: Bank,
  Cheque,
  Cash,
  Card: CreditCard,
  Razorpay: CardPos,
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "inflow", label: "Received" },
  { id: "payout", label: "Paid out" },
]

export default function Payments() {
  const { items, loading } = useCollection("payments")
  const { items: invoices } = useCollection("invoices")
  const settings = useSettings()
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [newPayment, setNewPayment] = useState(null) // "inflow" | "payout" | null
  const location = useLocation()
  const navigate = useNavigate()
  // The header's "+ New" menu: record a payment received.
  useEffect(() => {
    if (!location.state?.create) return
    setNewPayment("inflow")
    navigate(location.pathname + location.search, { replace: true })
  }, [location.state, navigate, location.pathname, location.search])
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
    return [...rows].sort((a, b) => {
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
  }, [items, query, typeFilter, sort])

  const totals = useMemo(() => {
    const ins = items.filter((p) => p.type === "inflow")
    const outs = items.filter((p) => p.type === "payout")
    const inflow = round2(ins.reduce((s, p) => s + p.amount, 0))
    const payout = round2(outs.reduce((s, p) => s + p.amount, 0))
    return { inflow, payout, net: round2(inflow - payout), count: { all: items.length, inflow: ins.length, payout: outs.length } }
  }, [items])

  const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`

  const handleExport = () => {
    exportCsv(
      `ortex-payments-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Number", value: (p) => p.number },
        { header: "Date", value: (p) => formatDate(p.date) },
        { header: "Type", value: (p) => (p.type === "inflow" ? "Received" : "Paid out") },
        { header: "Party", value: (p) => p.party },
        { header: "Invoice", value: (p) => p.invoiceNumber },
        { header: "Method", value: (p) => p.method },
        { header: "Reference", value: (p) => p.reference },
        { header: "Amount", value: (p) => p.amount },
      ],
      filtered,
    )
  }

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.number}? This cannot be undone.`)) return
    await removePayment(p)
    toast.success("Payment deleted")
  }

  const receiptInvoice = receiptFor?.invoiceId ? invoices.find((i) => i.id === receiptFor.invoiceId) : null

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={MoneyIn} label="Received" value={<Money value={totals.inflow} />} hint={plural(totals.count.inflow, "payment")} accent="bg-success/10 text-success-text" />
        <StatCard icon={MoneyOut} label="Paid out" value={<Money value={totals.payout} />} hint={plural(totals.count.payout, "payout")} accent="bg-destructive/10 text-destructive-text" />
        <StatCard icon={WalletMoney} label="Net" value={<Money value={totals.net} />} hint="Received minus paid out" accent="bg-primary/10 text-primary" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <ChipGroup className="min-w-0">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={typeFilter === f.id} onClick={() => setTypeFilter(f.id)}>
              {f.label} <span className="ml-1 tabular opacity-60">{totals.count[f.id]}</span>
            </Chip>
          ))}
        </ChipGroup>
        <div className="flex items-center gap-[10px] sm:ml-auto">
          <SearchInput
            className="w-full sm:w-[320px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, reference, invoice"
          />
          <ExportButton onClick={handleExport} disabled={!filtered.length} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Payments"
          action={
            <div className="flex items-center gap-2.5">
              <Button variant="outline" onClick={() => setNewPayment("payout")}>
                <MoneyOut className="h-4 w-4" /> Record payout
              </Button>
              <Button onClick={() => setNewPayment("inflow")}>
                <MoneyIn className="h-4 w-4" /> Record payment
              </Button>
            </div>
          }
        />
        {loading ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MoneyIn}
            title="No payments yet"
            description="Record one, or drop in a UPI or bank screenshot."
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="No matches" description="Try another search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="mt-head">
                <tr>
                  <SortTh sortKey="date" sort={sort} onSort={onSort}>Date</SortTh>
                  <SortTh sortKey="party" sort={sort} onSort={onSort}>Party</SortTh>
                  <SortTh sortKey="method" sort={sort} onSort={onSort}>Method</SortTh>
                  <SortTh sortKey="invoiceNumber" sort={sort} onSort={onSort}>Invoice</SortTh>
                  <SortTh sortKey="amount" sort={sort} onSort={onSort} align="right">Amount</SortTh>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="mt-body">
                {filtered.map((p) => {
                  const inflow = p.type === "inflow"
                  const MethodIcon = METHOD_ICON[p.method] || Wallet
                  return (
                    <tr key={p.id} className="group transition-colors hover:bg-subtle">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="text-foreground">{formatDate(p.date)}</div>
                        <div className="text-xs tabular text-muted-foreground">{p.number}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.party || p.customer?.name || "-"}</div>
                        {p.note && <div className="max-w-xs truncate text-xs text-muted-foreground">{p.note}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-grid h-8 w-8 flex-none place-items-center rounded-lg bg-muted text-muted-foreground">
                            <MethodIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="text-foreground">{p.method}</div>
                            {p.reference && <div className="truncate text-xs tabular text-muted-foreground">{p.reference}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.invoiceId ? (
                          <button
                            type="button"
                            className="font-medium tabular text-primary hover:underline"
                            onClick={() => navigate("/billing?tab=invoices", { state: { openId: p.invoiceId } })}
                          >
                            {p.invoiceNumber}
                          </button>
                        ) : (
                          <span className="text-subtle-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center gap-1.5 font-semibold tabular ${inflow ? "text-success-text" : "text-destructive-text"}`}>
                          {inflow ? "+" : "−"}
                          {formatCurrency(p.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                          {inflow && (
                            <Button onClick={() => setReceiptFor(p)} variant="ghost" size="sm" icon className="text-muted-foreground" title="Receipt" aria-label="Receipt">
                              <ReceiptText className="h-4 w-4" />
                            </Button>
                          )}
                          <Button onClick={() => remove(p)} variant="dangerGhost" size="sm" icon className="text-muted-foreground" title="Delete" aria-label="Delete">
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
        )}
      </Card>

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
          invoice={receiptInvoice}
          allocation={
            receiptInvoice
              ? { cumulative: paidForInvoice(receiptFor.invoiceId, items), balance: invoiceBalance(receiptInvoice, items) }
              : null
          }
        />
      )}
    </div>
  )
}
