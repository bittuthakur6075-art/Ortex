import { useEffect, useState } from "react"
import { selfieUrl } from "../../services/attendance"

// Signed view URLs for a set of selfie paths, fetched once per path and kept
// for the page's life (they last an hour). A purged selfie resolves to null.
const cache = new Map()

export function useSelfieUrls(paths) {
  const key = (paths || []).filter(Boolean).sort().join("|")
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let alive = true
    const list = key ? key.split("|") : []
    Promise.all(
      list.map(async (p) => {
        if (!cache.has(p)) cache.set(p, selfieUrl(p))
        return [p, await cache.get(p)]
      }),
    ).then((pairs) => {
      if (alive) setUrls(Object.fromEntries(pairs))
    })
    return () => {
      alive = false
    }
  }, [key])
  return urls
}
