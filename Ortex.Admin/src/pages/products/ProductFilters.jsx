import {} from "../../components/ui/Icons"
import { SearchInput, Select } from "../../components/ui/Ui"

export default function ProductFilters({ query, setQuery, category, setCategory, categories, actions }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchInput
        className="w-full sm:w-[320px]"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products"
      />
      <Select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-64">
        <option value="all">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </Select>
      {actions && <div className="flex items-center gap-2.5 sm:ml-auto">{actions}</div>}
    </div>
  )
}
