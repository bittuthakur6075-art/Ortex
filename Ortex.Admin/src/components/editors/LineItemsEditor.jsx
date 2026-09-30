import { Fragment } from "react"
import { Plus, Trash2 } from "../ui/Icons"
import { newLine, GST_RATES } from "../../data/domain/schema"
import { computeDocument } from "../../lib/pricing"
import { formatCurrency, round2 } from "../../lib/format"
import { Button, Input, Select } from "../ui/Ui"
import { cn } from "../../lib/cn"

// Editable line-items grid + live totals, shared by quotations and invoices.
// Layout follows the Keystone document: a compact bordered grid with an
// uppercase head, and a right-half totals block whose rows carry a hairline
// above them (no boxed summary). Props:
//   lines, onChange(lines)
//   products        , product master for the picker (autofills a line)
//   extraDiscountPercent, onExtraDiscountChange
//   interState      , controls the GST split shown in the summary
// `showTotals` false leaves the totals to the page (the quotation editor's rail).
export default function LineItemsEditor({ lines, onChange, products, extraDiscountPercent = 0, onExtraDiscountChange, interState, showTotals = true }) {
  const totals = computeDocument(lines, { interState, extraDiscountPercent })

  const update = (i, patch) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i))
  const add = () => onChange([...lines, newLine()])

  const pickProduct = (i, productId) => {
    const p = products.find((x) => x.id === productId)
    if (!p) return update(i, { productId: null })
    const line = lines[i]
    // The description is the sentence that PRINTS, so a product is only allowed
    // to write it when there is nothing there to lose: an empty field, or the
    // name of the product that was picked a moment ago and has now been swapped.
    // Anything typed by hand survives picking, re-picking and correcting the
    // product. HSN, rate and GST are the catalogue's to state, so they are
    // copied every time.
    const previous = products.find((x) => x.id === line.productId)
    const untouched = !line.description?.trim() || line.description.trim() === previous?.name?.trim()
    update(i, {
      productId: p.id,
      description: untouched ? p.name : line.description,
      hsn: p.hsn,
      rate: p.basePrice,
      gstRate: p.gstRate,
      quantity: line.quantity < p.moq ? p.moq : line.quantity,
    })
  }

  // A line that is not a catalogue product: the typed name becomes the
  // description and the rest of the line is left where it is, so a rate already
  // keyed in is not wiped by renaming what it is for.
  const customItem = (i, text) => update(i, { productId: null, description: text })

  const cell = "h-8 px-2 text-[13px] shadow-none"
  // No browser spinner arrows: in a 70px cell they hide the number itself.
  const num = cn(cell, "text-right tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none")

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        {/* Each line is two rows: the product and its description across the
            full width, then the numbers. Nine columns side by side left the
            product name a few characters wide beside the totals rail. */}
        <table className="w-full min-w-[640px] table-fixed text-left text-sm">
          <thead className="mt-head">
            <tr>
              <th className="w-9 px-2 py-2.5 text-center">#</th>
              <th className="px-2 py-2.5">Item · HSN</th>
              <th className="w-[80px] px-2 py-2.5 text-right">Qty</th>
              <th className="w-[62px] px-2 py-2.5">Unit</th>
              <th className="w-[84px] px-2 py-2.5 text-right">Rate</th>
              <th className="w-[60px] px-2 py-2.5 text-right">Disc %</th>
              <th className="w-[76px] px-2 py-2.5 text-right">GST %</th>
              <th className="w-[100px] px-2 py-2.5 text-right">Amount</th>
              <th className="w-9 px-1 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                  No items yet. Add a line, then pick a product or type your own item name.
                </td>
              </tr>
            )}
            {lines.map((line, i) => {
              const computed = totals.lines[i]
              return (
                <Fragment key={i}>
                <tr className="align-top border-t border-border first:border-t-0">
                  <td rowSpan={2} className="px-2 py-3 text-center text-xs text-subtle-foreground tabular">{i + 1}</td>
                  <td colSpan={8} className="px-2 pb-1.5 pt-2.5">
                    <div className="flex flex-col gap-1.5 sm:flex-row">
                    <div className="min-w-0 sm:w-[45%]">
                    <Select
                      searchable
                      searchPlaceholder="Search the catalogue, or type a new item name"
                      value={line.productId || ""}
                      onChange={(e) => pickProduct(i, e.target.value)}
                      /* Closed, the control says what the line IS: the product,
                         or the name typed for a one-off. "Custom item…" is the
                         empty state and the way back to it, not a label to sit
                         under while a name is already written. */
                      valueLabel={line.productId ? "" : line.description}
                      placeholder="Type or pick a product"
                      /* Not everything quoted is in the catalogue: a one-off
                         job, a custom size. Searching for it and finding
                         nothing is where the name is already typed, so that
                         is where it becomes the line's description, exactly
                         as the phone app's item sheet does it. */
                      onCreate={(text) => customItem(i, text)}
                      createLabel={(text) => `Custom item "${text}"`}
                      className={cn(cell, "pr-8")}
                    >
                      <option value="">Custom item (not in the catalogue)</option>
                      {products
                        .filter((p) => p.status !== "archived")
                        .map((p) => (
                          <option key={p.id} value={p.id} data-search={[p.sku, p.category, p.hsn].filter(Boolean).join(" ")}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                    </div>
                    <Input value={line.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Description as it prints on the quotation" className={cn(cell, "min-w-0 flex-1")} />
                    </div>
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="px-2 pb-2.5 pt-0">
                    <Input value={line.hsn} onChange={(e) => update(i, { hsn: e.target.value })} className={cell} placeholder="HSN" />
                  </td>
                  <td className="px-2 pb-2.5 pt-0">
                    <Input type="number" min="0" value={line.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className={num} />
                  </td>
                  <td className="px-2 pb-2.5 pt-0">
                    <Input value={line.unit ?? "pcs"} onChange={(e) => update(i, { unit: e.target.value })} className={cell} placeholder="pcs" />
                  </td>
                  <td className="px-2 pb-2.5 pt-0">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.rate}
                      onChange={(e) => update(i, { rate: Number(e.target.value) })}
                      className={cn(num, line.productId && !Number(line.rate) && "border-warning")}
                      title={
                        line.productId && !Number(line.rate)
                          ? "This product has no base price in the catalogue. Set one under Catalog, or type the rate here."
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-2 pb-2.5 pt-0">
                    <Input type="number" min="0" max="100" value={line.discountPercent} onChange={(e) => update(i, { discountPercent: Number(e.target.value) })} className={num} />
                  </td>
                  <td className="px-2 pb-2.5 pt-0">
                    <Select value={line.gstRate} onChange={(e) => update(i, { gstRate: Number(e.target.value) })} className={cn(cell, "gap-1 !px-2 text-left")}>
                      {GST_RATES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 pb-2.5 pt-1.5 text-right text-[13px] font-semibold text-foreground tabular">{formatCurrency(computed.total)}</td>
                  <td className="px-1 pb-2.5 pt-0 text-right">
                    <Button type="button" variant="dangerGhost" size="sm" icon onClick={() => remove(i)} aria-label="Remove line" className="text-subtle-foreground">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
        <button
          type="button"
          onClick={add}
          className="flex w-full items-center gap-2 border-t border-dashed border-border px-4 py-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Add line
        </button>
      </div>

      {/* Totals - right half, hairline rows (Keystone document style) */}
      {showTotals && (
      <div className="flex flex-col items-end">
        <div className="w-full max-w-sm text-[13px]">
          <Row label="Subtotal">{formatCurrency(totals.subTotal)}</Row>
          {totals.totalDiscount > 0 && <Row label="Line discounts" tone="success">−{formatCurrency(totals.totalDiscount)}</Row>}
          <div className="flex items-center justify-between gap-3 border-t border-border py-1.5">
            <span className="text-muted-foreground">Extra discount</span>
            <span className="flex items-center gap-1.5">
              <Input
                type="number"
                min="0"
                max="100"
                value={extraDiscountPercent}
                onChange={(e) => onExtraDiscountChange(Number(e.target.value))}
                className="h-7 w-16 px-2 text-right text-xs shadow-none"
              />
              <span className="text-xs text-subtle-foreground">%</span>
            </span>
          </div>
          <Row label="Taxable value">{formatCurrency(totals.taxable)}</Row>
          {totals.interState ? (
            <Row label="IGST">{formatCurrency(totals.igst)}</Row>
          ) : (
            <>
              <Row label="CGST">{formatCurrency(totals.cgst)}</Row>
              <Row label="SGST">{formatCurrency(totals.sgst)}</Row>
            </>
          )}
          {totals.roundOff !== 0 && <Row label="Round off">{round2(totals.roundOff)}</Row>}
          <div className="flex items-center justify-between gap-3 border-t border-foreground py-2.5">
            <span className="text-[14px] font-semibold text-foreground">Grand total</span>
            <span className="text-[18px] font-semibold tracking-[-0.02em] text-foreground tabular">{formatCurrency(totals.grandTotal)}</span>
          </div>
          <p className="text-right text-[11px] text-subtle-foreground">{totals.interState ? "Inter-state supply · IGST" : "Intra-state supply · CGST + SGST"}</p>
        </div>
      </div>
      )}
    </div>
  )
}

function Row({ label, children, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular", tone === "success" ? "text-success-text" : "text-foreground")}>{children}</span>
    </div>
  )
}
