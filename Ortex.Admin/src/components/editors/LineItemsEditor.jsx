import { Plus, Trash2 } from "../ui/Icons"
import { newLine, GST_RATES } from "../../data/domain/schema"
import { computeDocument } from "../../lib/pricing"
import { formatCurrency, round2 } from "../../lib/format"
import { Input, Select } from "../ui/Ui"
import { cn } from "../../lib/cn"

// Editable line-items grid + live totals, shared by quotations and invoices.
// Layout follows the Keystone document: a compact bordered grid with an
// uppercase head, and a right-half totals block whose rows carry a hairline
// above them (no boxed summary). Props:
//   lines, onChange(lines)
//   products         — product master for the picker (autofills a line)
//   extraDiscountPercent, onExtraDiscountChange
//   interState       — controls the GST split shown in the summary
export default function LineItemsEditor({ lines, onChange, products, extraDiscountPercent = 0, onExtraDiscountChange, interState }) {
  const totals = computeDocument(lines, { interState, extraDiscountPercent })

  const update = (i, patch) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i))
  const add = () => onChange([...lines, newLine()])

  const pickProduct = (i, productId) => {
    const p = products.find((x) => x.id === productId)
    if (!p) return update(i, { productId: null })
    update(i, {
      productId: p.id,
      description: p.name,
      hsn: p.hsn,
      rate: p.basePrice,
      gstRate: p.gstRate,
      quantity: lines[i].quantity < p.moq ? p.moq : lines[i].quantity,
    })
  }

  const cell = "h-8 px-2 text-[13px] shadow-none"
  const num = cn(cell, "text-right tabular")

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] table-fixed text-left text-sm">
          <thead className="mt-head">
            <tr>
              <th className="w-9 px-2 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5">Item / description</th>
              <th className="w-[88px] px-2 py-2.5">HSN</th>
              <th className="w-[84px] px-2 py-2.5 text-right">Qty</th>
              <th className="w-[72px] px-2 py-2.5">Unit</th>
              <th className="w-[104px] px-2 py-2.5 text-right">Rate</th>
              <th className="w-[72px] px-2 py-2.5 text-right">Disc %</th>
              <th className="w-[84px] px-2 py-2.5 text-right">GST %</th>
              <th className="w-[136px] px-2 py-2.5">Due on</th>
              <th className="w-[112px] px-2 py-2.5 text-right">Amount</th>
              <th className="w-9 px-1 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                  No items yet. Add a line to get started.
                </td>
              </tr>
            )}
            {lines.map((line, i) => {
              const computed = totals.lines[i]
              return (
                <tr key={i} className="align-top hover:bg-subtle/50">
                  <td className="px-2 py-2.5 text-center text-xs text-subtle-foreground tabular">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Select value={line.productId || ""} onChange={(e) => pickProduct(i, e.target.value)} className={cn(cell, "mb-1.5 pr-8")}>
                      <option value="">Custom item…</option>
                      {products
                        .filter((p) => p.status !== "archived")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                    <Input value={line.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Description" className={cell} />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={line.hsn} onChange={(e) => update(i, { hsn: e.target.value })} className={cell} placeholder="HSN" />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" min="0" value={line.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className={num} />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={line.unit ?? "pcs"} onChange={(e) => update(i, { unit: e.target.value })} className={cell} placeholder="pcs" />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" min="0" step="0.01" value={line.rate} onChange={(e) => update(i, { rate: Number(e.target.value) })} className={num} />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" min="0" max="100" value={line.discountPercent} onChange={(e) => update(i, { discountPercent: Number(e.target.value) })} className={num} />
                  </td>
                  <td className="px-2 py-2">
                    <Select value={line.gstRate} onChange={(e) => update(i, { gstRate: Number(e.target.value) })} className={cn(cell, "pr-6 text-left")}>
                      {GST_RATES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="date"
                      value={line.dueOn ? line.dueOn.slice(0, 10) : ""}
                      onChange={(e) => update(i, { dueOn: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className={cell}
                    />
                  </td>
                  <td className="px-2 py-3 text-right text-[13px] font-semibold text-foreground tabular">{formatCurrency(computed.total)}</td>
                  <td className="px-1 py-2 text-right">
                    <button type="button" onClick={() => remove(i)} aria-label="Remove line" className="grid h-8 w-8 place-items-center rounded-md text-subtle-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
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

      {/* Totals — right half, hairline rows (Keystone document style) */}
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
