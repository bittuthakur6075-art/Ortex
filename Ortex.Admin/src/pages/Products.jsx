import { useState, useMemo } from "react"
import { Package, Plus, Search, Download, Upload } from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { useCollection, useCategories, useSorting } from "../hooks/useCollection"
import { exportCsv } from "../lib/csv"
import ProductImport from "../components/editors/ProductImport"
import PageHeader from "../components/layout/PageHeader"
import { Button, EmptyState, PageLoader } from "../components/ui/Ui"
import ProductFilters from "./products/ProductFilters"
import BulkActionsBar from "./products/BulkActionsBar"
import ProductTable from "./products/ProductTable"
import ProductDetail from "./products/ProductDetail"
import ProductForm from "./products/ProductForm"
import { filterAndSortProducts, PRODUCT_CSV_COLUMNS, productsCsvFile, IM_COLUMNS, imFile } from "./products/helpers"

export default function Products() {
  const { items, loading, reload } = useCollection("products")
  const categories = useCategories()
  const { items: quotations } = useCollection("quotations")
  const { items: invoices } = useCollection("invoices")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [editing, setEditing] = useState(null) // product object or "new"
  const [viewing, setViewing] = useState(null) // product details viewing
  const [importing, setImporting] = useState(false)
  const [sort, onSort] = useSorting("name")
  const filtered = useMemo(() => filterAndSortProducts(items, query, category, sort), [items, query, category, sort])

  const handleExport = () => {
    exportCsv(productsCsvFile(), PRODUCT_CSV_COLUMNS, filtered)
  }

  // Export products not yet marked "Listed on IndiaMART" (or all if none pending).
  const handleIndiamartExport = () => {
    const pending = filtered.filter((p) => !p.indiamartListed)
    const rows = pending.length ? pending : filtered
    exportCsv(imFile(), IM_COLUMNS, rows)
    toast.success(`Exported ${rows.length} product(s) for IndiaMART${pending.length ? " (not yet listed)" : ""}`)
  }

  // ---- bulk selection + actions -------------------------------------------
  const [selected, setSelected] = useState(() => new Set())
  const selectedRows = filtered.filter((p) => selected.has(p.id))
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id))

  const toggleOne = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      if (filtered.every((p) => n.has(p.id))) filtered.forEach((p) => n.delete(p.id))
      else filtered.forEach((p) => n.add(p.id))
      return n
    })
  const clearSelection = () => setSelected(new Set())

  const bulkMarkListed = async (listed) => {
    const ids = [...selected]
    await Promise.all(ids.map((id) => repo.update("products", id, { indiamartListed: listed })))
    await reload()
    toast.success(`Marked ${ids.length} product(s) ${listed ? "as listed on" : "as not listed on"} IndiaMART`)
    clearSelection()
  }
  const exportSelectedIndiamart = () => {
    exportCsv(imFile(), IM_COLUMNS, selectedRows)
    toast.success(`Exported ${selectedRows.length} selected product(s) for IndiaMART`)
  }

  return (
    <div>
      <PageHeader title="Product master" subtitle={`${items.length} products · pricing, HSN & GST reference for quotes and invoices`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={handleIndiamartExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> IndiaMART CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
          <Upload className="h-4 w-4" /> Import
        </Button>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New product
        </Button>
      </PageHeader>

      <ProductFilters
        query={query}
        setQuery={setQuery}
        category={category}
        setCategory={setCategory}
        categories={categories}
      />

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your products so quotations and invoices can pull pricing, HSN codes and GST rates automatically."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try a different search or category." />
      ) : (
        <>
          {selected.size > 0 && (
            <BulkActionsBar
              count={selected.size}
              onExportIndiamart={exportSelectedIndiamart}
              onMarkListed={bulkMarkListed}
              onClear={clearSelection}
            />
          )}
          <ProductTable
            rows={filtered}
            sort={sort}
            onSort={onSort}
            selected={selected}
            allVisibleSelected={allVisibleSelected}
            toggleAll={toggleAll}
            toggleOne={toggleOne}
            onView={setViewing}
            onEdit={setEditing}
          />
        </>
      )}

      <ProductDetail
        open={viewing !== null}
        product={viewing}
        quotations={quotations}
        invoices={invoices}
        onClose={() => setViewing(null)}
        onEdit={(p) => {
          setEditing(p)
          setViewing(null)
        }}
      />

      <ProductForm
        open={editing !== null}
        product={editing === "new" ? null : editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />

      <ProductImport open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}
