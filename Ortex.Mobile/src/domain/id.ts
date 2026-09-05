// Document-number generation.
//
// PORT OF Ortex.Admin/src/lib/id.js. `documentNumber` builds human-facing,
// sequential references like QTN-2526-0007 from the Indian financial year
// (Apr–Mar) and a per-series counter. The counter itself is NOT generated here:
// it comes from the `next_sequence` Postgres function so the phone and the
// console can never mint the same number.

/** Indian financial year code for a date, e.g. 2025-07 -> "2526". */
export function financialYearCode(date: Date | string = new Date()): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const startYear = d.getMonth() >= 3 ? year : year - 1 // FY starts in April
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`
}

export function documentNumber(prefix: string, seq: number, date: Date | string = new Date()): string {
  return `${prefix}-${financialYearCode(date)}-${String(seq).padStart(4, "0")}`
}
