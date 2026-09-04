import { Button } from "../../components/ui/Ui"
import { PAGE_SIZE } from "./helpers"

export default function TablePager({ page, pageCount, total, onPage }) {
  if (total === 0) return null
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <span>Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span>Page {page} of {pageCount}</span>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
