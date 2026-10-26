import { Banner, Button } from "./Ui"
import { friendlyError } from "../../lib/friendlyError"

/**
 * Shown when a page's figures could not be read, so a failed load is never
 * mistaken for zero invoices or ₹0. Pass the hook's `error` and `reload`.
 */
export default function LoadErrorBanner({ error, onRetry, className }) {
  if (!error) return null
  return (
    <Banner tone="danger" className={className}>
      <span className="min-w-0 flex-1">
        These figures could not be loaded, so totals below may be incomplete. {friendlyError(error)}
      </span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </Banner>
  )
}
