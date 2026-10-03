import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { onAutoRefresh } from "../data/store/autoRefresh"
import { PRODUCT_CATEGORIES } from "../data/domain/schema"
import { DEFAULT_SETTINGS } from "../data/domain/settingsDefaults"

// Billing and the tab inside it both ask for invoices and payments on the same
// change: requests for one collection started within SHARE_MS share one fetch.
// Only that short window, so a load after a change never joins an older fetch.
const SHARE_MS = 50
const inflight = new Map()
function listOnce(name) {
  if (!inflight.has(name)) {
    const req = repo.list(name)
    inflight.set(name, req)
    const drop = () => inflight.get(name) === req && inflight.delete(name)
    setTimeout(drop, SHARE_MS)
    req.then(drop, drop)
  }
  return inflight.get(name)
}

// Store changes arrive in bursts (a payment insert fires the payment and the
// invoice its trigger updates). Wait this long after the last one, then load.
const DEBOUNCE_MS = 300

// Reload `load` on store changes, debounced. apiStore passes the changed table
// name, so only hooks holding that collection reload; localStore passes an
// Event (no name), which reloads everyone.
function useStoreRefresh(load, names) {
  const key = names.join(",")
  useEffect(() => {
    let timer = null
    const later = (table) => {
      if (typeof table === "string" && !key.split(",").includes(table)) return
      clearTimeout(timer)
      timer = setTimeout(load, DEBOUNCE_MS)
    }
    const unsub = repo.subscribe(later)
    const unsubAuto = onAutoRefresh(() => later())
    return () => {
      clearTimeout(timer)
      unsub()
      unsubAuto()
    }
  }, [load, key])
}

// Subscribes a component to a collection and re-fetches it when that table
// changes (debounced, in this or another tab). A slower, older response never
// overwrites a newer one. Returns { items, loading, error, reload }.
export function useCollection(name) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mounted = useRef(true)
  const latest = useRef(0)

  // `fresh` (only from reload(), right after a write) never joins a fetch that
  // may have started before that write committed.
  const load = useCallback(async (fresh) => {
    const ticket = ++latest.current
    try {
      const rows = await (fresh === true ? repo.list(name) : listOnce(name))
      if (mounted.current && ticket === latest.current) {
        setItems(rows)
        setError(null)
        setLoading(false)
      }
    } catch (e) {
      // Without this, a failed fetch (network / RLS deny) left loading=true
      // forever and the list view spun with no error.
      console.error(`Failed to load collection "${name}":`, e)
      if (mounted.current && ticket === latest.current) {
        setError(e)
        setLoading(false)
      }
    }
  }, [name])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])
  useStoreRefresh(load, [name])

  const reload = useCallback(() => load(true), [load])
  return { items, loading, error, reload }
}

// Load many collections at once (dashboard/analytics). `names` must be stable.
export function useCollections(names) {
  const key = names.join(",")
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  const latest = useRef(0)

  const load = useCallback(async (fresh) => {
    const ticket = ++latest.current
    try {
      const lists = await Promise.all(names.map((n) => (fresh === true ? repo.list(n) : listOnce(n))))
      if (mounted.current && ticket === latest.current) {
        const next = {}
        names.forEach((n, i) => (next[n] = lists[i]))
        setData(next)
        setLoading(false)
      }
    } catch (e) {
      console.error("Failed to load collections:", e)
      if (mounted.current && ticket === latest.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])
  useStoreRefresh(load, names)

  const reload = useCallback(() => load(true), [load])
  return { data, loading, reload }
}

// Category master with a built-in fallback so category dropdowns are never
// empty before the categories collection has been seeded/created.
export function useCategories() {
  const { items } = useCollection("categories")
  if (items.length) return [...items].sort((a, b) => a.name.localeCompare(b.name))
  return PRODUCT_CATEGORIES.map((name) => ({ id: name, name, hsn: "", gstRate: 18, _fallback: true }))
}

export function useSettings() {
  const [settings, setSettings] = useState(null)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    try {
      const s = await repo.getSettings()
      if (mounted.current) setSettings(s)
    } catch (e) {
      // Fall back to defaults so the Settings page renders instead of hanging
      // on <PageLoader/> forever when the fetch fails.
      // Said out loud: a page drawn from the defaults shows a placeholder GSTIN.
      console.error("Failed to load settings:", e)
      toast.error(`Company settings could not be loaded: ${e?.message || e}`, { id: "settings-load" })
      // Flagged (non-enumerable, so never saved or cloned along) for the
      // Control centre to refuse saving; settings that did load are kept.
      const fallback = Object.defineProperty(structuredClone(DEFAULT_SETTINGS), "loadFailed", { value: true })
      if (mounted.current) setSettings((prev) => (prev && !prev.loadFailed ? prev : fallback))
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    // Only a change to settings itself; apiStore names the table, localStore
    // passes an Event (no name), which still reloads.
    const unsub = repo.subscribe((table) => {
      if (typeof table === "string" && table !== "settings") return
      load()
    })
    const unsubAuto = onAutoRefresh(load)
    return () => {
      mounted.current = false
      unsub()
      unsubAuto()
    }
  }, [load])

  return settings
}

export function useSorting(defaultKey, defaultDesc = false) {
  const [sort, setSort] = useState({ key: defaultKey, desc: defaultDesc })
  const onSort = useCallback((key) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, desc: !prev.desc }
      }
      return { key, desc: false }
    })
  }, [])
  return [sort, onSort]
}

