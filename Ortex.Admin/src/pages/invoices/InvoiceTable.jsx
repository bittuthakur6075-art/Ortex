import { Eye } from "../../components/ui/Icons"
import { INVOICE_STATUS } from "../../data/domain/schema"
import { formatDate, formatCurrency } from "../../lib/format"
import { isSettled, SETTLE_TOLERANCE } from "../../lib/invoiceMoney"
import { Button, Card, CardHeader, StatusBadge, Money, SortTh } from "../../components/ui/Ui"
import TallyBadge from "./TallyBadge"
import { CompanyChip } from "../../components/ui/CompanyChip"

// What the Balance column says: a draft or cancelled invoice asks for nothing
// ("-"), an overpaid one is in credit, a settled one says so.
function Balance({ row }) {
  if (row.status === "draft" || row.status === "cancelled") return <span className="text-subtle-foreground">-</span>
  const b = row._balance
  if (b < -SETTLE_TOLERANCE) return <span className="text-success-text">Credit {formatCurrency(-b)}</span>
  if (isSettled(b)) return <span className="text-success">Settled</span>
  return <span className="font-medium text-warning-text">{formatCurrency(b)}</span>
}

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
              <SortTh sortKey="issueDate" sort={sort} onSort={onSort}>Issued</SortTh>
              <SortTh sortKey="grandTotal" sort={sort} onSort={onSort} align="right">Total</SortTh>
              <SortTh sortKey="_balance" sort={sort} onSort={onSort} align="right">Balance</SortTh>
              <SortTh sortKey="_status" sort={sort} onSort={onSort}>Status</SortTh>
              <th>Tally</th>
              <SortTh sortKey="dueDate" sort={sort} onSort={onSort}>Due</SortTh>
              <th><span className="sr-only">Preview</span></th>
            </tr>
          </thead>
          <tbody className="mt-body">
            {rows.map((i) => {
              const overdue = i._status === "overdue"
              const open = () => onEdit({ ...i })
              return (
                <tr
                  key={i.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open()}
                >
                  <td className="px-4 py-3 font-medium tabular text-foreground">
                    {i.number} <CompanyChip companyId={i.companyId} className="ml-1" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{i.customer?.company || i.customer?.name}</div>
                    <div className="text-xs text-muted-foreground">{i.customer?.name}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(i.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    <Money value={i.totals?.grandTotal} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    <Balance row={i} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge list={INVOICE_STATUS} status={i._status} />
                  </td>
                  <td className="px-4 py-3">
                    <TallyBadge tally={i.tally} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {overdue ? <span className="text-destructive">{formatDate(i.dueDate)}</span> : formatDate(i.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      onClick={(ev) => {
                        ev.stopPropagation()
                        // The sheet prints the live status and paid amount, not the stored ones.
                        onPreview({ ...i, status: i._status, amountPaid: i._paid })
                      }}
                      variant="ghost" size="sm" icon className="text-muted-foreground"
                      title="Preview"
                      aria-label={`Preview ${i.number}`}
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
