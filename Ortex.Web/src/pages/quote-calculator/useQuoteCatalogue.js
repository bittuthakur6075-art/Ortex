import { useState, useEffect } from "react"
import { PRODUCTS, CATEGORIES } from "../../constants/products"
import { supabase, hasSupabase } from "../../lib/supabaseClient"
import { getPreloaded } from "../../lib/preloaded"

// Fill the fields the request builder relies on so an admin product doc
// missing e.g. `material`/`moq` can't crash the filter (.toLowerCase on
// undefined), and keep only active products.
const toProducts = (rows) => (rows || [])
  .map((row) => ({
    name: "",
    material: "",
    category: "",
    moq: 1,
    leadTimeDays: 0,
    ...row.doc,
    id: row.id,
  }))
  .filter((p) => p.status === "active")

const categoriesOf = (products) => [...new Set(products.map((p) => p.category).filter(Boolean))]

// Catalogue for the request builder. First state is the live catalogue the
// prerender embedded in the page (so the HTML and the first render list real
// products), then a fresh read from Supabase. A failed or empty read keeps
// what is shown, or the static list, so the page can always take a request.
export default function useQuoteCatalogue() {
  const [initial] = useState(() => {
    const pre = toProducts(getPreloaded("catalog")?.products)
    if (pre.length) return { products: pre, categories: categoriesOf(pre), loading: false }
    if (hasSupabase) return { products: [], categories: [], loading: true }
    return { products: PRODUCTS, categories: CATEGORIES, loading: false }
  })
  const [productsList, setProductsList] = useState(initial.products)
  const [categoriesList, setCategoriesList] = useState(initial.categories)
  const [isLoading, setIsLoading] = useState(initial.loading)
  // True once the list is the real current catalogue: a successful live read,
  // or the static list on a build with no backend. The embedded (build-time)
  // list and the fallback after a failed read are not, so nothing may be
  // pruned from a saved cart against them.
  const [isFresh, setIsFresh] = useState(!hasSupabase)

  useEffect(() => {
    if (!hasSupabase) return

    let cancelled = false
    async function fetchProducts() {
      let active = []
      try {
        const { data, error } = await supabase
          .from("products_public")
          .select("id, doc")
        if (error) throw error
        active = toProducts(data)
      } catch (err) {
        console.error("Error fetching products from Supabase:", err)
      }
      if (cancelled) return

      if (active.length > 0) {
        setProductsList(active)
        setCategoriesList(categoriesOf(active))
        setIsFresh(true)
      } else {
        // Keep the embedded catalogue if there was one; otherwise the static list.
        setProductsList((cur) => (cur.length ? cur : PRODUCTS))
        setCategoriesList((cur) => (cur.length ? cur : CATEGORIES))
      }
      setIsLoading(false)
    }

    fetchProducts()
    return () => { cancelled = true }
  }, [])

  return { productsList, categoriesList, isLoading, isFresh }
}
