// Formatting + money helpers.
//
// PORT OF Ortex.Admin/src/lib/format.js — keep the two in step.
//
// One deliberate divergence: the console reaches for `toLocaleString("en-IN")`,
// which needs full ICU data. Hermes ships a cut-down Intl whose availability
// varies by RN build, and when it is missing the failure is silent — grouping
// degrades to 1,234,567.00 instead of 12,34,567.00 on a printed quotation. The
// lakh/crore grouper below is written out by hand so the phone and the console
// always agree.

export function round2(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

// 1234567.5 -> "12,34,567.50". Indian grouping: last three digits, then pairs.
function groupIndian(value: number, fractionDigits: number): string {
  const negative = value < 0
  const fixed = Math.abs(value).toFixed(fractionDigits)
  const [whole, fraction] = fixed.split(".")
  let grouped = whole
  if (whole.length > 3) {
    const last3 = whole.slice(-3)
    const rest = whole.slice(0, -3)
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`
  }
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`
}

// Indian Rupee. `compact` gives ₹1.2L / ₹3.4Cr for dashboard tiles.
export function formatCurrency(n: unknown, { compact = false }: { compact?: boolean } = {}): string {
  const value = Number(n) || 0
  if (compact) {
    const abs = Math.abs(value)
    if (abs >= 1e7) return `₹${round2(value / 1e7)}Cr`
    if (abs >= 1e5) return `₹${round2(value / 1e5)}L`
    if (abs >= 1e3) return `₹${round2(value / 1e3)}K`
  }
  return `₹${groupIndian(value, 2)}`
}

export function formatNumber(n: unknown): string {
  return groupIndian(Number(n) || 0, 0)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const pad2 = (n: number) => String(n).padStart(2, "0")

export function formatDate(ts: unknown): string {
  const d = new Date(ts as string)
  if (Number.isNaN(d.getTime())) return "-"
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateTime(ts: unknown): string {
  const d = new Date(ts as string)
  if (Number.isNaN(d.getTime())) return "-"
  const h24 = d.getHours()
  const h12 = h24 % 12 || 12
  const suffix = h24 < 12 ? "am" : "pm"
  return `${formatDate(ts)}, ${pad2(h12)}:${pad2(d.getMinutes())} ${suffix}`
}

// Local yyyy-mm-dd. Deliberately not toISOString().slice(0,10), which is UTC —
// for IST (UTC+5:30) any time before 05:30 local would render as the previous
// calendar day (off-by-one issue/validity dates).
export function toDateInput(ts?: unknown): string {
  const d = ts ? new Date(ts as string) : new Date()
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function relativeTime(ts: unknown): string {
  const d = new Date(ts as string)
  if (Number.isNaN(d.getTime())) return "-"
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(ts)
}

// Days from now until `ts` (negative = overdue).
export function daysUntil(ts: unknown): number | null {
  const d = new Date(ts as string)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export function initials(name?: string): string {
  return (
    (name || "?")
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  )
}

// Convert an amount to Indian-format words for documents (e.g. "Rupees One
// Thousand Two Hundred Only"). Handles up to crores.
export function amountInWords(num: unknown): string {
  const n = Math.floor(Number(num) || 0)
  if (n === 0) return "Rupees Zero Only"
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  const twoDigits = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`
  const threeDigits = (x: number): string =>
    `${x >= 100 ? ones[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " : "") : ""}${x % 100 ? twoDigits(x % 100) : ""}`

  let result = ""
  const crore = Math.floor(n / 1e7)
  const lakh = Math.floor((n % 1e7) / 1e5)
  const thousand = Math.floor((n % 1e5) / 1e3)
  const rest = n % 1e3
  if (crore) result += `${twoDigits(crore)} Crore `
  if (lakh) result += `${twoDigits(lakh)} Lakh `
  if (thousand) result += `${twoDigits(thousand)} Thousand `
  if (rest) result += threeDigits(rest)
  return `Rupees ${result.trim()} Only`
}
