// A company's fallback mark: a rounded-square monogram for a company with no
// uploaded logo (migration 0075). MIRRORED line for line from
// Ortex.Mobile/src/domain/companyMark.ts, so a quotation from either app carries
// the same initials in the same colour. Keep it this simple.

/** Eight brand-safe colours, each dark enough for white initials. */
export const COMPANY_MARK_COLOURS = [
  "#2F50E4", // Ortex blue
  "#0F766E", // teal
  "#7C3AED", // violet
  "#B45309", // amber
  "#BE185D", // rose
  "#15803D", // green
  "#1D4ED8", // royal
  "#9F1239", // crimson
]

/** First letters of the first two words, uppercase: "Aman Enterprise" -> "AE", "Ortex" -> "O". */
export function companyInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
}

/** A stable colour for a company id: (hash * 31 + char code), unsigned 32-bit, mod the palette. */
export function companyColour(id) {
  let hash = 0
  for (const ch of String(id || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return COMPANY_MARK_COLOURS[hash % COMPANY_MARK_COLOURS.length]
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** The monogram as an SVG (a 64 x 64 rounded square), for a document masthead. */
export function companyMarkSvg(id, name) {
  const initials = esc(companyInitials(name) || "?")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${companyColour(id)}"/><text x="32" y="32" dy="0.35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${initials.length > 1 ? 26 : 32}" font-weight="700" fill="#FFFFFF">${initials}</text></svg>`
}
