import { useState, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ReceiptIndianRupee, Plus, Search, Download, Upload } from "../components/ui/Icons"
import { useCollection, useSettings, useSorting } from "../hooks/useCollection"
import PageHeader, { ActionBar } from "../components/layout/PageHeader"
import DocumentView from "../components/documents/DocumentView"
import TallyInvoiceImport from "../components/editors/TallyInvoiceImport"
import { Button, EmptyState, PageLoader } from "../components/ui/Ui"
import { emptyDraft, exportInvoicesCsv } from "./invoices/helpers"
import useInvoiceList from "./invoices/useInvoiceList"
import InvoiceFilters from "./invoices/InvoiceFilters"
import InvoiceTable from "./invoices/InvoiceTable"
import InvoiceEditor from "./invoices/InvoiceEditor"

export default function Invoices({ embedded = false }) {
  const Header = embedded ? ActionBar : PageHeader
  const { items, loading } = useCollection("invoices")
  const { items: products } = useCollection("products")
  const { items: customers } = useCollection("customers")
  const { items: payments } = useCollection("payments")
  const settings = useSettings()

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editing, setEditing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [sort, onSort] = useSorting("issueDate", true)
  const location = useLocation()
  const navigate = useNavigate()

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
          settings={settings}
          onClose={() => setEditing(null)}
          onPreview={(inv) => setPreview(inv)}
        />
        <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="invoice" />
      </div>
    )
  }

  return (
    <div>
      <Header title="Invoices" subtitle={`${items.length} invoices · GST tax invoices & collections`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
          <Upload className="h-4 w-4" /> Import Tally XML
        </Button>
        <Button size="sm" onClick={() => setEditing(emptyDraft(settings))}>
          <Plus className="h-4 w-4" /> New invoice
        </Button>
      </Header>

      <InvoiceFilters query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ReceiptIndianRupee}
          title="No invoices yet"
          description="Generate an invoice from an accepted quotation, or create one directly."
          action={
            <Button onClick={() => setEditing(emptyDraft(settings))}>
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <InvoiceTable rows={filtered} sort={sort} onSort={onSort} onEdit={setEditing} onPreview={setPreview} />
      )}


      <TallyInvoiceImport open={importing} onClose={() => setImporting(false)} />

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="invoice" />
    </div>
  )
}
