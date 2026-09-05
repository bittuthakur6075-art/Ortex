import { ImageIcon } from "../../components/ui/Icons"
import { formatNumber } from "../../lib/format"
import { cn } from "../../lib/cn"

// What the customer actually asked for. The website's RFQ builder sends items
// and quantities only - never rates - so this panel deliberately shows no
// money. Catalogue rates are applied later, in the quotation editor.
export default function EnquiryRequest({ items = [], artwork, message }) {
  if (!items.length) {
    return (
      <div className="space-y-3">
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {message?.trim() ? message : <span className="text-subtle-foreground">No message was sent with this enquiry.</span>}
        </p>
        {artwork && <ArtworkNote artwork={artwork} />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {items.map((it, i) => (
          <li key={`${it.productId || it.sku || it.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{it.name || "Custom item"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[it.sku, it.category].filter(Boolean).join(" · ") || "Not in the catalogue"}
              </div>
            </div>
            <span className="flex-none text-sm font-semibold text-foreground tabular">
              {formatNumber(it.quantity)} {it.unit || "pcs"}
            </span>
          </li>
        ))}
      </ul>
      {artwork && <ArtworkNote artwork={artwork} />}
      <p className="text-[11px] text-muted-foreground">
        Rates come from your catalogue when the quotation is made. The website never sends prices.
      </p>
    </div>
  )
}

function ArtworkNote({ artwork }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] font-medium",
        artwork.failed ? "border-destructive/30 bg-destructive/8 text-destructive-text" : "border-success/30 bg-success/8 text-success-text",
      )}
    >
      <ImageIcon className="h-4 w-4 flex-none" />
      {artwork.failed
        ? `Artwork ${artwork.fileName} did not upload - ask the customer to resend it.`
        : `Artwork attached: ${artwork.fileName}`}
    </div>
  )
}
