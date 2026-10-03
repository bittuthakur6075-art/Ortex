import { useState, useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ReceiptIndianRupee, Plus, Search } from "../components/ui/Icons"
import { useCollection, useSettingsFor, useSorting } from "../hooks/useCollection"
import { useCompany } from "../hooks/useCompany"
import DocumentView from "../components/documents/DocumentView"
import { Button, ExportButton, EmptyState, PageLoader } from "../components/ui/Ui"
import { emptyDraft, exportInvoicesCsv } from "./invoices/helpers"
import useInvoiceList from "./invoices/useInvoiceList"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import { paymentsOrStored } from "../data/domain/domain"
import InvoiceFilters from "./invoices/InvoiceFilters"
import InvoiceTable from "./invoices/InvoiceTable"
import InvoiceEditor from "./invoices/InvoiceEditor"

export default function Invoices() {
  const { items, loading } = useCollection("invoices")
  const { items: products } = useCollection("products")
  const { items: customers } = useCollection("customers")
  const { items: readPayments } = useCollection("payments")
  const settingsOf = useSettingsFor()
  const { defaultCompany } = useCompany()
  const settings = settingsOf?.(defaultCompany) ?? null
  const blank = () => emptyDraft(settings, defaultCompany)
  const profile = useProfile()
  // Without the payments module RLS returns none: use each invoice's stored amountPaid.
  const canPay = canAccess(profile, "payments")
  const payments = useMemo(() => paymentsOrStored(items, readPayments, canPay), [items, readPayments, canPay])

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editing, setEditing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [sort, onSort] = useSorting("issueDate", true)
  const location = useLocation()
  const navigate = useNavigate()

  // The header's "+ New" menu: a blank invoice once the settings (numbering,
  // tax defaults) are in.
  useEffect(() => {
    if (!location.state?.create || !settings) return
    setEditing(emptyDraft(settings, defaultCompany))
    navigate(location.pathname + location.search, { replace: true })
  }, [location.state, settings, defaultCompany, navigate, location.pathname, location.search])

  // Arriving from a customer / product link that names an invoice to open.
  useEffect(() => {
    const id = location.state?.openId
    if (!id || loading) return
    const inv = items.find((i) => i.id === id)
    if (inv) setEditing(inv)
    else toast.error("That invoice no longer exists.")
    navigate(location.pathname + location.search, { replace: true })
  }, [location.state, loading, items, navigate, location.pathname, location.search])

  const { rows, filtered } = useInvoiceList({ items, payments, query, statusFilter, sort })

  const handleExport = () => {
    exportInvoicesCsv(filtered)
  }

  if (!settings) return <PageLoader />

  const editingRow = editing && editing.id ? rows.find((r) => r.id === editing.id) || editing : editing

  if (editing) {
    return (
      <div>
        <InvoiceEditor
          draft={editingRow}
          products={products}
          customers={customers}
          payments={payments}
          canPay={canPay}
          settingsOf={settingsOf}
          onClose={() => setEditing(null)}
          onPreview={(inv) => setPreview(inv)}
        />
        <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settingsOf(preview?.companyId)} type="invoice" />
      </div>
    )
  }

  return (
    <div>
      <InvoiceFilters
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        actions={<ExportButton onClick={handleExport} disabled={!filtered.length} />}
      />

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ReceiptIndianRupee}
          title="No invoices yet"
          description="Generate an invoice from an accepted quotation, or create one directly."
          action={
            <Button onClick={() => setEditing(blank())}>
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <InvoiceTable
          rows={filtered}
          sort={sort}
          onSort={onSort}
          onEdit={setEditing}
          onPreview={setPreview}
          title="Invoices"
          action={<Button onClick={() => setEditing(blank())}>New invoice</Button>}
        />
      )}

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settingsOf(preview?.companyId)} type="invoice" />
    </div>
  )
}
