import { useMemo } from "react"
import { DAY_MS, RANGES, VOICE_SOURCE, displayName, flagsFor, groupIntoCalls, itemsFor, parseMessage } from "./helpers"

// Turns raw `enquiries` rows into folded calls, headline stats and the filtered
// list the page renders. Pure derivation over the collection plus the filter
// state, so it re-runs only when one of those changes.
export function useVoiceCalls(items, { query, range, view }) {
  const calls = useMemo(() => {
    const rows = (items || [])
      .filter((e) => e.source === VOICE_SOURCE)
      .map((e) => {
        const parsed = { ...e, ...parseMessage(e.message) }
        return { ...parsed, itemsList: itemsFor(parsed) }
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return groupIntoCalls(rows).map((c) => ({ ...c, flags: flagsFor(c), ...displayName(c.customer.name) }))
  }, [items])

  const stats = useMemo(() => {
    const now = Date.now()
    const products = new Map()
    const callers = new Set()
    let week = 0
    let support = 0
    for (const c of calls) {
      callers.add(c.phoneKey)
      if (now - new Date(c.endedAt).getTime() <= 7 * DAY_MS) week += 1
      if (c.flags.support) support += 1
      const p = c.productInterest.trim()
      if (p) products.set(p, (products.get(p) || 0) + 1)
    }
    const top = [...products.entries()].sort((a, b) => b[1] - a[1])[0]
    const repeat = calls.length - callers.size
    return {
      calls: calls.length,
      callers: callers.size,
      repeat,
      week,
      support,
      topProduct: top?.[0] || "",
      topCount: top?.[1] || 0,
    }
  }, [calls])

  const visible = useMemo(() => {
    let rows = calls
    if (view === "support") rows = rows.filter((c) => c.flags.support)
    else if (view === "attention") rows = rows.filter((c) => c.status === "new" && !c.flags.support)

    const days = RANGES.find((r) => r.key === range)?.days
    if (days) {
      const cutoff = Date.now() - days * DAY_MS
      rows = rows.filter((c) => new Date(c.endedAt).getTime() >= cutoff)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((c) =>
        [
          c.name, c.customer.phone, c.customer.company, c.customer.address, c.customer.email,
          c.productInterest, c.quantity, c.timeline, c.summary,
          ...c.itemsList.map((i) => `${i.product} ${i.quantity} ${i.notes}`),
          ...c.rows.map((r) => r.reference),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    }
    return rows
  }, [calls, query, range, view])

  return { calls, stats, visible }
}
