// Live "Work" showcase hook: photos managed in the Ortex Admin panel (the `work`
// collection) merged with the static archive in constants/home.js. Admin-managed
// items lead (sorted by sortOrder); the static production archive follows, deduped
// by image URL. Falls back to the static list alone when Supabase is not
// configured or a fetch fails, so /work always renders.

import { useEffect, useState } from "react"
import { supabase, hasSupabase } from "./supabaseClient"
import { workPhotos } from "../constants/home"

/** Merge live items ahead of the static archive, deduped by image URL. */
function merge(liveItems) {
  const seen = new Set(liveItems.map((p) => p.image))
  const rest = workPhotos.filter((p) => !seen.has(p.image))
  return [...liveItems, ...rest]
}

export function useWork() {
  const [photos, setPhotos] = useState(hasSupabase ? null : workPhotos)

  useEffect(() => {
    if (!hasSupabase) return
    let cancelled = false

    async function load() {
      try {
        const { data, error } = await supabase.from("work").select("id, doc")
        if (error) throw error
        const live = (data || [])
          .map((r) => ({ id: r.id, ...(r.doc || {}) }))
          .filter((d) => d.active !== false && d.image)
          .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
          .map((d) => ({ image: d.image, title: d.title || "", alt: d.alt || d.title || "", category: d.category || "" }))

        if (cancelled) return
        setPhotos(live.length ? merge(live) : workPhotos)
      } catch (err) {
        console.error("Work load failed, using static fallback:", err)
        if (!cancelled) setPhotos(workPhotos)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { photos: photos || workPhotos, loading: hasSupabase && photos === null }
}
