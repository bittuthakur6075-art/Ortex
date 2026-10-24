import { useEffect, useState } from "react"

// The quote cart ({ [productId]: quantity }) survives a refresh or a visit to a
// product page for the rest of the browser session, and the navbar shows its
// size. Storage can be missing or blocked (private mode, SSR): every access is
// guarded and the cart then simply lives in memory.
const KEY = "ortex.quoteCart"
const EVENT = "ortex:quote-cart"

export function loadQuoteCart() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "{}")
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

export function saveQuoteCart(cart) {
  try {
    if (Object.keys(cart).length) sessionStorage.setItem(KEY, JSON.stringify(cart))
    else sessionStorage.removeItem(KEY)
  } catch { /* storage blocked: the cart stays in memory only */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT))
}

// Number of products in the saved cart, kept current across the site.
export function useQuoteCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const read = () => setCount(Object.keys(loadQuoteCart()).length)
    read()
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [])
  return count
}

// Stepper increment that suits the product's run size: a quarter of the MOQ,
// rounded down to a familiar figure (MOQ 1000 steps 250, MOQ 100 steps 25,
// MOQ 10 steps 1).
const NICE_STEPS = [1000, 500, 250, 100, 50, 25, 10, 5, 1]
export function qtyStep(moq) {
  const target = (Number(moq) || 1) / 4
  return NICE_STEPS.find((s) => s <= target) || 1
}
