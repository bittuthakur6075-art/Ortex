import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Tags, Package, Pencil, Plus, ArrowUpRight } from "../../components/ui/Icons"
import { PRODUCT_STATUS, slugifyCategory } from "../../data/domain/schema"
import { canAccess } from "../../data/domain/modules"
import { useProfile } from "../../hooks/useProfile"
import { formatCurrency, formatNumber } from "../../lib/format"
import { Badge, Button, Drawer, StatusBadge } from "../../components/ui/Ui"
import { RecordActivity } from "../../components/ui/RecordActivity"
import { ImageViewer } from "../../components/ui/ImageViewer"
import { Section, Pair, Empty, Copy } from "./DetailParts"

// A category as a shelf rather than a form, the console's port of the phone's
// CategoryDetailScreen: the banner, how many products sit on it and whether the
// website shows it, the HSN/GST every product on it inherits, the products
// themselves, and the website copy. Editing stays one click away, so opening a
// category to see what it holds no longer risks saving it.
export default function CategoryDetail({ open, category, products = [], onClose, onEdit }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const [viewerOpen, setViewerOpen] = useState(false)

  // Products reference a category by NAME, not id.
  const onShelf = useMemo(
    () =>
      category
        ? products
            .filter((p) => p.category === category.name)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        : [],
    [products, category],
  )

  if (!open || !category) return null

  const canProducts = canAccess(profile, "products")
  const live = category.active !== false
  const slug = category.slug || slugifyCategory(category.name)
  const differing = onShelf.filter((p) => (category.hsn && p.hsn && p.hsn !== category.hsn) || Number(p.gstRate) !== Number(category.gstRate))

  const goTo = (state) => {
    onClose()
    navigate("/catalog?tab=products", { state })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="w-[40vw] min-w-[460px] max-w-none"
      title={category.displayName || category.name}
      subtitle={[category.displayName && category.displayName !== category.name ? category.name : null, `/${slug}`].filter(Boolean).join(" · ")}
      footer={
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => onEdit(category)}>
            <Pencil className="h-4 w-4" /> Edit category
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {category.image ? (
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            aria-label="View category image full screen"
            className="squircle block aspect-[16/9] w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-muted"
          >
            <img src={category.image} alt={category.displayName || category.name} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="squircle flex aspect-[16/9] w-full flex-col items-center justify-center gap-1.5 rounded-[16px] bg-muted text-muted-foreground">
            <Tags className="h-8 w-8 opacity-50" />
            <span className="text-[11px]">No category image</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue" className="h-[22px] rounded-full px-2 text-xs">
            {onShelf.length} product{onShelf.length === 1 ? "" : "s"}
          </Badge>
          <Badge tone={live ? "emerald" : "slate"} className="h-[22px] rounded-full px-2 text-xs">
            {live ? "Shown on website" : "Hidden from website"}
          </Badge>
          {Number(category.sortOrder) ? <span className="text-xs text-subtle-foreground">Sort order {category.sortOrder}</span> : null}
        </div>

        <Section title="Tax defaults" note="Every new product on this shelf inherits these">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <Pair label="HSN" value={category.hsn || "Not set"} mono />
            <Pair label="GST" value={`${category.gstRate ?? 18}%`} />
          </dl>
          {differing.length > 0 && (
            <p className="mt-2.5 text-xs text-warning-text">
              {differing.length} product{differing.length === 1 ? " carries" : "s carry"} a different HSN or GST rate from these defaults.
            </p>
          )}
        </Section>

        <Section
          title="Products"
          action={
            canProducts ? (
              <Button variant="secondary" size="sm" onClick={() => goTo({ newProductCategory: category.name })}>
                <Plus className="h-4 w-4" /> Add a product here
              </Button>
            ) : null
          }
        >
          {onShelf.length === 0 ? (
            <Empty>Nothing on this shelf yet. The website shows an empty category until a product is added to it.</Empty>
          ) : (
            <ul className="divide-y divide-dashed divide-border">
              {onShelf.map((p) => {
                const row = (
                  <>
                    <span className="squircle flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-[10px] bg-muted text-muted-foreground">
                      {p.images?.[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" /> : <Package className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{p.name || "Untitled product"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[p.sku, `MOQ ${formatNumber(p.moq || 1)} ${p.unit || "pcs"}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {p.status && p.status !== "active" && <StatusBadge list={PRODUCT_STATUS} status={p.status} />}
                    <span className="flex-none font-semibold text-foreground tabular">{formatCurrency(p.basePrice)}</span>
                    {canProducts && <ArrowUpRight variant="Linear" className="h-3.5 w-3.5 flex-none text-muted-foreground" />}
                  </>
                )
                return (
                  <li key={p.id}>
                    {canProducts ? (
                      <button
                        type="button"
                        onClick={() => goTo({ openId: p.id })}
                        className="flex w-full items-center gap-3 rounded-lg px-1.5 py-2.5 text-left text-[13px] transition-colors hover:bg-accent"
                      >
                        {row}
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-1.5 py-2.5 text-[13px]">{row}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <Section title="Website copy" note="Edited in the category editor">
          <div className="space-y-3">
            <Copy label="Display heading" value={category.displayName} missing={`Not set. The site shows "${category.name}"`} />
            <Copy label="Intro paragraph" value={category.intro} />
            <Copy label="SEO title" value={category.seoTitle} />
            <Copy label="SEO description" value={category.seoDescription} />
          </div>
        </Section>

        {category.description && (
          <Section title="Internal notes" note="Never shown on the website">
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{category.description}</p>
          </Section>
        )}

        <Section title="Activity">
          <RecordActivity collection="categories" record={category} bare title="" />
        </Section>
      </div>
      <ImageViewer
        open={viewerOpen && !!category.image}
        images={category.image ? [category.image] : []}
        alt={category.displayName || category.name}
        onClose={() => setViewerOpen(false)}
      />
    </Drawer>
  )
}
