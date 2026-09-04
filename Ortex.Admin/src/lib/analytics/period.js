// Period helpers shared by every period-scoped analytics function.

export const inRange = (ts, from, to) => {
  const t = new Date(ts).getTime()
  return t >= from && t < to
}

export function periodBounds(period) {
  const now = new Date()
  const to = now.getTime()
  const start = new Date(now)
  if (period === "mtd") start.setDate(1)
  else if (period === "qtd") start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1)
  else if (period === "ytd") start.setMonth(0, 1)
  else start.setDate(now.getDate() - 30) // rolling 30d default
  start.setHours(0, 0, 0, 0)
  return { from: start.getTime(), to }
}
