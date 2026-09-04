import { Search } from "../../components/ui/Icons"
import { INVOICE_STATUS } from "../../data/domain/schema"
import { Input, Chip } from "../../components/ui/Ui"

export default function InvoiceFilters({ query, setQuery, statusFilter, setStatusFilter }) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, customer…" className="pl-10" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          All
        </Chip>
        {INVOICE_STATUS.map((s) => (
          <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
            {s.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
