import { useState, useEffect, useMemo } from "react"
import { Tags, Plus, Pencil, Trash2, Sparkles, X } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection, useSorting } from "../data/hooks"
import { newCategory, slugifyCategory, GST_RATES, PRODUCT_CATEGORIES } from "../data/schema"
import { uploadImage, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "../lib/imageUpload"
import { triggerSiteRebuild } from "../lib/revalidate"
import PageHeader from "../components/PageHeader"
import { Button, Card, Input, Select, Textarea, Field, EmptyState, Modal, PageLoader, SortTh } from "../components/ui"

export default function Categories() {
  const { items, loading } = useCollection("categories")
  const { items: products } = useCollection("products")
  const [editing, setEditing] = useState(null) // category | "new" | null
  const [sort, onSort] = useSorting("name")
  const countFor = (name) => products.filter((p) => p.category === name).length

  const sortedItems = useMemo(() => {
    const { key, desc } = sort
    const sorted = [...items].sort((a, b) => {
      let valA = a[key]
      let valB = b[key]
      if (key === "productsCount") {
        valA = countFor(a.name)
        valB = countFor(b.name)
      }
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "string") return valA.localeCompare(valB)
      return valA - valB
    })
    return desc ? sorted.reverse() : sorted
  }, [items, sort, products])

  // One-click seed of the standard Ortex categories the first time.
  const seedDefaults = async () => {
    await repo.bulkCreate(
      "categories",
      PRODUCT_CATEGORIES.map((name) => newCategory({ name, gstRate: 18 })),
    )
    toast.success("Standard categories added")
  }

  return (
    <div>
      <PageHeader title="Product categories" subtitle="Master list with default HSN & GST — auto-fills onto products">
        {items.length > 0 && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New category
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          description="Add the standard Ortex categories to get started, or create your own."
          action={
            <div className="flex gap-2">
              <Button onClick={seedDefaults}>
                <Sparkles className="h-4 w-4" /> Add standard categories
              </Button>
              <Button variant="outline" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> New category
              </Button>
            </div>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortTh sortKey="name" sort={sort} onSort={onSort}>Category</SortTh>
                  <SortTh sortKey="hsn" sort={sort} onSort={onSort}>Default HSN</SortTh>
                  <SortTh sortKey="gstRate" sort={sort} onSort={onSort} align="right">Default GST</SortTh>
                  <SortTh sortKey="productsCount" sort={sort} onSort={onSort} align="right">Products</SortTh>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedItems.map((c) => (
                  <tr key={c.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setEditing(c)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{c.name}</div>
                      {c.description && <div className="max-w-md truncate text-xs text-muted-foreground">{c.description}</div>}
                    </td>
                    <td className="px-4 py-3 tabular text-muted-foreground">{c.hsn || "—"}</td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">{c.gstRate}%</td>
                    <td className="px-4 py-3 text-right tabular text-muted-foreground">{countFor(c.name)}</td>
                    <td className="px-4 py-3 text-right">
                      <Pencil className="ml-auto h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CategoryForm open={editing !== null} category={editing === "new" ? null : editing} usage={editing && editing !== "new" ? countFor(editing.name) : 0} onClose={() => setEditing(null)} />
    </div>
  )
}

function CategoryForm({ open, category, usage, onClose }) {
  const isEdit = !!category
  const [form, setForm] = useState(newCategory())
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(category ? { ...newCategory(), ...category } : newCategory())
      setError("")
    }
  }, [open, category])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) return toast.error(`Image too large — over ${MAX_IMAGE_MB}MB.`)
    setUploading(true)
    try {
      const url = await uploadImage(file, "categories")
      set("image", url)
      toast.success("Image uploaded")
    } catch (err) {
      console.error("Category image upload failed:", err)
      toast.error("Failed to upload image")
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!form.name.trim()) return setError("Name is required")
    const payload = {
      ...form,
      gstRate: Number(form.gstRate),
      sortOrder: Number(form.sortOrder) || 0,
      // Auto-derive a URL slug from the name when the admin leaves it blank.
      slug: form.slug.trim() || slugifyCategory(form.name),
    }
    if (isEdit) {
      await repo.update("categories", category.id, payload)
      toast.success("Category updated")
    } else {
      await repo.create("categories", payload)
      toast.success("Category added")
    }
    triggerSiteRebuild()
    onClose()
  }

  const remove = async () => {
    if (usage > 0) return toast.error(`In use by ${usage} product(s) — reassign them first`)
    if (window.confirm(`Delete category "${category.name}"?`)) {
      await repo.remove("categories", category.id)
      toast.success("Category deleted")
      triggerSiteRebuild()
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit category" : "New category"}
      width="max-w-2xl"
      footer={
        <div className="flex w-full items-center justify-between">
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
              {isEdit ? "Save" : "Add category"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category name" required error={error} hint="Must match the name on products">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acrylic products" autoFocus />
          </Field>
          <Field label="URL slug" hint="Auto-filled from name if blank">
            <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugifyCategory(form.name) || "acrylic-products"} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Default HSN" hint="Pre-fills on products">
            <Input value={form.hsn} onChange={(e) => set("hsn", e.target.value)} placeholder="3926" />
          </Field>
          <Field label="Default GST">
            <Select value={form.gstRate} onChange={(e) => set("gstRate", e.target.value)}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website content</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active !== false} onChange={(e) => set("active", e.target.checked)} />
              Show on website
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Display heading" hint="Shown on site; falls back to name">
              <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder={form.name || "Custom Acrylic Products"} />
            </Field>
            <Field label="Sort order" hint="Lower shows first">
              <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="0" />
            </Field>
          </div>

          <Field label="Intro paragraph" hint="Marketing copy on the category page">
            <Textarea value={form.intro} onChange={(e) => set("intro", e.target.value)} placeholder="One or two sentences describing this category…" />
          </Field>

          <Field label="Category image">
            {form.image ? (
              <div className="flex items-center gap-3">
                <img src={form.image} alt="" className="h-16 w-16 rounded-md object-cover border border-border" />
                <Button variant="outline" size="sm" onClick={() => set("image", "")}>
                  <X className="h-4 w-4" /> Remove
                </Button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50">
                <Plus className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
              </label>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4">
            <Field label="SEO title" hint="Browser tab + Google result title">
              <Input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder="Custom Acrylic Products Manufacturer | Ortex Industries" />
            </Field>
            <Field label="SEO description" hint="Google result snippet (~155 chars)">
              <Textarea value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} placeholder="Short description for search engines…" />
            </Field>
          </div>
        </div>

        <Field label="Internal notes">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Private notes (not shown on website)" />
        </Field>
      </div>
    </Modal>
  )
}
