// Shared components for the payroll setup pages (Settings, Employees, the pay
// profile, Loans): the "not set up" banner and a labelled checkbox. The plain
// helpers are in helpers.js, so this file exports components only.

import { Banner } from "../../../components/ui/Ui"
import { NOT_SET_UP } from "../../../services/payroll"

/** The same banner whenever migration 0040 is missing, or the error in words. */
export function LoadError({ error }) {
  if (!error) return null
  return (
    <Banner tone={error.missing ? "warning" : "danger"} className="mb-4">
      {error.missing ? NOT_SET_UP : error.message || String(error)}
    </Banner>
  )
}

/** A checkbox with its label, the way the rest of the console draws them. */
export function Check({ id, checked, onChange, label, hint, disabled }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary disabled:opacity-50"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}
