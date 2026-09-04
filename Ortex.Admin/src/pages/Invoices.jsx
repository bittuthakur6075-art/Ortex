import { useState } from "react"
import { ReceiptIndianRupee, Plus, Search, Download, Upload } from "../components/ui/Icons"
import { useCollection, useSettings, useSorting } from "../hooks/useCollection"
import PageHeader from "../components/layout/PageHeader"
import DocumentView from "../components/documents/DocumentView"
import TallyInvoiceImport from "../components/editors/TallyInvoiceImport"
import { Button, EmptyState, PageLoader } from "../components/ui/Ui"
import { emptyDraft, exportInvoicesCsv } from "./invoices/helpers"
import useInvoiceList from "./invoices/useInvoiceList"
import InvoiceFilters from "./invoices/InvoiceFilters"
import InvoiceTable from "./invoices/InvoiceTable"
import InvoiceEditor from "./invoices/InvoiceEditor"

export default function Invoices() {
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

  const { rows, filtered } = useInvoiceList({ items, payments, query, statusFilter, sort })

  const handleExport = () => {
    exportInvoicesCsv(filtered)
  }

  if (!settings) return <PageLoader />

  const editingRow = editing && editing.id ? rows.find((r) => r.id === editing.id) || editing : editing

  return (
    <div>
      <PageHeader title="Invoices" subtitle={`${items.length} invoices · GST tax invoices & collections`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
          <Upload className="h-4 w-4" /> Import Tally XML
        </Button>
        <Button size="sm" onClick={() => setEditing(emptyDraft(settings))}>
          <Plus className="h-4 w-4" /> New invoice
        </Button>
      </PageHeader>

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

      {editing && (
        <InvoiceEditor
          draft={editingRow}
          products={products}
          customers={customers}
          payments={payments}
          settings={settings}
          onClose={() => setEditing(null)}
          onPreview={(inv) => setPreview(inv)}
        />
      )}

      <TallyInvoiceImport open={importing} onClose={() => setImporting(false)} />

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="invoice" />
    </div>
  )
}
