import {} from "../../components/ui/Icons"
import { INVOICE_STATUS } from "../../data/domain/schema"
import { SearchInput, Chip, ChipGroup } from "../../components/ui/Ui"

export default function InvoiceFilters({ query, setQuery, statusFilter, setStatusFilter, actions }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
      <ChipGroup className="min-w-0">
        <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          All
        </Chip>
        {INVOICE_STATUS.map((s) => (
          <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
            {s.label}
          </Chip>
        ))}
      </ChipGroup>
      <div className="flex items-center gap-[10px] md:ml-auto">
        <SearchInput className="md:w-[320px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoices" />
        {actions}
      </div>
    </div>
  )
}
