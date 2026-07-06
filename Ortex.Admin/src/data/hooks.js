import { useState, useEffect, useCallback, useRef } from "react"
import { repo } from "./repository"
import { onAutoRefresh } from "./autoRefresh"
import { PRODUCT_CATEGORIES } from "./schema"

// Subscribes a component to a collection and re-fetches whenever ANY store
// change fires (create/update/remove in this or another tab). Coarse but
// correct — data volumes here are tiny. Returns { items, loading, reload }.
export function useCollection(name) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    const rows = await repo.list(name)
    if (mounted.current) {
      setItems(rows)
      setLoading(false)
    }
  }, [name])

  useEffect(() => {
    mounted.current = true
    load()
    const unsub = repo.subscribe(load)
    const unsubAuto = onAutoRefresh(load)
    return () => {
      mounted.current = false
      unsub()
      unsubAuto()
    }
  }, [load])

  return { items, loading, reload: load }
}

// Load many collections at once (dashboard/analytics). `names` must be stable.
export function useCollections(names) {
  const key = names.join(",")
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    const lists = await Promise.all(names.map((n) => repo.list(n)))
    if (mounted.current) {
      const next = {}
      names.forEach((n, i) => (next[n] = lists[i]))
      setData(next)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    mounted.current = true
    load()
    const unsub = repo.subscribe(load)
    const unsubAuto = onAutoRefresh(load)
    return () => {
      mounted.current = false
      unsub()
      unsubAuto()
    }
  }, [load])

  return { data, loading, reload: load }
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
    const s = await repo.getSettings()
    if (mounted.current) setSettings(s)
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    const unsub = repo.subscribe(load)
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

