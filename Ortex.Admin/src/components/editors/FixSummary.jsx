import { AlertTriangle } from "../ui/Icons"

// Said at the save bar while a document cannot be saved: the first problem and
// "3 things to fix", which shows them all and moves to the first.
// `v` is useDocumentValidation's result.
export default function FixSummary({ v }) {
  if (!v.count) return null
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-destructive-text" role="status">
      <AlertTriangle className="h-3.5 w-3.5 flex-none" />
      <span className="truncate">{v.first}</span>
      <button type="button" onClick={v.reveal} className="flex-none underline underline-offset-2 hover:no-underline">
        {v.count === 1 ? "1 thing to fix" : `${v.count} things to fix`}
      </button>
    </span>
  )
}
