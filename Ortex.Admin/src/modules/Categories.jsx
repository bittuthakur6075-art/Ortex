import { useState, useEffect } from "react"
import { Tags, Plus, Pencil, Trash2, Sparkles } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection } from "../data/hooks"
import { newCategory, GST_RATES, PRODUCT_CATEGORIES } from "../data/schema"
import PageHeader from "../components/PageHeader"
import { Button, Card, Input, Select, Textarea, Field, EmptyState, Modal, PageLoader } from "../components/ui"

export default function Categories() {
  const { items, loading } = useCollection("categories")
  const { items: products } = useCollection("products")
  const [editing, setEditing] = useState(null) // category | "new" | null

  const countFor = (name) => products.filter((p) => p.category === name).length

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
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Default HSN</th>
                  <th className="px-4 py-3 text-right font-medium">Default GST</th>
                  <th className="px-4 py-3 text-right font-medium">Products</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((c) => (
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

  useEffect(() => {
    if (open) {
      setForm(category ? { ...newCategory(), ...category } : newCategory())
      setError("")
    }
  }, [open, category])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return setError("Name is required")
    const payload = { ...form, gstRate: Number(form.gstRate) }
    if (isEdit) {
      await repo.update("categories", category.id, payload)
      toast.success("Category updated")
    } else {
      await repo.create("categories", payload)
      toast.success("Category added")
    }
    onClose()
  }

  const remove = async () => {
    if (usage > 0) return toast.error(`In use by ${usage} product(s) — reassign them first`)
    if (window.confirm(`Delete category "${category.name}"?`)) {
      await repo.remove("categories", category.id)
      toast.success("Category deleted")
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit category" : "New category"}
      width="max-w-md"
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
        <Field label="Category name" required error={error}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acrylic products" autoFocus />
        </Field>
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
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional notes" />
        </Field>
      </div>
    </Modal>
  )
}
