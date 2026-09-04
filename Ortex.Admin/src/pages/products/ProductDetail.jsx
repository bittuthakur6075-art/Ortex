import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Package, Pencil } from "../../components/ui/Icons"
import { PRODUCT_STATUS } from "../../data/domain/schema"
import { formatCurrency, round2 } from "../../lib/format"
import { cn } from "../../lib/cn"
import { Button, StatusBadge, Drawer } from "../../components/ui/Ui"

export default function ProductDetail({ open, product, quotations = [], invoices = [], onClose, onEdit }) {
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
                    <Link
                      key={q.id}
                      to="/quotations"
                      state={{ openId: q.id }}
                      className="text-xs flex justify-between text-muted-foreground hover:text-primary"
                      title={`Open quotation ${q.number || ""}`}
                    >
                      <span className="font-medium truncate max-w-[120px]">{q.number || "Quote"}</span>
                      <span className="truncate max-w-[100px]">{q.customer?.company || q.customer?.name || "Customer"}</span>
                    </Link>
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
                    <Link
                      key={i.id}
                      to="/billing?tab=invoices"
                      state={{ openId: i.id }}
                      className="text-xs flex justify-between text-muted-foreground hover:text-primary"
                      title={`Open invoice ${i.number || ""}`}
                    >
                      <span className="font-medium truncate max-w-[120px]">{i.number || "Invoice"}</span>
                      <span className="truncate max-w-[100px]">{i.customer?.company || i.customer?.name || "Customer"}</span>
                    </Link>
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
