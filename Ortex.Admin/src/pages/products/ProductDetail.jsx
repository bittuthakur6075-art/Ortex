import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Package, Pencil, ArrowUpRight } from "../../components/ui/Icons"
import { PRODUCT_STATUS } from "../../data/domain/schema"
import { formatCurrency, formatNumber, formatDate, relativeTime } from "../../lib/format"
import { cn } from "../../lib/cn"
import { Button, StatusBadge, Drawer, Money } from "../../components/ui/Ui"
import { productAnalytics } from "./helpers"

// The product record as a sales brief rather than a form read-only. The master
// fields (price, HSN, MOQ) are the least interesting thing here — they are one
// click away in the editor. What a person opening this actually needs is
// whether the thing sells, at what price it really closes, and who buys it, so
// that leads the page and the reference fields sit underneath.
export default function ProductDetail({ open, product, quotations = [], invoices = [], onClose, onEdit }) {
  const [activeImg, setActiveImg] = useState(0)

  useEffect(() => setActiveImg(0), [product])

  if (!open || !product) return null

  const a = productAnalytics(product, quotations, invoices)
  const images = product.images || []
  const hasSold = a.units > 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="w-[40vw] min-w-[460px] max-w-none"
      title={product.name}
      subtitle={[product.sku || "No SKU", product.category].filter(Boolean).join(" · ")}
      footer={
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => onEdit(product)}>
            <Pencil className="h-4 w-4" /> Edit product
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Identity: the photo people recognise, beside the facts that decide a quote. */}
        <div className="flex gap-4">
          <div className="w-[38%] flex-none space-y-2">
            {images.length ? (
              <>
                <div className="squircle relative aspect-square w-full overflow-hidden rounded-[16px] bg-muted">
                  <img src={images[activeImg]} alt={product.name} className="h-full w-full object-cover" />
                </div>
                {images.length > 1 && (
                  <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveImg(i)}
                        aria-label={`Photo ${i + 1}`}
                        className={cn(
                          "squircle h-11 w-11 flex-none overflow-hidden rounded-[10px] border",
                          i === activeImg ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-border-strong",
                        )}
                      >
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="squircle flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-[16px] bg-muted text-muted-foreground">
                <Package className="h-8 w-8 opacity-50" />
                <span className="text-[11px]">No photo</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge list={PRODUCT_STATUS} status={product.status} />
              {product.indiamart?.listed && <span className="text-xs text-success-text">Listed on IndiaMART</span>}
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-semibold leading-none tracking-tight text-foreground tabular">
                  {formatCurrency(product.basePrice)}
                </span>
                <span className="text-[13px] text-muted-foreground">/ {product.unit || "pcs"} list</span>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Costs {formatCurrency(product.costPrice)} ·{" "}
                <span className={cn("font-medium", a.unitMargin > 0 ? "text-success-text" : "text-destructive-text")}>
                  {formatCurrency(a.unitMargin)} margin ({a.marginPct}%)
                </span>
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-dashed border-border pt-3 text-[13px]">
              <Pair label="Min order" value={`${formatNumber(product.moq || 1)} ${product.unit || "pcs"}`} />
              <Pair label="Lead time" value={product.leadTimeDays ? `${product.leadTimeDays} days` : "Not set"} />
              <Pair label="HSN" value={product.hsn || "Not set"} mono />
              <Pair label="GST" value={`${product.gstRate}%`} />
              {product.material && <Pair label="Material" value={product.material} className="col-span-2" />}
            </dl>
          </div>
        </div>

        {/* How it actually trades. */}
        <Section title="Performance" note={a.lastOrderedAt ? `Last ordered ${relativeTime(a.lastOrderedAt)}` : null}>
          {hasSold ? (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <Metric label="Revenue" value={<Money value={a.revenue} compact />} />
                <Metric label="Units sold" value={formatNumber(a.units)} />
                <Metric label="Gross profit" value={<Money value={a.grossProfit} compact />} tone={a.grossProfit > 0 ? "success" : "danger"} />
              </div>
              <div className="squircle mt-2.5 flex items-center justify-between gap-3 rounded-[14px] bg-subtle px-4 py-3 text-[13px]">
                <span className="text-muted-foreground">Average price achieved</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold text-foreground tabular">{formatCurrency(a.avgRate)}</span>
                  {a.realisation !== null && Math.abs(a.realisation) >= 0.005 && (
                    <span className={cn("text-xs font-medium", a.realisation < 0 ? "text-warning-text" : "text-success-text")}>
                      {a.realisation < 0 ? "" : "+"}
                      {Math.round(a.realisation * 100)}% vs list
                    </span>
                  )}
                </span>
              </div>
            </>
          ) : (
            <Empty>
              Never invoiced. {a.quotes > 0
                ? `Quoted ${a.quotes} time${a.quotes === 1 ? "" : "s"} for ${formatNumber(a.quotedUnits)} ${product.unit || "pcs"} — the demand is there, the orders are not.`
                : "It has not appeared on a quotation either, so nobody has been offered it yet."}
            </Empty>
          )}
        </Section>

        {/* Quoted vs won: where this product loses. */}
        <Section title="Demand">
          <div className="grid grid-cols-3 gap-2.5">
            <Metric label="Quoted on" value={`${a.quotes} quote${a.quotes === 1 ? "" : "s"}`} />
            <Metric label="Ordered on" value={`${a.orders} invoice${a.orders === 1 ? "" : "s"}`} />
            <Metric
              label="Quote to order"
              value={a.conversion === null ? "—" : `${a.conversion}%`}
              tone={a.conversion === null ? undefined : a.conversion >= 50 ? "success" : a.conversion >= 25 ? "warning" : "danger"}
            />
          </div>
        </Section>

        {a.topCustomers.length > 0 && (
          <Section title="Who buys it">
            <ul className="divide-y divide-dashed divide-border">
              {a.topCustomers.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(c.units)} {product.unit || "pcs"} across {c.orders} order{c.orders === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className="flex-none font-semibold text-foreground tabular">{formatCurrency(c.revenue)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(a.recentOrders.length > 0 || a.recentQuotes.length > 0) && (
          <Section title="Recent documents">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <DocList title="Invoices" docs={a.recentOrders} to="/billing?tab=invoices" total={a.orders} />
              <DocList title="Quotations" docs={a.recentQuotes} to="/quotations" total={a.quotes} />
            </div>
          </Section>
        )}

        {product.description && (
          <Section title="Description">
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{product.description}</p>
          </Section>
        )}
      </div>
    </Drawer>
  )
}

function Section({ title, note, children }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {note && <span className="text-xs text-subtle-foreground">{note}</span>}
      </div>
      {children}
    </section>
  )
}

const TONES = {
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-destructive-text",
}

function Metric({ label, value, tone }) {
  return (
    <div className="squircle rounded-[14px] bg-subtle px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-[17px] font-semibold leading-none tracking-tight tabular", TONES[tone] || "text-foreground")}>{value}</div>
    </div>
  )
}

function Pair({ label, value, mono, className }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 truncate font-medium text-foreground", mono && "tabular")} title={typeof value === "string" ? value : undefined}>
        {value}
      </dd>
    </div>
  )
}

function Empty({ children }) {
  return (
    <p className="squircle rounded-[14px] border border-dashed border-border px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  )
}

function DocList({ title, docs, to, total }) {
  if (!docs.length) return null
  return (
    <div className="squircle rounded-[14px] border border-border p-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="space-y-1">
        {docs.map((d) => (
          <li key={d.id}>
            <Link
              to={to}
              state={{ openId: d.id }}
              className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
            >
              <span className="truncate font-medium">{d.number || "—"}</span>
              <span className="flex flex-none items-center gap-1 text-xs">
                {formatDate(d.date || d.createdAt)}
                <ArrowUpRight variant="Linear" className="h-3.5 w-3.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {total > docs.length && <p className="mt-1.5 px-1.5 text-xs text-subtle-foreground">+{total - docs.length} more</p>}
    </div>
  )
}
