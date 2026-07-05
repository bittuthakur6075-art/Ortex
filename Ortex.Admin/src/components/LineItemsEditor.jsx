import { Plus, Trash2 } from "./icons"
import { newLine, GST_RATES } from "../data/schema"
import { computeDocument } from "../lib/pricing"
import { formatCurrency, round2 } from "../lib/format"
import { Button, Input, Select, Money } from "./ui"

// Editable line-items grid + live totals, shared by quotations and invoices.
// Props:
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

  return (
    <div className="space-y-4">
      {/* Line rows */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Item</th>
              <th className="w-20 px-3 py-2.5 font-medium">HSN</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">Qty</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Rate</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">Disc%</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">GST%</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No items yet. Add a line to get started.
                </td>
              </tr>
            )}
            {lines.map((line, i) => {
              const computed = totals.lines[i]
              return (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2">
                    <Select
                      value={line.productId || ""}
                      onChange={(e) => pickProduct(i, e.target.value)}
                      className="mb-1.5 h-9 py-1.5 text-xs"
                    >
                      <option value="">Custom item…</option>
                      {products
                        .filter((p) => p.status !== "archived")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                    <Input
                      value={line.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      placeholder="Description"
                      className="h-9 py-1.5 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={line.hsn} onChange={(e) => update(i, { hsn: e.target.value })} className="h-9 py-1.5 text-xs" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" value={line.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className="h-9 py-1.5 text-right text-xs" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="0.01" value={line.rate} onChange={(e) => update(i, { rate: Number(e.target.value) })} className="h-9 py-1.5 text-right text-xs" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" max="100" value={line.discountPercent} onChange={(e) => update(i, { discountPercent: Number(e.target.value) })} className="h-9 py-1.5 text-right text-xs" />
                  </td>
                  <td className="px-3 py-2">
                    <Select value={line.gstRate} onChange={(e) => update(i, { gstRate: Number(e.target.value) })} className="h-9 py-1.5 text-right text-xs">
                      {GST_RATES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular text-foreground">{formatCurrency(computed.total)}</td>
                  <td className="px-2 py-3 text-right">
                    <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> Add line
      </Button>

      {/* Totals summary */}
      <div className="ml-auto max-w-sm space-y-1.5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <Row label="Sub-total">{formatCurrency(totals.subTotal)}</Row>
        {totals.totalDiscount > 0 && <Row label="Discount" negative>−{formatCurrency(totals.totalDiscount)}</Row>}
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-muted-foreground">Extra discount %</span>
          <Input
            type="number"
            min="0"
            max="100"
            value={extraDiscountPercent}
            onChange={(e) => onExtraDiscountChange(Number(e.target.value))}
            className="h-8 w-20 py-1 text-right text-xs"
          />
        </div>
        <Row label="Taxable value">{formatCurrency(totals.taxable)}</Row>
        {totals.interState ? (
          <Row label={`IGST`}>{formatCurrency(totals.igst)}</Row>
        ) : (
          <>
            <Row label="CGST">{formatCurrency(totals.cgst)}</Row>
            <Row label="SGST">{formatCurrency(totals.sgst)}</Row>
          </>
        )}
        {totals.roundOff !== 0 && <Row label="Round off">{round2(totals.roundOff)}</Row>}
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="font-semibold text-foreground">Grand total</span>
          <Money value={totals.grandTotal} className="text-lg font-bold text-primary" />
        </div>
      </div>
    </div>
  )
}

function Row({ label, children, negative }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? "tabular text-[hsl(var(--success))]" : "tabular text-foreground"}>{children}</span>
    </div>
  )
}
