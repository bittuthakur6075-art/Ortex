import { Button } from "../../components/ui/Ui"
import { PAGE_SIZE } from "./helpers"

export default function TablePager({ page, pageCount, total, onPage }) {
  if (total === 0) return null
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-subtle/60 px-4 py-2.5 text-xs text-muted-foreground">
      <span className="tabular">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <span className="tabular">Page {page} of {pageCount}</span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
