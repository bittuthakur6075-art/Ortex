import { Eye } from "../../components/ui/Icons"
import { INVOICE_STATUS } from "../../data/domain/schema"
import { formatDate, formatCurrency } from "../../lib/format"
import { Button, Card, CardHeader, StatusBadge, Money, SortTh } from "../../components/ui/Ui"
import TallyBadge from "./TallyBadge"

export default function InvoiceTable({ rows, sort, onSort, onEdit, onPreview, title, action }) {
  return (
    <Card className="overflow-hidden">
      {(title || action) && <CardHeader title={title} action={action} />}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="mt-head">
            <tr>
              <SortTh sortKey="number" sort={sort} onSort={onSort}>Number</SortTh>
              <SortTh sortKey="customer" sort={sort} onSort={onSort}>Customer</SortTh>
              <SortTh sortKey="grandTotal" sort={sort} onSort={onSort} align="right">Total</SortTh>
              <SortTh sortKey="_balance" sort={sort} onSort={onSort} align="right">Balance</SortTh>
              <SortTh sortKey="_status" sort={sort} onSort={onSort}>Status</SortTh>
              <th>Tally</th>
              <SortTh sortKey="dueDate" sort={sort} onSort={onSort}>Due</SortTh>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="mt-body">
            {rows.map((i) => {
              const overdue = i._status === "overdue"
              return (
                <tr key={i.id} className="cursor-pointer" onClick={() => onEdit({ ...i })}>
                  <td className="px-4 py-3 font-medium tabular text-foreground">{i.number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{i.customer?.company || i.customer?.name}</div>
                    <div className="text-xs text-muted-foreground">{i.customer?.name}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    <Money value={i.totals?.grandTotal} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    {i._balance > 0.5 ? <span className="font-medium text-warning-text">{formatCurrency(i._balance)}</span> : <span className="text-[hsl(var(--success))]">Settled</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge list={INVOICE_STATUS} status={i._status} />
                  </td>
                  <td className="px-4 py-3">
                    <TallyBadge tally={i.tally} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {overdue ? <span className="text-destructive">{formatDate(i.dueDate)}</span> : formatDate(i.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onPreview(i)
                      }}
                      variant="ghost" size="sm" icon className="text-muted-foreground"
                      title="Preview"
                    >
                      <Eye className="ml-auto h-4 w-4" />
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
