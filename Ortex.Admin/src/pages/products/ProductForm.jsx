import { useState, useEffect, useRef } from "react"
import { Trash2 } from "../../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"
import { supabase, hasSupabase } from "../../data/store/supabaseClient"
import { triggerSiteRebuild } from "../../lib/revalidate"
import { PRODUCT_STATUS, UNITS, GST_RATES, newProduct, autoDetectCategory } from "../../data/domain/schema"
import { formatCurrency, round2 } from "../../lib/format"
import { Button, Input, Select, Textarea, Field, Drawer } from "../../components/ui/Ui"
import AiCopyPanel from "./AiCopyPanel"
import ImageField from "../../components/editors/ImageField"
import { MAX_IMAGES } from "./helpers"

export default function ProductForm({ open, product, categories = [], onClose }) {
  const isEdit = !!product
  const [form, setForm] = useState(newProduct())
  const [errors, setErrors] = useState({})
  const [hasManuallyChangedCategory, setHasManuallyChangedCategory] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)

  // Generate SEO- and marketing-optimised title, description, and category via
  // the product-copywriter Edge Function (Gemini, key held server-side).
  const generateCopy = async () => {
    if (!hasSupabase) return toast.error("Connect Supabase to use AI copy.")
    if (!form.name.trim() && !form.material.trim()) {
      return toast.error("Enter a product name or a few keywords first.")
    }
    setAiBusy(true)
    try {
      const allowedCategories = categories.map((c) => c.name)
      const { data, error } = await supabase.functions.invoke("product-copywriter", {
        body: {
          name: form.name,
          category: form.category,
          material: form.material,
          basePrice: form.basePrice,
          unit: form.unit,
          moq: form.moq,
          allowedCategories,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setForm((f) => ({
        ...f,
        name: data.name?.trim() || f.name,
        description: data.description?.trim() || f.description,
        category: allowedCategories.includes(data.category) ? data.category : f.category,
      }))
      if (data.category && allowedCategories.includes(data.category)) setHasManuallyChangedCategory(true)
      toast.success("AI copy generated - review before saving")
    } catch (err) {
      console.error("AI copy failed:", err)
      toast.error(err?.message || "AI generation failed")
    } finally {
      setAiBusy(false)
    }
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
      triggerSiteRebuild()
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
      triggerSiteRebuild()
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
        {/* AI copywriter - fills SEO title, marketing description, and category */}
        {hasSupabase && <AiCopyPanel busy={aiBusy} onGenerate={generateCopy} />}

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

        {/* 5. Pricing (Base & Cost Price) — console only, never published */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Base price (₹)" required error={errors.basePrice}>
            <Input type="number" min="0" step="0.01" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} />
          </Field>
          <Field label="Cost price (₹)" hint="For margin analytics">
            <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} />
          </Field>
        </div>

        {/* Gross Margin Banner */}
        <div className="rounded-lg bg-muted/30 px-4 py-2.5 text-sm">
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

        <ImageField images={form.images || []} onChange={(images) => set("images", images)} bucket="products" label="Product images" max={MAX_IMAGES} />

        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short description / production notes" />
        </Field>

        {/* 8. Where it appears */}
        <div className="squircle space-y-3 rounded-[16px] border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibility</p>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={form.showOnWebsite !== false}
              onChange={(e) => set("showOnWebsite", e.target.checked)}
            />
            <span>
              Show on the website
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Controls the public catalogue and the website quote builder. Untick to keep selling it from the
                console without listing it publicly. Status "draft" or "archived" hides it either way.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={!!form.indiamartListed}
              onChange={(e) => set("indiamartListed", e.target.checked)}
            />
            <span>
              Listed on IndiaMART
              <span className="mt-0.5 block text-xs text-muted-foreground">Excludes it from the IndiaMART CSV export.</span>
            </span>
          </label>

          <p className="border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
            Price, cost, HSN and GST never reach the website — it reads a view that hands out name, photos,
            material, MOQ and lead time only. Rates appear when <em>you</em> build a quotation, and stay editable
            per line so you can price to the quantity in front of you.
          </p>
        </div>
      </div>
    </Drawer>
  )
}
