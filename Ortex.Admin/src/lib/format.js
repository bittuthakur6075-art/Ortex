// Formatting + money helpers. All monetary math in the app runs through
// `round2` to avoid floating-point drift accumulating across line items.

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Indian Rupee. `compact` gives ₹1.2L / ₹3.4Cr for dashboard tiles.
export function formatCurrency(n, { compact = false } = {}) {
  const value = Number(n) || 0
  if (compact) {
    const abs = Math.abs(value)
    if (abs >= 1e7) return `₹${round2(value / 1e7)}Cr`
    if (abs >= 1e5) return `₹${round2(value / 1e5)}L`
    if (abs >= 1e3) return `₹${round2(value / 1e3)}K`
  }
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatNumber(n) {
  return (Number(n) || 0).toLocaleString("en-IN")
}

export function formatDate(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// yyyy-mm-dd for <input type="date"> values. Uses LOCAL date parts, the old
// toISOString().slice(0,10) is UTC, so for IST (UTC+5:30) any time before 05:30
// local rendered as the previous calendar day (off-by-one issue/due dates).
export function toDateInput(ts) {
  const d = ts ? new Date(ts) : new Date()
  if (Number.isNaN(d.getTime())) return ""
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function relativeTime(ts) {
  const d = new Date(ts)
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
export function daysUntil(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

export function initials(name) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?"
}

// Convert an amount to indian-format words for invoices and receipts, e.g.
// "Rupees One Thousand Two Hundred and Fifty Paise Only". Crores of crores
// recurse ("One Hundred Twenty Crore"), never "undefined".
// MIRRORED in Ortex.Mobile/src/domain/format.ts: edit both.
export function amountInWords(num) {
  const totalPaise = Math.round(Math.abs(Number(num) || 0) * 100)
  const n = Math.floor(totalPaise / 100)
  const paise = totalPaise % 100
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  const twoDigits = (x) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`)
  const threeDigits = (x) =>
    `${x >= 100 ? ones[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " : "") : ""}${x % 100 ? twoDigits(x % 100) : ""}`
  const words = (x) => {
    let result = ""
    const crore = Math.floor(x / 1e7)
    const lakh = Math.floor((x % 1e7) / 1e5)
    const thousand = Math.floor((x % 1e5) / 1e3)
    const rest = x % 1e3
    if (crore) result += `${words(crore)} Crore `
    if (lakh) result += `${twoDigits(lakh)} Lakh `
    if (thousand) result += `${twoDigits(thousand)} Thousand `
    if (rest) result += threeDigits(rest)
    return result.trim()
  }
  return `Rupees ${n ? words(n) : "Zero"}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`
}
