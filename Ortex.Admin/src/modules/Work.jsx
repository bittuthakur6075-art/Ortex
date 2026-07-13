import { useState, useEffect, useMemo } from "react"
import { LayoutGrid, Plus, Pencil, Trash2, Sparkles, X } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection } from "../data/hooks"
import { newWork } from "../data/schema"
import { uploadImage, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "../lib/imageUpload"
import { triggerSiteRebuild } from "../lib/revalidate"
import { supabase, hasSupabase } from "../data/supabaseClient"
import { WORK_SEED } from "../data/workSeed"
import PageHeader from "../components/PageHeader"
import { Button, Card, Input, Textarea, Field, EmptyState, Modal, PageLoader } from "../components/ui"

export default function Work() {
  const { items, loading } = useCollection("work")
  const [editing, setEditing] = useState(null) // work | "new" | null

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || String(a.title).localeCompare(String(b.title))),
    [items],
  )

  // One-click seed of the curated photos that used to be hardcoded on the site.
  const seedDefaults = async () => {
    await repo.bulkCreate(
      "work",
      WORK_SEED.map((w, i) => newWork({ ...w, sortOrder: i })),
    )
    toast.success("Sample work items added")
    triggerSiteRebuild()
  }

  return (
    <div>
      <PageHeader title="Work showcase" subtitle="Photos shown on the website /work page — add, caption, and reorder">
        {items.length > 0 && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New work item
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No work items yet"
          description="Add the sample photos to get started, or create your own."
          action={
            <div className="flex gap-2">
              <Button onClick={seedDefaults}>
                <Sparkles className="h-4 w-4" /> Add sample work
              </Button>
              <Button variant="outline" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> New work item
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {sortedItems.map((w) => (
            <Card
              key={w.id}
              className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/50"
              onClick={() => setEditing(w)}
            >
              <div className="relative aspect-square bg-muted">
                {w.image ? (
                  <img src={w.image} alt={w.alt || w.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <LayoutGrid className="h-8 w-8" />
                  </div>
                )}
                {w.active === false && (
                  <span className="absolute left-2 top-2 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-background">
                    Hidden
                  </span>
                )}
                <span className="absolute right-2 top-2 rounded-full bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium text-foreground">{w.title || "Untitled"}</div>
                <div className="truncate text-xs text-muted-foreground">{w.category || "—"}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <WorkForm open={editing !== null} work={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function WorkForm({ open, work, onClose }) {
  const isEdit = !!work
  const [form, setForm] = useState(newWork())
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [urlInput, setUrlInput] = useState("")

  useEffect(() => {
    if (open) {
      setForm(work ? { ...newWork(), ...work } : newWork())
      setError("")
      setUrlInput("")
    }
  }, [open, work])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) return toast.error(`Image too large — over ${MAX_IMAGE_MB}MB.`)
    setUploading(true)
    try {
      const url = await uploadImage(file, "work")
      set("image", url)
      toast.success("Image uploaded")
    } catch (err) {
      console.error("Work image upload failed:", err)
      toast.error("Failed to upload image")
    } finally {
      setUploading(false)
    }
  }

  const addImageUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) return toast.error("Enter a valid image URL (http/https).")
    set("image", url)
    setUrlInput("")
  }

  // Generate an SEO caption + alt text with the work-copywriter Edge Function.
  const generateCopy = async () => {
    if (!hasSupabase) return toast.error("Connect Supabase to use the AI writer.")
    if (!form.category.trim() && !form.title.trim()) {
      return toast.error("Pick a category or enter a few keywords first.")
    }
    setAiBusy(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("work-copywriter", {
        body: { category: form.category, title: form.title, notes: form.alt },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setForm((f) => ({
        ...f,
        title: data.title?.trim() || f.title,
        alt: data.alt?.trim() || f.alt,
      }))
      toast.success("AI copy generated — review before saving")
    } catch (err) {
      console.error("Work AI copy failed:", err)
      toast.error(err?.message || "AI generation failed")
    } finally {
      setAiBusy(false)
    }
  }

  const save = async () => {
    if (!form.image) return setError("An image is required")
    if (!form.title.trim()) return setError("A title is required")
    const payload = {
      ...form,
      sortOrder: Number(form.sortOrder) || 0,
      alt: form.alt.trim() || form.title.trim(),
    }
    if (isEdit) {
      await repo.update("work", work.id, payload)
      toast.success("Work item updated")
    } else {
      await repo.create("work", payload)
      toast.success("Work item added")
    }
    triggerSiteRebuild()
    onClose()
  }

  const remove = async () => {
    if (window.confirm(`Delete work item "${work.title || "Untitled"}"?`)) {
      await repo.remove("work", work.id)
      toast.success("Work item deleted")
      triggerSiteRebuild()
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit work item" : "New work item"}
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
              {isEdit ? "Save" : "Add work item"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Image" required error={error && !form.image ? error : ""}>
          {form.image ? (
            <div className="flex items-center gap-3">
              <img src={form.image} alt="" className="h-20 w-20 rounded-md object-cover border border-border" />
              <Button variant="outline" size="sm" onClick={() => set("image", "")}>
                <X className="h-4 w-4" /> Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50">
                <Plus className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImageUrl() } }}
                  placeholder="or paste an image URL"
                />
                <Button variant="outline" size="sm" onClick={addImageUrl} disabled={!urlInput.trim()}>
                  Add URL
                </Button>
              </div>
            </div>
          )}
        </Field>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caption &amp; SEO</p>
          <Button variant="outline" size="sm" onClick={generateCopy} disabled={aiBusy}>
            <Sparkles className="h-4 w-4" /> {aiBusy ? "Writing…" : "AI writer"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Title" required error={error && form.image && !form.title.trim() ? error : ""} hint="Caption shown on the photo">
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Custom printed lanyards" autoFocus />
          </Field>
          <Field label="Category" hint="Filter bucket on /work">
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Badges & Lanyards" />
          </Field>
        </div>

        <Field label="Alt text" hint="Accessibility description; falls back to title">
          <Textarea value={form.alt} onChange={(e) => set("alt", e.target.value)} placeholder="Describe what the photo shows…" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Sort order" hint="Lower shows first">
            <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="0" />
          </Field>
          <Field label="Visibility">
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active !== false} onChange={(e) => set("active", e.target.checked)} />
              Show on website
            </label>
          </Field>
        </div>
      </div>
    </Modal>
  )
}
