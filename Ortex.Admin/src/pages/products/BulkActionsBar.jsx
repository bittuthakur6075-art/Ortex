import { Download } from "../../components/ui/Icons"
import { Button } from "../../components/ui/Ui"

// Toolbar shown above the table while one or more rows are selected.
export default function BulkActionsBar({ count, onExportIndiamart, onMarkListed, onClear }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <span className="font-medium text-foreground">{count} selected</span>
      <Button size="sm" variant="outline" onClick={onExportIndiamart}>
        <Download className="h-4 w-4" /> Export for IndiaMART
      </Button>
      <Button size="sm" variant="outline" onClick={() => onMarkListed(true)}>
        Mark listed
      </Button>
      <Button size="sm" variant="outline" onClick={() => onMarkListed(false)}>
        Mark not listed
      </Button>
      <button onClick={onClear} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
        Clear
      </button>
    </div>
  )
}
