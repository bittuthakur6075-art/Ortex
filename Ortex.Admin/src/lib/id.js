// ID + document-number generation.
//
// `uid` is an internal primary key (never shown as a business reference).
// `documentNumber` builds human-facing, sequential references like
// QTN-2526-0007 / INV-2526-0012 using the Indian financial year (Apr–Mar) and
// a per-series running counter passed in by the caller (from settings).

let counter = 0

export function uid(prefix = "id") {
  counter += 1
  const rand = Math.floor(performance.now() * 1000) % 1000000
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand.toString(36)}`
}

// Indian financial year code for a date, e.g. 2025-07 -> "2526".
export function financialYearCode(date = new Date()) {
  const d = new Date(date)
  const year = d.getFullYear()
  const startYear = d.getMonth() >= 3 ? year : year - 1 // FY starts in April
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`
}

export function documentNumber(prefix, seq, date = new Date()) {
  return `${prefix}-${financialYearCode(date)}-${String(seq).padStart(4, "0")}`
}
