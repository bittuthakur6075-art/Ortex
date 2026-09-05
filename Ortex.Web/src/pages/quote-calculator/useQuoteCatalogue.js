import { useState, useEffect } from "react"
import { PRODUCTS, CATEGORIES } from "../../constants/products"
import { supabase, hasSupabase } from "../../lib/supabaseClient"

// Loads the live catalogue from Supabase when configured; otherwise serves the
// static product list. Exposes the raw lists plus a loading flag.
export default function useQuoteCatalogue() {
  const [productsList, setProductsList] = useState(hasSupabase ? [] : PRODUCTS)
  const [categoriesList, setCategoriesList] = useState(hasSupabase ? [] : CATEGORIES)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!hasSupabase) return

    async function fetchProducts() {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from("products_public")
          .select("id, doc")
        
        if (error) throw error
        
        if (data) {
          const activeProducts = data
            // Fill the fields the request builder relies on so an admin product
            // doc missing e.g. `material`/`moq` can't crash the filter
            // (.toLowerCase on undefined).
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

          if (activeProducts.length > 0) {
            setProductsList(activeProducts)
            const derivedCategories = [...new Set(activeProducts.map((p) => p.category).filter(Boolean))]
            setCategoriesList(derivedCategories)
          }
        }
      } catch (err) {
        console.error("Error fetching products from Supabase:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProducts()
  }, [])

  return { productsList, categoriesList, isLoading }
}
