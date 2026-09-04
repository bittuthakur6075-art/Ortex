import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { ReceiptIndianRupee, Wallet } from "../components/ui/Icons"
import { useProfile } from "../hooks/useProfile"
import { useCollections } from "../hooks/useCollection"
import { canAccess } from "../data/domain/modules"
import { invoiceBalance, resolveInvoiceStatus } from "../data/domain/domain"
import PageHeader from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import Invoices from "./Invoices"
import Payments from "./Payments"

// One Billing workspace. The two tabs are the former Invoices and Payments
// pages, embedded unchanged. Access is still granted per tab through the
// original module keys, so a user's permissions carry over without migration.
const TABS = [
  { value: "invoices", moduleKey: "invoices", label: "Invoices", icon: ReceiptIndianRupee, Page: Invoices },
  { value: "payments", moduleKey: "payments", label: "Payments", icon: Wallet, Page: Payments },
]

export const BILLING_MODULE_KEYS = TABS.map((t) => t.moduleKey)

function Count({ n }) {
  if (!n) return null
  return <span className="rounded-md bg-muted px-1.5 text-[11px] font-semibold leading-4 text-muted-foreground tabular">{n}</span>
}

export default function Billing() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const { data } = useCollections(["invoices", "payments"])

  const allowed = useMemo(() => TABS.filter((t) => canAccess(profile, t.moduleKey)), [profile])
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]

  const counts = useMemo(() => {
    const invoices = data.invoices || []
    const payments = data.payments || []
    const now = new Date()
    const thisMonth = (ts) => {
      const d = ts ? new Date(ts) : null
      return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }
    return {
      invoices: invoices.filter((inv) => {
        const status = resolveInvoiceStatus(inv, payments)
        return !["draft", "cancelled", "paid"].includes(status) && invoiceBalance(inv, payments) > 0
      }).length,
      payments: payments.filter((p) => thisMonth(p.date)).length,
    }
  }, [data])

  if (!current) return null

  const items = allowed.map((t) => ({
    value: t.value,
    icon: t.icon,
    label: (
      <>
        {t.label} <Count n={counts[t.value]} />
      </>
    ),
  }))

  const Page = current.Page

  return (
    <div>
      <PageHeader title="Billing" subtitle="Invoices, receipts and payouts" />
      <Tabs
        className="mb-5"
        items={items}
        value={current.value}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      <Page key={current.value} embedded />
    </div>
  )
}
