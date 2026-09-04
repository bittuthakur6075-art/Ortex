import { Package, Pencil } from "../../components/ui/Icons"
import { PRODUCT_STATUS } from "../../data/domain/schema"
import { round2 } from "../../lib/format"
import { cn } from "../../lib/cn"
import { Card, StatusBadge, Money, SortTh } from "../../components/ui/Ui"

export default function ProductTable({
  rows,
  sort,
  onSort,
  selected,
  allVisibleSelected,
  toggleAll,
  toggleOne,
  onView,
  onEdit,
}) {
  return (
    <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-subtle text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={allVisibleSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </th>
            <SortTh sortKey="name" sort={sort} onSort={onSort}>Product</SortTh>
            <SortTh sortKey="category" sort={sort} onSort={onSort}>Category</SortTh>
            <SortTh sortKey="hsn" sort={sort} onSort={onSort}>HSN</SortTh>
            <SortTh sortKey="basePrice" sort={sort} onSort={onSort} align="right">Base price</SortTh>
            <SortTh sortKey="margin" sort={sort} onSort={onSort} align="right">Margin</SortTh>
            <SortTh sortKey="gstRate" sort={sort} onSort={onSort} align="right">GST</SortTh>
            <SortTh sortKey="status" sort={sort} onSort={onSort}>Status</SortTh>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border rows-in">
          {rows.map((p) => {
            const margin = round2(p.basePrice - p.costPrice)
            const marginPct = p.basePrice ? Math.round((margin / p.basePrice) * 100) : 0
            return (
              <tr
                key={p.id}
                className={cn("cursor-pointer transition-colors hover:bg-subtle", selected.has(p.id) && "bg-primary/5")}
                onClick={() => onView(p)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    aria-label={`Select ${p.name}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.images && p.images.length > 0 ? (
                      <img
                        src={p.images[0]}
                        alt={p.name}
                        className="h-10 w-10 rounded-lg object-cover bg-muted border border-border flex-shrink-0 animate-in fade-in duration-300"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku || "—"} · MOQ {p.moq}
                        {p.indiamartListed && <span className="ml-2 text-[hsl(var(--success))]">· IndiaMART ✓</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                <td className="px-4 py-3 tabular text-muted-foreground">{p.hsn || "—"}</td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  <Money value={p.basePrice} />
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  <span className={margin > 0 ? "text-[hsl(var(--success))]" : ""}>{marginPct}%</span>
                </td>
                <td className="px-4 py-3 text-right tabular text-muted-foreground">{p.gstRate}%</td>
                <td className="px-4 py-3">
                  <StatusBadge list={PRODUCT_STATUS} status={p.status} />
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
                  <button className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit product">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </Card>
  )
}
