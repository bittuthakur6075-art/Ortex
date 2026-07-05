import { useState, useMemo } from "react"
import { Wallet, Plus, Search, ArrowDownLeft, ArrowUpRight, Download, Trash2, ReceiptText } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection, useSettings } from "../data/hooks"
import { recordPayment, paidForInvoice, invoiceBalance } from "../data/domain"
import { PAYMENT_TYPE, PAYMENT_METHODS, statusMeta } from "../data/schema"
import ReceiptView from "../components/ReceiptView"
import { formatDate, toDateInput, formatCurrency, round2 } from "../lib/format"
import { exportCsv } from "../lib/csv"
import PageHeader from "../components/PageHeader"
import {
  Button,
  Card,
  Input,
  Select,
  Textarea,
  Field,
  Badge,
  StatCard,
  EmptyState,
  Money,
  Chip,
  Modal,
  PageLoader,
} from "../components/ui"

export default function Payments() {
  const { items, loading } = useCollection("payments")
  const { items: invoices } = useCollection("invoices")
  const settings = useSettings()
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [newPayment, setNewPayment] = useState(null) // "inflow" | "payout" | null
  const [receiptFor, setReceiptFor] = useState(null)

  const filtered = useMemo(() => {
    let rows = items
    if (typeFilter !== "all") rows = rows.filter((p) => p.type === typeFilter)
    const s = query.trim().toLowerCase()
    if (s) {
      rows = rows.filter((p) =>
        [p.number, p.party, p.invoiceNumber, p.method, p.reference, p.note].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
      )
    }
    return [...rows].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [items, query, typeFilter])

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
      <PageHeader title="Payments & payouts" subtitle="Money received from customers and paid to vendors">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => setNewPayment("payout")}>
          <ArrowUpRight className="h-4 w-4" /> Payout
        </Button>
        <Button size="sm" onClick={() => setNewPayment("inflow")}>
          <Plus className="h-4 w-4" /> Record receipt
        </Button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ArrowDownLeft} label="Total received" value={<Money value={totals.inflow} />} accent="bg-emerald-500/10 text-emerald-500" />
        <StatCard icon={ArrowUpRight} label="Total paid out" value={<Money value={totals.payout} />} accent="bg-rose-500/10 text-rose-500" />
        <StatCard icon={Wallet} label="Net position" value={<Money value={totals.net} />} accent="bg-primary/10 text-primary" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Ref</th>
                  <th className="px-4 py-3 font-medium">Party</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const meta = statusMeta(PAYMENT_TYPE, p.type)
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-muted/40">
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
                                await repo.remove("payments", p.id)
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

      {newPayment && <PaymentModal type={newPayment} onClose={() => setNewPayment(null)} />}

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

function PaymentModal({ type, onClose }) {
  const isPayout = type === "payout"
  const [form, setForm] = useState({
    amount: "",
    method: PAYMENT_METHODS[0],
    date: toDateInput(new Date().toISOString()),
    party: "",
    reference: "",
    note: "",
  })
  const set = (key, v) => setForm((f) => ({ ...f, [key]: v }))

  const submit = async () => {
    const amt = Number(form.amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount")
    if (!form.party.trim()) return toast.error(isPayout ? "Enter the payee" : "Enter the payer")
    await recordPayment({
      type,
      amount: amt,
      method: form.method,
      date: new Date(form.date).toISOString(),
      party: form.party,
      reference: form.reference,
      note: form.note,
    })
    toast.success(isPayout ? "Payout recorded" : "Receipt recorded")
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isPayout ? "Record payout" : "Record receipt"}
      width="max-w-sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={isPayout ? "Paid to (vendor / party)" : "Received from"} required>
          <Input value={form.party} onChange={(e) => set("party", e.target.value)} placeholder={isPayout ? "Vendor name" : "Customer name"} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹)" required>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <Field label="Method">
          <Select value={form.method} onChange={(e) => set("method", e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference / txn ID">
          <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="UPI ref, PO no.…" />
        </Field>
        <Field label="Note">
          <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="What is this for?" />
        </Field>
        {isPayout && (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Vendor payouts are recorded manually here. Automated bank payouts (RazorpayX, etc.) require a backend integration.
          </p>
        )}
      </div>
    </Modal>
  )
}
