// Live catalogue hook: products + categories managed in the Ortex Admin panel
// and read from Supabase, with the static constants/ files as fallback. The pure
// merge/map logic lives in catalogCore.js (shared with the build-time prerender).
// Mirrors the working live-fetch already used by QuoteCalculator.jsx.

import { useEffect, useState } from "react"
import { supabase, hasSupabase, timeoutSignal } from "./supabaseClient"
import { PRODUCTS } from "../constants/products"
import { mergeCategories, mapProduct, staticCategories, slugify } from "./catalogCore"
import { getPreloaded } from "./preloaded"

export { slugify }

/** Shape raw products_public / categories_public rows into the hook's state. */
export function fromRows(productRows, categoryRows) {
  const products = (productRows || []).map(mapProduct).filter((p) => p.status === "active")
  const liveCats = (categoryRows || []).map((r) => ({ id: r.id, ...(r.doc || {}) }))
  return {
    products: products.length ? products : PRODUCTS,
    categories: mergeCategories(liveCats),
    loading: false,
  }
}

// One live read per page load, shared by every useCatalog() on screen (page,
// footer, previews). A failed read is not kept, so the next mount tries again.
let liveState = null
let livePromise = null

function loadLive() {
  if (!livePromise) {
    const signal = timeoutSignal()
    livePromise = Promise.all([
      // The *_public views (migration 0020) hand back only website-safe
      // fields — no price, cost, HSN or GST — and already filter out
      // anything hidden from the site.
      supabase.from("products_public").select("id, doc").abortSignal(signal),
      supabase.from("categories_public").select("id, doc").abortSignal(signal),
    ])
      .then(([prodRes, catRes]) => {
        if (prodRes.error) throw prodRes.error
        if (catRes.error) throw catRes.error
        liveState = fromRows(prodRes.data, catRes.data)
        return liveState
      })
      .catch((err) => {
        livePromise = null
        throw err
      })
  }
  return livePromise
}

/**
 * React hook: { products, categories, loading }. Falls back to the static
 * constants when Supabase is not configured or a fetch fails, so pages always
 * render (categories are never null — static until live data arrives).
 * `loading` stays true until the live read settles unless the page was
 * prerendered for this very address, so a page never redirects away from a
 * product it simply has not fetched yet.
 */
export function useCatalog() {
  const [state, setState] = useState(() => {
    // Rows the prerender fetched and rendered this page with (lib/preloaded.js):
    // starting from them keeps hydration identical to the static HTML.
    const pre = getPreloaded("catalog")
    if (pre) return fromRows(pre.products, pre.categories)
    if (liveState) return liveState
    return {
      products: hasSupabase ? null : PRODUCTS,
      categories: hasSupabase ? null : staticCategories(),
      loading: hasSupabase,
    }
  })

  useEffect(() => {
    if (!hasSupabase) return
    let cancelled = false
    loadLive()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((err) => {
        console.error("Catalog load failed, using static fallback:", err)
        if (!cancelled) setState({ products: PRODUCTS, categories: staticCategories(), loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return {
    products: state.products || PRODUCTS,
    categories: state.categories || staticCategories(),
    loading: state.loading,
  }
}
