import { Chip, ChipGroup, SearchInput } from "../../components/ui/Ui"
import { RANGES } from "./helpers"

export default function CallFilters({ query, setQuery, view, setView, range, setRange, stats, filtering, visibleCount, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <ChipGroup className="min-w-0">
        <Chip active={view === "all"} onClick={() => setView("all")}>All</Chip>
        <Chip active={view === "attention"} onClick={() => setView("attention")}>Needs follow-up</Chip>
        <Chip active={view === "support"} onClick={() => setView("support")}>
          Support {stats.support > 0 && `(${stats.support})`}
        </Chip>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        {RANGES.map((r) => (
          <Chip key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </Chip>
        ))}
      </ChipGroup>
      {filtering && (
        <span className="text-sm text-muted-foreground">
          {visibleCount} of {stats.calls} shown
        </span>
      )}
      <div className="flex items-center gap-[10px] md:ml-auto">
        <SearchInput
          className="w-full max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voice calls"
        />
        {actions}
      </div>
    </div>
  )
}
