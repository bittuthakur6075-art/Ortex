// One ordering rule for every console list. Text sorts the way people read it
// (case-insensitive, and "Item 2" before "Item 10"); numbers and dates sort as
// numbers; a blank always goes last whichever way the column is turned, so an
// unnamed customer or an undated invoice never tops the list.

const collator = new Intl.Collator("en-IN", { sensitivity: "base", numeric: true })

const isBlank = (v) => v === undefined || v === null || v === "" || (typeof v === "number" && Number.isNaN(v))

/** Compare two cell values; `desc` flips the order but never the blanks. */
export function compareValues(a, b, desc = false) {
  const blankA = isBlank(a)
  const blankB = isBlank(b)
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1
  const r = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b))
  return desc ? -r : r
}

/** A date-ish value (ISO string, Date, ms) as ms, or null when it is not a date. */
export function dateValue(v) {
  if (v === undefined || v === null || v === "") return null
  const t = typeof v === "number" ? v : new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Sorted copy of `rows` by `sort` = { key, desc }. `valueOf(row, key)` gives
 * the value to compare (default `row[key]`); `tieBreak(a, b)` settles equal
 * values so the order is the same on every load.
 */
export function sortRows(rows, sort, valueOf = (row, key) => row[key], tieBreak) {
  const { key, desc } = sort
  return [...rows].sort((a, b) => compareValues(valueOf(a, key), valueOf(b, key), desc) || (tieBreak ? tieBreak(a, b) : 0))
}

/** Tie-break: highest document number first (INV-0012 before INV-0009). */
export const byNumberDesc = (numberOf) => (a, b) => compareValues(numberOf(a), numberOf(b), true)

/** Tie-break: A to Z by a name. */
export const byNameAsc = (nameOf) => (a, b) => compareValues(nameOf(a), nameOf(b))

/** Newest first by a business date, falling back to when the row was created. */
export const newestFirst = (dateOf) => (a, b) =>
  compareValues(dateValue(dateOf(a)) ?? dateValue(a.createdAt), dateValue(dateOf(b)) ?? dateValue(b.createdAt), true)
