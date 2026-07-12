// Live catalogue hook: products + categories managed in the Ortex Admin panel
// and read from Supabase, with the static constants/ files as fallback. The pure
// merge/map logic lives in catalogData.js (shared with the build-time prerender).
// Mirrors the working live-fetch already used by QuoteCalculator.jsx.

import { useEffect, useState } from "react"
import { supabase, hasSupabase } from "./supabaseClient"
import { PRODUCTS } from "../constants/products"
import { mergeCategories, mapProduct, staticCategories, slugify } from "./catalogData"

export { slugify }

/**
 * React hook: { products, categories, loading }. Falls back to the static
 * constants when Supabase is not configured or a fetch fails, so pages always
 * render (categories are never null — static until live data arrives).
 */
export function useCatalog() {
  const [state, setState] = useState({
    products: hasSupabase ? null : PRODUCTS,
    categories: hasSupabase ? null : staticCategories(),
    loading: hasSupabase,
  })

  useEffect(() => {
    if (!hasSupabase) return
    let cancelled = false

    async function load() {
      try {
        const [prodRes, catRes] = await Promise.all([
          supabase.from("products").select("id, doc"),
          supabase.from("categories").select("id, doc"),
        ])
        if (prodRes.error) throw prodRes.error
        if (catRes.error) throw catRes.error

        const products = (prodRes.data || []).map(mapProduct).filter((p) => p.status === "active")
        const liveCats = (catRes.data || []).map((r) => ({ id: r.id, ...(r.doc || {}) }))

        if (cancelled) return
        setState({
          products: products.length ? products : PRODUCTS,
          categories: mergeCategories(liveCats),
          loading: false,
        })
      } catch (err) {
        console.error("Catalog load failed, using static fallback:", err)
        if (!cancelled) setState({ products: PRODUCTS, categories: staticCategories(), loading: false })
      }
    }

    load()
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
