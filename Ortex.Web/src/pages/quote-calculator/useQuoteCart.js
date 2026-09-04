import { useState, useMemo, useEffect } from "react"
import { useSearchParams } from "react-router-dom"

// Cart state for the RFQ builder. Cart is { [productId]: quantity }; lines are
// derived against the current catalogue so stale ids drop out automatically.
export default function useQuoteCart(productsList) {
  const [cart, setCart] = useState({})

  const productById = useMemo(() => Object.fromEntries(productsList.map((p) => [p.id, p])), [productsList])

  // Deep link from category landing pages: /quote?add=prod_key01 (comma-separable)
  // seeds the cart at each product's MOQ. Re-runs if the Supabase fetch swaps
  // the catalogue in, so an id that wasn't loaded yet still lands in the cart.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const ids = (searchParams.get("add") || "").split(",").filter(Boolean)
    if (ids.length === 0) return
    setCart((c) => {
      const next = { ...c }
      for (const id of ids) {
        const p = productById[id]
        if (p && next[id] == null) next[id] = p.moq
      }
      return next
    })
  }, [searchParams, productById])

  // Cart lines: product + quantity only. No pricing is computed or shown — the
  // sales desk sends a formal quotation after the request is submitted.
  const lines = useMemo(
    () => Object.entries(cart)
      // A cart id may not be in the current list (e.g. the async Supabase fetch
      // replaced the catalogue after an item was added) — drop it.
      .map(([id, qty]) => {
        const product = productById[id]
        return product ? { product, qty: Math.max(0, Math.round(Number(qty) || 0)) } : null
      })
      .filter(Boolean),
    [cart, productById]
  )
  const belowMoq = lines.filter((l) => l.qty > 0 && l.qty < l.product.moq)
  // Combined orders dispatch together, so the window follows the slowest line.
  const maxLeadTime = lines.reduce((m, l) => Math.max(m, l.product.leadTimeDays), 0)

  const addToCart = (product) => setCart((c) => (c[product.id] ? c : { ...c, [product.id]: product.moq }))
  const setQty = (id, qty) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.round(Number(qty) || 0)) }))
  const bumpQty = (id, delta) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }))
  const removeLine = (id) => setCart((c) => {
    const n = { ...c }
    delete n[id]
    return n
  })

  return { cart, setCart, lines, belowMoq, maxLeadTime, addToCart, setQty, bumpQty, removeLine }
}
