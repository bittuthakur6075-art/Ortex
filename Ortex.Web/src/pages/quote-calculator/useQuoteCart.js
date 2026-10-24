import { useState, useMemo, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { loadQuoteCart, saveQuoteCart, qtyStep } from "../../lib/quoteCart"
import { MAX_QUOTE_LINES } from "./helpers"

// Cart state for the RFQ builder. Cart is { [productId]: quantity }; lines are
// derived against the current catalogue so stale ids drop out automatically.
export default function useQuoteCart(productsList, isFresh) {
  const [cart, setCart] = useState({})
  // Restore the session's cart after mount (storage is not available during
  // prerender), and only start saving once that restore has happened. The save
  // effect is declared first so on mount it runs before the flag is set and
  // cannot overwrite the saved cart with the empty initial one.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) saveQuoteCart(cart)
  }, [cart])
  useEffect(() => {
    setCart((c) => ({ ...loadQuoteCart(), ...c }))
    restored.current = true
  }, [])

  const productById = useMemo(() => Object.fromEntries(productsList.map((p) => [p.id, p])), [productsList])

  // Deep link from category landing pages: /quote?add=prod_key01 (comma-separable)
  // seeds the cart at each product's MOQ. Re-runs if the Supabase fetch swaps
  // the catalogue in, so an id that wasn't loaded yet still lands in the cart.
  // Each id is added once: a line the visitor then removes must not come back
  // when the catalogue swaps in. Once every id is handled (or the live list
  // has arrived), `add` leaves the URL, so a refresh does not re-add either.
  const [searchParams, setSearchParams] = useSearchParams()
  const handledAdds = useRef(new Set())
  useEffect(() => {
    const ids = (searchParams.get("add") || "").split(",").filter(Boolean)
    if (ids.length === 0) return
    const fresh = ids.filter((id) => productById[id] && !handledAdds.current.has(id))
    if (fresh.length) {
      for (const id of fresh) handledAdds.current.add(id)
      setCart((c) => {
        const next = { ...c }
        for (const id of fresh) {
          if (next[id] == null && Object.keys(next).length < MAX_QUOTE_LINES) next[id] = productById[id].moq
        }
        return next
      })
    }
    if (isFresh || ids.every((id) => handledAdds.current.has(id))) {
      setSearchParams((sp) => {
        const next = new URLSearchParams(sp)
        next.delete("add")
        return next
      }, { replace: true })
    }
  }, [searchParams, setSearchParams, productById, isFresh])

  // Ids the live catalogue no longer has (a product made inactive since the
  // cart was saved) are dropped, but only against the live list: the embedded
  // build-time list or the fallback after a failed read would drop products
  // that do exist.
  useEffect(() => {
    if (!isFresh || productsList.length === 0) return
    setCart((c) => {
      const stale = Object.keys(c).filter((id) => !productById[id])
      if (stale.length === 0) return c
      const next = { ...c }
      for (const id of stale) delete next[id]
      return next
    })
  }, [isFresh, productsList, productById])

  // Cart lines: product + quantity only. No pricing is computed or shown: the
  // sales desk sends a formal quotation after the request is submitted.
  const lines = useMemo(
    () => Object.entries(cart)
      .map(([id, qty]) => {
        const product = productById[id]
        return product ? { product, qty: Math.max(0, Math.round(Number(qty) || 0)) } : null
      })
      .filter(Boolean),
    [cart, productById]
  )
  const belowMoq = lines.filter((l) => l.qty > 0 && l.qty < l.product.moq)
  // A line left at 0 (typed or cleared) blocks the request until fixed.
  const emptyQty = lines.filter((l) => l.qty === 0)
  // Combined orders dispatch together, so the window follows the slowest line.
  const maxLeadTime = lines.reduce((m, l) => Math.max(m, l.product.leadTimeDays), 0)

  // Returns false when the quote is full (MAX_QUOTE_LINES), so the caller can say so.
  const addToCart = (product) => {
    if (cart[product.id] == null && Object.keys(cart).length >= MAX_QUOTE_LINES) return false
    setCart((c) => (c[product.id] != null ? c : { ...c, [product.id]: product.moq }))
    return true
  }
  // Typed quantities accept "1,000" or "1 000": everything but digits is dropped.
  const setQty = (id, qty) => setCart((c) => ({ ...c, [id]: Number(String(qty).replace(/\D/g, "")) || 0 }))
  const removeLine = (id) => setCart((c) => {
    const n = { ...c }
    delete n[id]
    return n
  })
  // Stepping below 1 removes the line, so the cart never carries "× 0".
  const bumpQty = (id, direction) => setCart((c) => {
    const step = qtyStep(productById[id]?.moq)
    const next = (Number(c[id]) || 0) + direction * step
    if (next <= 0) {
      const n = { ...c }
      delete n[id]
      return n
    }
    return { ...c, [id]: next }
  })

  return { cart, setCart, lines, belowMoq, emptyQty, maxLeadTime, addToCart, setQty, bumpQty, removeLine }
}
