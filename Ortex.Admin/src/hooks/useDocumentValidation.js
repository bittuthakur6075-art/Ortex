import { useEffect, useMemo, useRef, useState } from "react"
import { validateDocument } from "../lib/validateDocument"

// validateDocument for an editor, with what to SHOW: a field's problem appears
// once that field has been left (blur), and every problem after Save is pressed,
// never while a pristine form is being typed into. Fields carry `data-path`
// (Field's prop, or the control itself); `onBlurCapture` goes on the editor's
// root, beside `ref={rootRef}`. `reveal()` shows everything and moves focus to
// the first problem in screen order.
export default function useDocumentValidation(doc, { kind, products, companyRequired }) {
  const result = useMemo(() => validateDocument(doc, { kind, products, companyRequired }), [doc, kind, products, companyRequired])
  const [touched, setTouched] = useState(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const rootRef = useRef(null)
  const latest = useRef(result.errors)
  latest.current = result.errors

  useEffect(() => {
    if (!focusTick) return
    const id = requestAnimationFrame(() => {
      const root = rootRef.current
      if (!root) return
      for (const path of Object.keys(latest.current)) {
        const el = root.querySelector(`[data-path="${path}"]`)
        if (!el) continue
        el.scrollIntoView({ block: "center", behavior: "smooth" })
        const control = el.matches("input, textarea, button") ? el : el.querySelector("input, textarea, button")
        control?.focus({ preventScroll: true })
        return
      }
    })
    return () => cancelAnimationFrame(id)
  }, [focusTick])

  const pick = (map) => (submitted ? map : Object.fromEntries(Object.entries(map).filter(([k]) => touched.has(k))))
  const keys = Object.keys(result.errors)
  return {
    ...result,
    shown: pick(result.errors),
    shownWarnings: pick(result.warnings),
    count: keys.length,
    first: keys.length ? result.errors[keys[0]] : "",
    rootRef,
    onBlurCapture: (e) => {
      const path = e.target.closest?.("[data-path]")?.dataset.path
      if (path && !touched.has(path)) setTouched((t) => new Set(t).add(path))
    },
    reveal: () => {
      setSubmitted(true)
      setFocusTick((n) => n + 1)
    },
  }
}
