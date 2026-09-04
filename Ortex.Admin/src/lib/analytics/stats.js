import { round2 } from "../format"

// Median is used over mean throughout — one stuck 200-day deal shouldn't move
// the "how fast do we close" answer.
export function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2)
}
