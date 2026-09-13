import React from "react"

import { DAY, rangeFor, type RangeKey, type WebActivity } from "@/domain/dashboard"
import { errorMessage, supabase } from "@/data/supabase"

/**
 * The website's visit log (`user_activities`, written by Ortex.Web's
 * lib/tracker.js), for the Home tab's Website panel.
 *
 * Not a `useCollection`: the table is machine-written and high-volume (a row
 * per page view), so pulling every doc into the shared store and AsyncStorage
 * the way the business collections are would be megabytes on a phone for a
 * handful of counts. Instead it reads ONLY the window being shown plus the one
 * before it (for the comparison), and asks PostgREST to project just the JSON
 * keys the numbers need, the IP, lat/long and ISP never leave the server.
 *
 * RLS (0008 `staff_all_activities`) lets any active staff read the table, but
 * the console only shows Insights to admins, so the screen calls this with
 * `enabled` false for everyone else and nothing is fetched.
 *
 * Kept in memory per window for a few minutes, so switching 7/30/90 back and
 * forth does not refetch, and pull-to-refresh forces it.
 */

const COLUMNS = [
  "at:created_at",
  "userId:doc->>userId",
  "sessionId:doc->>sessionId",
  "activityType:doc->>activityType",
  "referrer:doc->>referrer",
  "device:doc->>device",
  "city:doc->>city",
  "pageUrl:doc->>pageUrl",
  "page:doc->metadata->>page",
  "productName:doc->metadata->>productName",
  "searchQuery:doc->metadata->>searchQuery",
].join(",")

const PAGE = 1000
/** A ceiling, not a target: past this the panel says the counts are partial. */
const MAX_ROWS = 20000
const FRESH_MS = 5 * 60 * 1000

type Entry = { rows: WebActivity[]; at: number; truncated: boolean }
const cache = new Map<number, Entry>()

async function fetchWindow(days: number): Promise<Entry> {
  const since = new Date(Date.now() - (days + 1) * DAY).toISOString()
  const rows: WebActivity[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase
      .from("user_activities")
      .select(COLUMNS)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    rows.push(...((data || []) as unknown as WebActivity[]))
    if (!data || data.length < PAGE) return { rows, at: Date.now(), truncated: false }
  }
  return { rows, at: Date.now(), truncated: true }
}

export function useWebTraffic(range: RangeKey, enabled: boolean) {
  // Twice the range: the window shown and the one it is compared with.
  const days = rangeFor(range).days * 2
  const [state, setState] = React.useState<{
    rows: WebActivity[]
    loading: boolean
    error: string | null
    truncated: boolean
  }>(() => {
    const hit = cache.get(days)
    return { rows: hit?.rows || [], loading: enabled && !hit, error: null, truncated: hit?.truncated || false }
  })

  const load = React.useCallback(
    async (force = false) => {
      if (!enabled) return
      const hit = cache.get(days)
      if (hit && !force && Date.now() - hit.at < FRESH_MS) {
        setState({ rows: hit.rows, loading: false, error: null, truncated: hit.truncated })
        return
      }
      setState((s) => ({ ...s, loading: !hit, error: null }))
      try {
        const entry = await fetchWindow(days)
        cache.set(days, entry)
        setState({ rows: entry.rows, loading: false, error: null, truncated: entry.truncated })
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: errorMessage(e, "Could not load website traffic") }))
      }
    },
    [days, enabled],
  )

  React.useEffect(() => {
    void load()
  }, [load])

  return { ...state, reload: () => load(true) }
}
