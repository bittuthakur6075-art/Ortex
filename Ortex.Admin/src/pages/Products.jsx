import { useState, useMemo } from "react"
import { Package, Plus, Search } from "../components/ui/Icons"
import { toast } from "sonner"
import { useCollection, useCategories, useSorting } from "../hooks/useCollection"
import { exportCsv } from "../lib/csv"
import ProductImport from "../components/editors/ProductImport"
import { Button, ExportButton, ToolbarButton, EmptyState, PageLoader } from "../components/ui/Ui"
import ProductFilters from "./products/ProductFilters"
import ProductTable from "./products/ProductTable"
import ProductDetail from "./products/ProductDetail"
import ProductForm from "./products/ProductForm"
import { filterAndSortProducts, PRODUCT_CSV_COLUMNS, productsCsvFile, IM_COLUMNS, imFile } from "./products/helpers"

export default function Products() {
  const { items, loading } = useCollection("products")
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

  return (
    <div>
      <ProductFilters
        query={query}
        setQuery={setQuery}
        category={category}
        setCategory={setCategory}
        categories={categories}
        actions={
          <>
            <ToolbarButton onClick={handleIndiamartExport} disabled={!filtered.length}>IndiaMART CSV</ToolbarButton>
            <ToolbarButton onClick={() => setImporting(true)}>Import</ToolbarButton>
            <ExportButton onClick={handleExport} disabled={!filtered.length} />
          </>
        }
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
        <ProductTable
          rows={filtered}
          sort={sort}
          onSort={onSort}
          onView={setViewing}
          onEdit={setEditing}
          title="Products"
          action={<Button onClick={() => setEditing("new")}>New product</Button>}
        />
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
