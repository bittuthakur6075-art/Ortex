import { useEffect } from "react"

/**
 * Keeps one JSON-LD <script id={id}> in <head> for the page's lifetime.
 *
 * scripts/prerender.mjs bakes the same block into the static HTML under the
 * same id, so the effect REPLACES that node rather than appending a second
 * copy (two identical FAQPage blocks are a Search Console "duplicate field"
 * error). Pass `null` data to write nothing.
 */
export default function useJsonLd(id, data) {
  const json = data ? JSON.stringify(data) : null
  useEffect(() => {
    if (!json) return
    document.getElementById(id)?.remove()
    const script = document.createElement("script")
    script.type = "application/ld+json"
    script.id = id
    script.textContent = json
    document.head.appendChild(script)
    return () => document.getElementById(id)?.remove()
  }, [id, json])
}
