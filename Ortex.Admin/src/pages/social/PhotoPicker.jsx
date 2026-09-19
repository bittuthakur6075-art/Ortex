import { useMemo, useState } from "react"
import { useCollection } from "../../hooks/useCollection"
import { Modal, Segmented, SearchInput, Spinner } from "../../components/ui/Ui"
import { ImageIcon } from "../../components/ui/Icons"

// Choose a real photo for a post: any photo of an active product, or a photo
// from the Our work gallery. The pick is copied into the post (cropped to the
// feed format as a JPEG); the catalogue photo itself is never changed.
export default function PhotoPicker({ open, onClose, onPick }) {
  const { items: products, loading: loadingProducts } = useCollection("products")
  const { items: work, loading: loadingWork } = useCollection("work")
  const [tab, setTab] = useState("products")
  const [query, setQuery] = useState("")

  const photos = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (...fields) => !q || fields.some((f) => String(f || "").toLowerCase().includes(q))
    if (tab === "products") {
      return products
        .filter((p) => (p.status || "active") === "active" && matches(p.name, p.category, p.material))
        .flatMap((p) =>
          (p.images || []).filter(Boolean).map((url, i) => ({
            key: `${p.id}:${i}`,
            url,
            label: p.name || "Untitled product",
            detail: p.category || "",
            productId: p.id,
          })),
        )
    }
    return work
      .filter((w) => w.image && matches(w.title, w.category))
      .map((w) => ({ key: w.id, url: w.image, label: w.title || "Work photo", detail: w.category || "", productId: null }))
  }, [tab, query, products, work])

  const loading = tab === "products" ? loadingProducts : loadingWork

  return (
    <Modal open={open} onClose={onClose} title="Pick a photo" width="max-w-4xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            size="md"
            items={[
              { value: "products", label: "Product photos" },
              { value: "work", label: "Our work" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <SearchInput
            className="ml-auto w-full sm:w-[280px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "products" ? "Search products" : "Search work photos"}
          />
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : photos.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            {query ? "No photo matches that search." : tab === "products" ? "No active product has a photo yet." : "The work gallery has no photos yet."}
          </div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((ph) => (
              <button
                key={ph.key}
                type="button"
                onClick={() => onPick(ph)}
                className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <div className="aspect-square bg-muted">
                  <img src={ph.url} alt={ph.label} loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div className="p-2">
                  <div className="truncate text-xs font-medium text-foreground">{ph.label}</div>
                  {ph.detail && <div className="truncate text-[11px] text-muted-foreground">{ph.detail}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
