import { useState, useMemo, useEffect, useRef } from "react"
import { Package, Plus, Search, Pencil, Trash2, Download, Upload, X } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection, useCategories } from "../data/hooks"
import { PRODUCT_STATUS, UNITS, GST_RATES, newProduct, autoDetectCategory } from "../data/schema"
import { formatCurrency, round2 } from "../lib/format"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"
import ProductImport from "../components/ProductImport"
import PageHeader from "../components/PageHeader"
import {
  Button,
  Card,
  Input,
  Select,
  Textarea,
  Field,
  StatusBadge,
  EmptyState,
  Money,
  Drawer,
  PageLoader,
} from "../components/ui"

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

  const filtered = useMemo(() => {
    let rows = items
    if (category !== "all") rows = rows.filter((p) => p.category === category)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((p) =>
        [p.name, p.sku, p.hsn, p.material, p.category].filter(Boolean).some((v) => v.toLowerCase().includes(q)),
      )
    }
    return [...rows].sort((a, b) => a.name.localeCompare(b.name))
  }, [items, query, category])

  const handleExport = () => {
    exportCsv(
      `ortex-products-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Name", value: (p) => p.name },
        { header: "SKU", value: (p) => p.sku },
        { header: "Category", value: (p) => p.category },
        { header: "HSN", value: (p) => p.hsn },
        { header: "Unit", value: (p) => p.unit },
        { header: "Base price", value: (p) => p.basePrice },
        { header: "Cost price", value: (p) => p.costPrice },
        { header: "GST %", value: (p) => p.gstRate },
        { header: "MOQ", value: (p) => p.moq },
        { header: "Status", value: (p) => p.status },
      ],
      filtered,
    )
  }

  // Columns for the IndiaMART bulk-upload sheet (paste into IndiaMART's Bulk
  // Product Upload; IndiaMART has no API, so listing itself stays in their panel).
  const IM_COLUMNS = [
    { header: "Product Name", value: (p) => p.name },
    { header: "Product Description", value: (p) => p.description || p.material },
    { header: "Product Category", value: (p) => p.category },
    { header: "Price (INR)", value: (p) => p.basePrice },
    { header: "Unit", value: (p) => p.unit },
    { header: "Minimum Order Quantity", value: (p) => p.moq },
    { header: "HSN Code", value: (p) => p.hsn },
    { header: "GST %", value: (p) => p.gstRate },
    { header: "Specifications", value: (p) => p.material },
  ]
  const imFile = () => `indiamart-products-${new Date().toISOString().slice(0, 10)}.csv`

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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU, HSN, material…" className="pl-10" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-64">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

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
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium text-foreground">{selected.size} selected</span>
              <Button size="sm" variant="outline" onClick={exportSelectedIndiamart}>
                <Download className="h-4 w-4" /> Export for IndiaMART
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMarkListed(true)}>
                Mark listed
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMarkListed(false)}>
                Mark not listed
              </Button>
              <button onClick={clearSelection} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
          )}
          <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">HSN</th>
                  <th className="px-4 py-3 text-right font-medium">Base price</th>
                  <th className="px-4 py-3 text-right font-medium">Margin</th>
                  <th className="px-4 py-3 text-right font-medium">GST</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const margin = round2(p.basePrice - p.costPrice)
                  const marginPct = p.basePrice ? Math.round((margin / p.basePrice) * 100) : 0
                  return (
                    <tr
                      key={p.id}
                      className={cn("cursor-pointer transition-colors hover:bg-muted/40", selected.has(p.id) && "bg-primary/5")}
                      onClick={() => setViewing(p)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={selected.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.images && p.images.length > 0 ? (
                            <img
                              src={p.images[0]}
                              alt={p.name}
                              className="h-10 w-10 rounded-lg object-cover bg-muted border border-border flex-shrink-0 animate-in fade-in duration-300"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                              <Package className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.sku || "—"} · MOQ {p.moq}
                              {p.indiamartListed && <span className="ml-2 text-[hsl(var(--success))]">· IndiaMART ✓</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                      <td className="px-4 py-3 tabular text-muted-foreground">{p.hsn || "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        <Money value={p.basePrice} />
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        <span className={margin > 0 ? "text-[hsl(var(--success))]" : ""}>{marginPct}%</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular text-muted-foreground">{p.gstRate}%</td>
                      <td className="px-4 py-3">
                        <StatusBadge list={PRODUCT_STATUS} status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => { e.stopPropagation(); setEditing(p); }}>
                        <button className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit product">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </Card>
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

// Upload guardrails — keep the base64 payload within localStorage/JSON limits.
const MAX_IMAGES = 8
const MAX_FILE_MB = 10
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

// Compress and resize images to stay within localStorage / JSON size limits
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const MAX_WIDTH = 600 // Good size for thumbnails / detail views
        const MAX_HEIGHT = 600
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        // JPEG has no alpha channel — paint white first so transparent PNGs
        // (cutouts, logos) don't flatten to black.
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        // Output compressed JPEG to keep size minimal
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75)
        resolve(dataUrl)
      }
      img.onerror = () => {
        // Fallback to original read if image load fails
        resolve(event.target.result)
      }
    }
    reader.onerror = () => {
      resolve(null)
    }
  })
}


function ProductDetail({ open, product, quotations = [], invoices = [], onClose, onEdit }) {
  const [activeImgIndex, setActiveImgIndex] = useState(0)

  useEffect(() => {
    setActiveImgIndex(0)
  }, [product])

  if (!open || !product) return null

  const margin = round2(product.basePrice - product.costPrice)
  const marginPct = product.basePrice ? Math.round((margin / product.basePrice) * 100) : 0

  const linkedQuotes = quotations.filter((q) => q.lines?.some((l) => l.productId === product.id))
  const linkedInvoices = invoices.filter((i) => i.lines?.some((l) => l.productId === product.id))

  const images = product.images || []
  const hasImages = images.length > 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={product.name}
      subtitle={product.sku || "No SKU"}
      width="max-w-lg"
      footer={
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => onEdit(product)}>
            <Pencil className="h-4 w-4 mr-1.5" /> Edit product
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Image Gallery */}
        <div className="space-y-2">
          {hasImages ? (
            <div className="relative aspect-video w-full rounded-xl border border-border bg-muted overflow-hidden">
              <img
                src={images[activeImgIndex]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                {activeImgIndex + 1} / {images.length}
              </span>
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
              <Package size={48} className="text-muted-foreground/55 mb-2" />
              <span className="text-xs">No images uploaded</span>
            </div>
          )}

          {hasImages && images.length > 1 && (
            <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImgIndex(idx)}
                  className={cn(
                    "relative h-14 w-14 flex-shrink-0 rounded-lg border overflow-hidden cursor-pointer",
                    idx === activeImgIndex ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-muted-foreground"
                  )}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Basic Meta Grid */}
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/20 p-4">
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Category</div>
            <div className="font-semibold text-foreground text-sm">{product.category || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Status</div>
            <div className="mt-0.5">
              <StatusBadge list={PRODUCT_STATUS} status={product.status} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">SKU</div>
            <div className="font-semibold text-foreground text-sm font-mono">{product.sku || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Material / Spec</div>
            <div className="font-semibold text-foreground text-sm truncate" title={product.material}>
              {product.material || "—"}
            </div>
          </div>
        </div>

        {/* Financial Overview */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground">Pricing & Margin</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-muted/10 p-3.5 text-center">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Selling Price</div>
              <div className="mt-1 font-bold text-foreground text-base">
                {formatCurrency(product.basePrice)}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/10 p-3.5 text-center">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Cost Price</div>
              <div className="mt-1 font-bold text-muted-foreground text-base">
                {formatCurrency(product.costPrice)}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/10 p-3.5 text-center">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Margin</div>
              <div className={cn("mt-1 font-bold text-base", margin > 0 ? "text-[hsl(var(--success))]" : "text-foreground")}>
                {marginPct}%
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm flex items-center justify-between">
            <span className="text-muted-foreground font-medium">Net Gross Margin:</span>
            <span className={cn("font-bold", margin > 0 ? "text-[hsl(var(--success))]" : "text-foreground")}>
              {formatCurrency(margin)} per unit
            </span>
          </div>
        </div>

        {/* Logistics & Tax */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground">Tax & Logistics</h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-border p-3 text-center">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">HSN</div>
              <div className="mt-1 font-semibold text-foreground text-sm font-mono">{product.hsn || "—"}</div>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">GST</div>
              <div className="mt-1 font-semibold text-foreground text-sm">{product.gstRate}%</div>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Unit</div>
              <div className="mt-1 font-semibold text-foreground text-sm">{product.unit || "pcs"}</div>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">MOQ</div>
              <div className="mt-1 font-semibold text-foreground text-sm">{product.moq || 1}</div>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Production Lead Time:</span>
            <span className="font-semibold text-foreground">{product.leadTimeDays || 0} days</span>
          </div>
        </div>

        {/* Description (if exists) */}
        {product.description && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground">Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line bg-muted/5 rounded-xl border border-border p-4">
              {product.description}
            </p>
          </div>
        )}

        {/* Linked Records Analytics */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground">Usage Analytics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Linked Quotations</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">{linkedQuotes.length}</span>
                <span className="text-xs text-muted-foreground">quotes</span>
              </div>
              {linkedQuotes.length > 0 && (
                <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2">
                  {linkedQuotes.slice(0, 3).map((q) => (
                    <div key={q.id} className="text-xs flex justify-between text-muted-foreground">
                      <span className="font-medium truncate max-w-[120px]">{q.quoteNumber || "Quote"}</span>
                      <span className="truncate max-w-[100px]">{q.customer?.company || q.customer?.name || "Customer"}</span>
                    </div>
                  ))}
                  {linkedQuotes.length > 3 && (
                    <div className="text-[10px] text-muted-foreground/75 italic">
                      + {linkedQuotes.length - 3} more quotations
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Linked Invoices</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">{linkedInvoices.length}</span>
                <span className="text-xs text-muted-foreground">invoices</span>
              </div>
              {linkedInvoices.length > 0 && (
                <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2">
                  {linkedInvoices.slice(0, 3).map((i) => (
                    <div key={i.id} className="text-xs flex justify-between text-muted-foreground">
                      <span className="font-medium truncate max-w-[120px]">{i.invoiceNumber || "Invoice"}</span>
                      <span className="truncate max-w-[100px]">{i.customer?.company || i.customer?.name || "Customer"}</span>
                    </div>
                  ))}
                  {linkedInvoices.length > 3 && (
                    <div className="text-[10px] text-muted-foreground/75 italic">
                      + {linkedInvoices.length - 3} more invoices
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

function ProductForm({ open, product, categories = [], onClose }) {
  const isEdit = !!product
  const [form, setForm] = useState(newProduct())
  const [errors, setErrors] = useState({})
  const [urlInput, setUrlInput] = useState("")
  const [isCompressing, setIsCompressing] = useState(false)
  const [hasManuallyChangedCategory, setHasManuallyChangedCategory] = useState(false)

  const addImageUrl = () => {
    if (!urlInput.trim()) return
    setForm((f) => ({
      ...f,
      images: [...(f.images || []), urlInput.trim()]
    }))
    setUrlInput("")
  }

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = "" // clear input early so re-selecting the same file works
    if (!files.length) return

    // Guardrails: cap the total number of images and reject oversized files
    // before they bloat the base64 payload / localStorage.
    const currentCount = (form.images || []).length
    const room = MAX_IMAGES - currentCount
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_IMAGES} images per product.`)
      return
    }
    const oversized = files.filter((f) => f.size > MAX_FILE_BYTES)
    let accepted = files.filter((f) => f.size <= MAX_FILE_BYTES)
    if (oversized.length) toast.error(`${oversized.length} file(s) skipped — over ${MAX_FILE_MB}MB.`)
    let trimmed = false
    if (accepted.length > room) {
      accepted = accepted.slice(0, room)
      trimmed = true
    }
    if (!accepted.length) return

    setIsCompressing(true)
    try {
      const compressedUrls = await Promise.all(accepted.map(compressImage))
      const validUrls = compressedUrls.filter(Boolean)
      setForm((f) => ({
        ...f,
        images: [...(f.images || []), ...validUrls]
      }))
      if (validUrls.length) toast.success(`Added ${validUrls.length} image(s)`)
      if (validUrls.length < accepted.length) toast.error(`${accepted.length - validUrls.length} image(s) couldn't be processed.`)
      if (trimmed) toast.error(`Only the first ${room} added — ${MAX_IMAGES}-image limit reached.`)
    } catch (err) {
      console.error("Image upload/compression error:", err)
      toast.error("Failed to upload/compress some images")
    } finally {
      setIsCompressing(false)
    }
  }

  const removeImage = (indexToRemove) => {
    setForm((f) => ({
      ...f,
      images: (f.images || []).filter((_, idx) => idx !== indexToRemove)
    }))
  }

  const makePrimary = (index) => {
    setForm((f) => {
      const currentImages = f.images || []
      if (index === 0 || index >= currentImages.length) return f
      const nextImages = [...currentImages]
      const [selectedImg] = nextImages.splice(index, 1)
      nextImages.unshift(selectedImg)
      return {
        ...f,
        images: nextImages
      }
    })
  }

  const categoriesRef = useRef(categories)
  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  // Reset the form whenever the drawer target changes.
  useEffect(() => {
    if (open) {
      if (product) {
        setForm({ ...newProduct(), ...product })
      } else {
        const defaultProd = newProduct()
        const defaultCat = categoriesRef.current.find((c) => c.name === defaultProd.category)
        setForm({
          ...defaultProd,
          hsn: defaultCat?.hsn || "",
          gstRate: defaultCat && defaultCat.gstRate != null ? defaultCat.gstRate : defaultProd.gstRate,
        })
      }
      setErrors({})
      setHasManuallyChangedCategory(false)
    }
  }, [open, product])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  // Picking a category pulls its default HSN (if the product has none or matches old category default) and GST.
  const pickCategory = (name, isManual = true) => {
    if (isManual) {
      setHasManuallyChangedCategory(true)
    }
    const oldCat = categories.find((c) => c.name === form.category)
    const newCat = categories.find((c) => c.name === name)
    setForm((f) => {
      const hsnUnchanged = !f.hsn || (oldCat && f.hsn === oldCat.hsn)
      const gstUnchanged = f.gstRate == null || (oldCat && Number(f.gstRate) === Number(oldCat.gstRate)) || (!oldCat && Number(f.gstRate) === 18)

      return {
        ...f,
        category: name,
        hsn: hsnUnchanged ? (newCat?.hsn || "") : f.hsn,
        gstRate: gstUnchanged && newCat && newCat.gstRate != null ? newCat.gstRate : f.gstRate,
      }
    })
  }

  const handleNameChange = (name) => {
    set("name", name)
    if (!hasManuallyChangedCategory && name.trim()) {
      const detectedCategory = autoDetectCategory(name, categories)
      if (detectedCategory && detectedCategory.name !== form.category) {
        pickCategory(detectedCategory.name, false)
      }
    }
  }

  const save = async () => {
    const e = {}
    if (!form.name.trim()) e.name = "Name is required"
    if (form.basePrice < 0) e.basePrice = "Invalid price"
    setErrors(e)
    if (Object.keys(e).length) return

    const payload = {
      ...form,
      basePrice: round2(form.basePrice),
      costPrice: round2(form.costPrice),
      moq: Math.max(1, parseInt(form.moq) || 1),
      gstRate: Number(form.gstRate),
    }
    try {
      if (isEdit) {
        await repo.update("products", product.id, payload)
        toast.success("Product updated")
      } else {
        await repo.create("products", payload)
        toast.success("Product added")
      }
      onClose()
    } catch (err) {
      // Most likely a localStorage quota hit from large base64 images — keep the
      // drawer open so the user can remove images and retry without losing input.
      console.error("Product save failed:", err)
      toast.error(err?.message || "Couldn't save the product. Please try again.")
    }
  }

  const remove = async () => {
    if (window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      await repo.remove("products", product.id)
      toast.success("Product deleted")
      onClose()
    }
  }

  const margin = round2(form.basePrice - form.costPrice)
  const marginPct = form.basePrice ? Math.round((margin / form.basePrice) * 100) : 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit product" : "New product"}
      subtitle={isEdit ? product.sku : "Add to the product master"}
      footer={
        <div className="flex items-center justify-between">
          {isEdit ? (
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              {isEdit ? "Save changes" : "Add product"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 1. Product Name */}
        <Field label="Product name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Custom MDF Award Trophy" />
        </Field>

        {/* 2. Category */}
        <Field label="Category">
          <Select value={form.category} onChange={(e) => pickCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
            {!categories.some((c) => c.name === form.category) && form.category && (
              <option value={form.category}>{form.category}</option>
            )}
          </Select>
        </Field>

        {/* 3. SKU & Status */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="MDF-TRO-01" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {PRODUCT_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* 4. Material / Spec */}
        <Field label="Material / spec">
          <Input value={form.material} onChange={(e) => set("material", e.target.value)} placeholder="9mm MDF + acrylic front" />
        </Field>

        {/* 5. Pricing (Base & Cost Price) */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Base price (₹)" required error={errors.basePrice}>
            <Input type="number" min="0" step="0.01" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} />
          </Field>
          <Field label="Cost price (₹)" hint="For margin analytics">
            <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} />
          </Field>
        </div>

        {/* Gross Margin Banner */}
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Gross margin: </span>
          <span className={margin > 0 ? "font-semibold text-[hsl(var(--success))]" : "font-semibold text-foreground"}>
            {formatCurrency(margin)} ({marginPct}%)
          </span>
        </div>

        {/* 6. Taxation (HSN & GST %) */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="HSN code" hint="4-digit for turnover ≤ ₹5cr">
            <Input value={form.hsn} onChange={(e) => set("hsn", e.target.value)} placeholder="4420" />
          </Field>
          <Field label="GST %">
            <Select value={form.gstRate} onChange={(e) => set("gstRate", e.target.value)}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* 7. Logistics (Unit, MOQ & Lead Time) */}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Unit">
            <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="MOQ">
            <Input type="number" min="1" value={form.moq} onChange={(e) => set("moq", e.target.value)} />
          </Field>
          <Field label="Lead time (days)">
            <Input type="number" min="0" value={form.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} />
          </Field>
        </div>

        <Field label="Product images">
          <div className="space-y-3">
            {/* Image list grid */}
            {form.images && form.images.length > 0 && (
              <div className="grid grid-cols-4 gap-2.5">
                {form.images.map((img, idx) => (
                  <div key={idx} className="group relative aspect-square rounded-lg border border-border bg-muted overflow-hidden">
                    <img src={img} alt={`Product ${idx}`} className="h-full w-full object-cover" />
                    
                    {/* Hover controls overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="self-end rounded-full p-1 bg-destructive/95 hover:bg-destructive text-white transition-colors cursor-pointer"
                        title="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      
                      {idx === 0 ? (
                        <span className="self-start text-[10px] font-bold text-white bg-primary px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makePrimary(idx)}
                          className="self-start text-[10px] font-bold text-white bg-black/60 hover:bg-black/80 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                        >
                          Make primary
                        </button>
                      )}
                    </div>
                    {/* Always visible tiny primary indicator if not hovered */}
                    {idx === 0 && (
                      <span className="absolute left-1 bottom-1 text-[9px] font-bold text-white bg-primary px-1 py-0.5 rounded group-hover:hidden shadow-sm">
                        Primary
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload Area & URL Input */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {/* File Upload Zone */}
              <label className={cn(
                "flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:bg-muted/40 transition-colors text-center min-h-[90px]",
                isCompressing && "pointer-events-none opacity-60"
              )}>
                <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                <span className="text-xs font-semibold text-foreground">
                  {isCompressing ? "Processing..." : "Upload images"}
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG (compressed)</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isCompressing}
                />
              </label>

              {/* Remote URL input */}
              <div className="flex flex-col justify-between border border-border rounded-lg p-2.5 bg-muted/20 min-h-[90px]">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Or add by URL</span>
                <div className="flex gap-1.5 mt-1.5">
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="h-8 text-xs py-1 px-2.5 flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addImageUrl}
                    className="h-8"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Field>

        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short description / production notes" />
        </Field>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={!!form.indiamartListed}
            onChange={(e) => set("indiamartListed", e.target.checked)}
          />
          Listed on IndiaMART
          <span className="text-xs text-muted-foreground">— excludes it from the IndiaMART CSV export</span>
        </label>
      </div>
    </Drawer>
  )
}
