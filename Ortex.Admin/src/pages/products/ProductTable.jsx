import { Package, Pencil, EyeOff } from "../../components/ui/Icons"
import { PRODUCT_STATUS } from "../../data/domain/schema"
import { round2 } from "../../lib/format"

import { Button, Card, CardHeader, StatusBadge, Money, SortTh } from "../../components/ui/Ui"

export default function ProductTable({
  rows,
  sort,
  onSort,
  onView,
  onEdit,
  title,
  action,
}) {
  return (
    <Card className="overflow-hidden">
    {(title || action) && <CardHeader title={title} action={action} />}
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="mt-head">
          <tr>
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
        <tbody className="mt-body">
          {rows.map((p) => {
            const margin = round2(p.basePrice - p.costPrice)
            const marginPct = p.basePrice ? Math.round((margin / p.basePrice) * 100) : 0
            return (
              <tr
                key={p.id}
                className="cursor-pointer transition-colors hover:bg-subtle"
                onClick={() => onView(p)}
              >
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
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{p.sku || "-"} · MOQ {p.moq}</span>
                        {p.showOnWebsite === false && (
                          <span className="inline-flex items-center gap-1 text-warning-text" title="Not listed on the website">
                            <EyeOff variant="Linear" className="h-3.5 w-3.5" /> Off website
                          </span>
                        )}
                        {p.indiamartListed && <span className="text-success-text">IndiaMART ✓</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                <td className="px-4 py-3 tabular text-muted-foreground">{p.hsn || "-"}</td>
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
                  <Button variant="ghost" size="sm" icon className="ml-auto text-muted-foreground" title="Edit product">
                    <Pencil className="h-4 w-4" />
                  </Button>
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
