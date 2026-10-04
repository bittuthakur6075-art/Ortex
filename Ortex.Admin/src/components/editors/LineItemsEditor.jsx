import { Fragment, useState } from "react"
import { AlertTriangle, Package, Plus, Save, Search, Trash2 } from "../ui/Icons"
import { newLine, GST_RATES } from "../../data/domain/schema"
import { computeDocument } from "../../lib/pricing"
import { formatCurrency, round2 } from "../../lib/format"
import { Badge, Button, Input, Select } from "../ui/Ui"
import { cn } from "../../lib/cn"
import { errorsUnder } from "../../lib/validateDocument"

const LABEL = { description: "Item", hsn: "HSN", quantity: "Qty", rate: "Rate", discountPercent: "Discount", gstRate: "GST" }

// A line with nothing in it yet: the blank row a new document opens with.
const isBlank = (l) => !l.productId && !l.description?.trim() && !Number(l.rate)

// Editable line items, shared by quotations and invoices (V3 builder). One row
// per line: the item (catalogue product or a custom name, the printed
// description and HSN) beside its numbers. Controls look like text until
// hovered or focused, so the table reads like the document it prints. Items are
// added from ONE search bar under the table: pick a product, or type a name
// that is not in the catalogue for a custom item. Props:
//   lines, onChange(lines)
//   products        , product master for the pickers (autofills a line)
//   extraDiscountPercent, onExtraDiscountChange
//   interState      , controls the GST split shown in the summary
//   onSaveToCatalogue(line) , optional: offers "Save to catalogue" on a custom
//                    line; resolves to the new product, which the line then links to
// `showTotals` false leaves the totals to the page (the quotation editor's rail).
// `errors` / `warnings` are validateDocument's maps ("lines.2.rate", ...).
export default function LineItemsEditor({ lines, onChange, products, extraDiscountPercent = 0, onExtraDiscountChange, interState, showTotals = true, errors = {}, warnings = {}, onSaveToCatalogue }) {
  const totals = computeDocument(lines, { interState, extraDiscountPercent })
  const [savingAt, setSavingAt] = useState(-1)
  const live = products.filter((p) => p.status !== "archived")

  const update = (i, patch) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i))

  // What a product writes into a line. The description is the sentence that
  // PRINTS, so a product is only allowed to write it when there is nothing
  // there to lose: an empty field, or the name of the product that was picked a
  // moment ago and has now been swapped. Anything typed by hand survives
  // picking, re-picking and correcting the product. HSN, rate and GST are the
  // catalogue's to state, so they are copied every time.
  const fromProduct = (p, line) => {
    const previous = products.find((x) => x.id === line.productId)
    const untouched = !line.description?.trim() || line.description.trim() === previous?.name?.trim()
    return {
      productId: p.id,
      description: untouched ? p.name : line.description,
      hsn: p.hsn,
      unit: p.unit || line.unit,
      rate: p.basePrice,
      gstRate: p.gstRate,
      quantity: line.quantity < p.moq ? p.moq : line.quantity,
    }
  }

  const pickProduct = (i, productId) => {
    const p = products.find((x) => x.id === productId)
    if (!p) return update(i, { productId: null })
    update(i, fromProduct(p, lines[i]))
  }

  // A line that is not a catalogue product: the typed name becomes the
  // description and the rest of the line is left where it is, so a rate already
  // keyed in is not wiped by renaming what it is for.
  const customItem = (i, text) => update(i, { productId: null, description: text })

  // The add bar fills the blank row a new document opens with, else appends.
  const append = (patchFor) => {
    const last = lines.length - 1
    if (last >= 0 && isBlank(lines[last])) return update(last, patchFor(lines[last]))
    const line = newLine()
    onChange([...lines, { ...line, ...patchFor(line) }])
  }
  const addProduct = (productId) => {
    const p = products.find((x) => x.id === productId)
    if (p) append((line) => fromProduct(p, line))
  }
  const addCustom = (text) => append(() => ({ productId: null, description: text }))

  const saveToCatalogue = async (i) => {
    setSavingAt(i)
    try {
      const p = await onSaveToCatalogue(lines[i])
      if (p?.id) update(i, { productId: p.id })
    } finally {
      setSavingAt(-1)
    }
  }

  // Visible, clean input styling for table cells so users immediately see editable fields
  const cellInput =
    "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] text-foreground shadow-2xs hover:border-border-strong focus:border-ring focus:bg-card focus:ring-1 focus:ring-ring/20 transition-all placeholder:text-muted-foreground/50"
  const numInput = cn(
    cellInput,
    "text-right tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
  )
  const subInput =
    "h-7 w-full rounded-md border border-border/80 bg-background/50 px-2 text-xs text-foreground placeholder:text-muted-foreground/50 shadow-2xs hover:border-border focus:border-ring focus:bg-card focus:ring-1 focus:ring-ring/20 transition-all"

  return (
    <div className="space-y-4">
      {lines.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-border/80 bg-subtle/25 p-8 text-center sm:p-10 transition-all">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs ring-1 ring-primary/20">
            <Package className="h-7 w-7" />
          </div>
          <div className="mt-4">
            <h4 className="text-[15px] font-semibold tracking-tight text-foreground">
              No items added yet
            </h4>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Search products from your catalogue to auto-fill rates and GST, or add a custom item.
            </p>
          </div>

          {/* Search & Add Island */}
          <div data-path="lines" data-add-item className="mx-auto mt-6 w-full max-w-lg">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-xl border border-border bg-card p-1.5 shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
              <div className="flex flex-1 items-center gap-2 px-2 min-w-0">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <Select
                    searchable
                    value=""
                    searchPlaceholder="Search products by name, SKU, category..."
                    placeholder="Search catalogue or type custom item name"
                    onChange={(e) => addProduct(e.target.value)}
                    onCreate={addCustom}
                    createLabel={(text) => `Custom item "${text}"`}
                    aria-label="Add item"
                    className="h-9 w-full rounded-lg border-0 bg-transparent px-2 text-[13px] text-foreground focus:ring-0"
                  >
                    {live.map((p) => (
                      <option key={p.id} value={p.id} data-search={[p.sku, p.category, p.hsn].filter(Boolean).join(" ")}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-subtle-foreground shadow-2xs">
                  /
                </kbd>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange([...lines, newLine()])}
                className="shrink-0 h-9 px-3 text-xs font-medium justify-center"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Blank line
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full min-w-[720px] table-fixed text-left text-sm">
            <thead className="mt-head border-b border-border bg-subtle/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 text-center py-2.5">#</th>
                <th className="py-2.5 pl-2">Item & Description</th>
                <th className="w-[105px] text-right py-2.5 pr-2">Qty</th>
                <th className="w-[115px] text-right py-2.5 pr-2">Rate (₹)</th>
                <th className="w-[85px] text-right py-2.5 pr-2">Disc %</th>
                <th className="w-[95px] text-right py-2.5 pr-2">GST</th>
                <th className="w-[115px] text-right py-2.5 pr-3">Amount</th>
                <th className="w-10 py-2.5 text-center" />
              </tr>
            </thead>
            <tbody className="mt-body divide-y divide-border/60">
              {lines.map((line, i) => {
                const computed = totals.lines[i]
                const err = errorsUnder(errors, `lines.${i}`)
                const warn = errorsUnder(warnings, `lines.${i}`)
                const msgId = `line-${i}-msg`
                const custom = !line.productId && Boolean(line.description?.trim())
                const noPrice = line.productId && !Number(line.rate)
                // Props for one cell's control: its path, and the red border while it is wrong.
                const v = (key) => ({ "data-path": `lines.${i}.${key}`, ...(err[key] ? { "aria-invalid": true, "aria-describedby": msgId } : null) })
                const notes = [
                  ...Object.entries(err).map(([k, m]) => ({ k, m, bad: true })),
                  ...Object.entries(warn).filter(([k]) => !err[k]).map(([k, m]) => ({ k, m, bad: false })),
                ]
                return (
                  <Fragment key={i}>
                    <tr className="group align-top hover:bg-subtle/20 transition-colors">
                      <td rowSpan={notes.length ? 2 : 1} className="py-3 text-center text-xs font-semibold text-muted-foreground tabular">{i + 1}</td>
                      <td className="px-2 py-2.5" style={notes.length ? { borderBottom: 0 } : undefined}>
                        <Select
                          searchable
                          searchPlaceholder="Search the catalogue, or type a new item name"
                          value={line.productId || ""}
                          onChange={(e) => pickProduct(i, e.target.value)}
                          /* Closed, the control says what the line IS: the
                             product, or the name typed for a one-off. */
                          valueLabel={line.productId ? "" : line.description}
                          placeholder="Select product or type custom item..."
                          onCreate={(text) => customItem(i, text)}
                          createLabel={(text) => `Custom item "${text}"`}
                          className={cn(cellInput, "font-medium")}
                        >
                          {/* The empty value is the custom line itself: closed, it
                              reads as the name typed for it. */}
                          <option value="">{custom ? line.description : "Custom item (not in catalogue)"}</option>
                          {live.map((p) => (
                            <option key={p.id} value={p.id} data-search={[p.sku, p.category, p.hsn].filter(Boolean).join(" ")}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                        <div className="mt-1.5">
                          <Input
                            {...v("description")}
                            value={line.description}
                            onChange={(e) => update(i, { description: e.target.value })}
                            placeholder="Description as it prints on the document"
                            className={subInput}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {custom && <Badge tone="blue">Custom item</Badge>}
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="text-[11px] font-medium text-subtle-foreground">HSN:</span>
                            <Input
                              {...v("hsn")}
                              value={line.hsn}
                              onChange={(e) => update(i, { hsn: e.target.value })}
                              placeholder="0000"
                              aria-label={`HSN, line ${i + 1}`}
                              className={cn(subInput, "h-6.5 w-20 px-2 text-xs tabular")}
                            />
                          </label>
                          {custom && onSaveToCatalogue && (
                            <button
                              type="button"
                              onClick={() => saveToCatalogue(i)}
                              disabled={savingAt === i}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                            >
                              <Save className="h-3.5 w-3.5" /> {savingAt === i ? "Saving..." : "Save to catalogue"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-1.5 py-2.5">
                        <Input
                          {...v("quantity")}
                          type="number"
                          min="0"
                          value={line.quantity}
                          onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                          aria-label={`Quantity, line ${i + 1}`}
                          className={numInput}
                        />
                        <div className="mt-1.5">
                          <Input
                            value={line.unit ?? "pcs"}
                            onChange={(e) => update(i, { unit: e.target.value })}
                            placeholder="pcs"
                            aria-label={`Unit, line ${i + 1}`}
                            className={cn(subInput, "text-right")}
                          />
                        </div>
                      </td>
                      <td className="px-1.5 py-2.5">
                        <Input
                          {...v("rate")}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.rate}
                          onChange={(e) => update(i, { rate: Number(e.target.value) })}
                          aria-label={`Rate, line ${i + 1}`}
                          className={cn(numInput, noPrice && "border-warning focus:border-warning")}
                          title={noPrice ? "This product has no base price in the catalogue. Set one under Catalogue, or type the rate here." : undefined}
                          placeholder="0.00"
                        />
                        {noPrice && (
                          <span className="block mt-1 text-[10px] text-warning-text text-right truncate">
                            No base rate
                          </span>
                        )}
                      </td>
                      <td className="px-1.5 py-2.5">
                        <Input
                          {...v("discountPercent")}
                          type="number"
                          min="0"
                          max="100"
                          value={line.discountPercent}
                          onChange={(e) => update(i, { discountPercent: Number(e.target.value) })}
                          aria-label={`Discount, line ${i + 1}`}
                          className={numInput}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-1.5 py-2.5">
                        <Select
                          {...v("gstRate")}
                          value={line.gstRate}
                          onChange={(e) => update(i, { gstRate: Number(e.target.value) })}
                          aria-label={`GST, line ${i + 1}`}
                          className={cn(cellInput, "px-2 text-right tabular")}
                        >
                          {GST_RATES.map((r) => (
                            <option key={r} value={r}>
                              {r}%
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2.5 py-3.5 text-right">
                        <span className="block text-[14px] font-semibold text-foreground tabular">{formatCurrency(computed.total)}</span>
                        <span className="block text-[11px] text-muted-foreground">incl. GST</span>
                      </td>
                      <td className="px-1 py-3 text-center">
                        <Button
                          type="button"
                          variant="dangerGhost"
                          size="sm"
                          icon
                          onClick={() => remove(i)}
                          aria-label={`Remove line ${i + 1}`}
                          className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    {notes.length > 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 pb-2.5 pt-0" style={{ borderTop: 0 }}>
                          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive-text shrink-0" />
                            <ul id={msgId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              {notes.map((n) => (
                                <li key={n.k} className={cn("font-medium", n.bad ? "text-destructive-text" : "text-warning-text")}>
                                  {LABEL[n.k] || "Item"}: {n.m}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {/* One way in for every item: pick a product, or type a name nothing
              matches for a custom item. "/" anywhere on the page opens it. */}
          <div data-path="lines" data-add-item className="flex items-center gap-2 border-t border-border bg-subtle/30 px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <Select
                searchable
                value=""
                searchPlaceholder="Search products by name, SKU, or category..."
                placeholder="Add another item: search catalogue or type custom item name"
                onChange={(e) => addProduct(e.target.value)}
                onCreate={addCustom}
                createLabel={(text) => `Custom item "${text}"`}
                aria-label="Add item"
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13px] text-foreground shadow-2xs hover:border-border-strong focus:border-ring focus:ring-1 focus:ring-ring/20"
              >
                {live.map((p) => (
                  <option key={p.id} value={p.id} data-search={[p.sku, p.category, p.hsn].filter(Boolean).join(" ")}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted/70 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-2xs">
              /
            </kbd>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...lines, newLine()])}
              className="h-9 px-3 text-xs font-medium shrink-0"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Blank line
            </Button>
          </div>
        </div>
      )}
      {(errors.lines || errors.total) && (
        <div
          data-path="total"
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive-text shadow-2xs"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive-text" />
          <span>{errors.lines || errors.total}</span>
        </div>
      )}

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
                data-path="extraDiscountPercent"
                aria-invalid={errors.extraDiscountPercent ? true : undefined}
                aria-label="Extra discount percent"
                className="h-7 w-16 px-2 text-right text-xs shadow-none"
              />
              <span className="text-xs text-subtle-foreground">%</span>
            </span>
          </div>
          {errors.extraDiscountPercent && <p className="pb-1.5 text-right text-xs text-destructive-text">{errors.extraDiscountPercent}</p>}
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
