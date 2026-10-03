import { useSyncExternalStore } from "react"
import { companyState } from "../../data/store/company"
import { Badge, Field, Select } from "./Ui"

const shortName = (c) => c?.doc?.company?.logoText || c?.name || ""

// Which company a row belongs to, shown only in "All companies" (0075): with
// one company in view every row is that company's, so the chip would be noise.
export function CompanyChip({ companyId, className }) {
  const view = useSyncExternalStore(companyState.subscribe, companyState.get)
  if (view.current !== "all" || !companyId) return null
  const company = view.all.find((c) => c.id === companyId)
  return (
    <Badge tone="outline" className={className}>
      {shortName(company) || companyId}
    </Badge>
  )
}

/**
 * The company a new record is raised for, at the top of an editor. Only for
 * someone in more than one company; required in All mode (value ""), and
 * fixed once the record exists (`disabled`).
 */
export function CompanyField({ value, onChange, disabled, className }) {
  const view = useSyncExternalStore(companyState.subscribe, companyState.get)
  if (!view.multi) return null
  const known = view.companies.some((c) => c.id === value)
  return (
    <Field label="Company" required={!disabled} error={!disabled && !value ? "Choose a company" : ""} className={className}>
      <Select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder="Choose a company">
        {!known && value && <option value={value}>{view.all.find((c) => c.id === value)?.name || value}</option>}
        {view.companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}
