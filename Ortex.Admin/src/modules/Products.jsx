import { useState, useMemo, useEffect } from "react"
import { Package, Plus, Search, Pencil, Trash2, Download, Upload } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection, useCategories } from "../data/hooks"
import { PRODUCT_STATUS, UNITS, GST_RATES, newProduct } from "../data/schema"
import { formatCurrency, round2 } from "../lib/format"
import { exportCsv } from "../lib/csv"
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
  const { items, loading } = useCollection("products")
  const categories = useCategories()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [editing, setEditing] = useState(null) // product object or "new"
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

  // IndiaMART has no product API, so this exports a listing-friendly sheet to
  // paste/bulk-upload into the IndiaMART seller panel. Exports products not yet
  // marked "Listed on IndiaMART" (or all, if none are pending).
  const handleIndiamartExport = () => {
    const pending = filtered.filter((p) => !p.indiamartListed)
    const rows = pending.length ? pending : filtered
    exportCsv(
      `indiamart-products-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Product Name", value: (p) => p.name },
        { header: "Product Description", value: (p) => p.description || p.material },
        { header: "Product Category", value: (p) => p.category },
        { header: "Price (INR)", value: (p) => p.basePrice },
        { header: "Unit", value: (p) => p.unit },
        { header: "Minimum Order Quantity", value: (p) => p.moq },
        { header: "HSN Code", value: (p) => p.hsn },
        { header: "GST %", value: (p) => p.gstRate },
        { header: "Specifications", value: (p) => p.material },
      ],
      rows,
    )
    toast.success(`Exported ${rows.length} product(s) for IndiaMART${pending.length ? " (not yet listed)" : ""}`)
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
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
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
                    <tr key={p.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setEditing(p)}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.sku || "—"} · MOQ {p.moq}</div>
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
                      <td className="px-4 py-3 text-right">
                        <Pencil className="ml-auto h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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

function ProductForm({ open, product, categories = [], onClose }) {
  const isEdit = !!product
  const [form, setForm] = useState(newProduct())
  const [errors, setErrors] = useState({})

  // Reset the form whenever the drawer target changes.
  useEffect(() => {
    if (open) {
      setForm(product ? { ...newProduct(), ...product } : newProduct())
      setErrors({})
    }
  }, [open, product])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  // Picking a category pulls its default HSN (if the product has none) and GST.
  const pickCategory = (name) => {
    const cat = categories.find((c) => c.name === name)
    setForm((f) => ({
      ...f,
      category: name,
      hsn: f.hsn || cat?.hsn || "",
      gstRate: cat && cat.gstRate != null ? cat.gstRate : f.gstRate,
    }))
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
    if (isEdit) {
      await repo.update("products", product.id, payload)
      toast.success("Product updated")
    } else {
      await repo.create("products", payload)
      toast.success("Product added")
    }
    onClose()
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
        <Field label="Product name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Custom MDF Award Trophy" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="MDF-TRO-01" />
          </Field>
          <Field label="HSN code" hint="4-digit for turnover ≤ ₹5cr">
            <Input value={form.hsn} onChange={(e) => set("hsn", e.target.value)} placeholder="4420" />
          </Field>
        </div>
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
        <Field label="Material / spec">
          <Input value={form.material} onChange={(e) => set("material", e.target.value)} placeholder="9mm MDF + acrylic front" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Base price (₹)" required error={errors.basePrice}>
            <Input type="number" min="0" step="0.01" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} />
          </Field>
          <Field label="Cost price (₹)" hint="For margin analytics">
            <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} />
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Gross margin: </span>
          <span className={margin > 0 ? "font-semibold text-[hsl(var(--success))]" : "font-semibold text-foreground"}>
            {formatCurrency(margin)} ({marginPct}%)
          </span>
        </div>

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

        <div className="grid grid-cols-2 gap-4">
          <Field label="Lead time (days)">
            <Input type="number" min="0" value={form.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} />
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
