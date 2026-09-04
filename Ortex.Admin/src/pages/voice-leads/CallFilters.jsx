import { Chip, Input } from "../../components/ui/Ui"
import { RANGES } from "./helpers"

export default function CallFilters({ query, setQuery, view, setView, range, setRange, stats, filtering, visibleCount }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="w-full max-w-sm">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, product, city, requirement…"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
      </div>
      {filtering && (
        <span className="text-sm text-muted-foreground">
          {visibleCount} of {stats.calls} shown
        </span>
      )}
    </div>
  )
}
