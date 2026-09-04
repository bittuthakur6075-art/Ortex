import { Search } from "../../components/ui/Icons"
import { Input, Select } from "../../components/ui/Ui"

export default function ProductFilters({ query, setQuery, category, setCategory, categories }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative w-full sm:w-[320px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU, HSN, material…" className="pl-10" />
      </div>
      <Select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-64">
        <option value="all">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
