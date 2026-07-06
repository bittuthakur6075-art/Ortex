import { useEffect } from "react"

const SITE_URL = "https://www.ortexindustries.in"

/**
 * Per-route document metadata: title, description, canonical URL, and the
 * Open Graph / Twitter tags that mirror them. Tags are created lazily and
 * marked with `data-managed` so we update the same nodes instead of appending
 * duplicates (also safe under React StrictMode double-invoke).
 */
function setMeta(selector, create) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    el.setAttribute("data-managed", "true")
    document.head.appendChild(el)
  }
  return el
}

function metaByName(name, content) {
  if (!content) return
  const el = setMeta(`meta[name="${name}"]`, () => {
    const m = document.createElement("meta")
    m.setAttribute("name", name)
    return m
  })
  el.setAttribute("content", content)
}

function metaByProp(property, content) {
  if (!content) return
  const el = setMeta(`meta[property="${property}"]`, () => {
    const m = document.createElement("meta")
    m.setAttribute("property", property)
    return m
  })
  el.setAttribute("content", content)
}

export default function useDocumentMetadata(title, description, options = {}) {
  const { path, image, robots } = options
  useEffect(() => {
    const prevTitle = document.title
    const url = `${SITE_URL}${path || window.location.pathname}`

    if (title) document.title = title
    metaByName("description", description)
    if (robots) metaByName("robots", robots)

    // Canonical
    const canonical = setMeta('link[rel="canonical"]', () => {
      const l = document.createElement("link")
      l.setAttribute("rel", "canonical")
      return l
    })
    canonical.setAttribute("href", url)

    // Open Graph + Twitter mirror
    metaByProp("og:title", title)
    metaByProp("og:description", description)
    metaByProp("og:url", url)
    if (image) metaByProp("og:image", image)
    metaByName("twitter:title", title)
    metaByName("twitter:description", description)
    if (image) metaByName("twitter:image", image)

    return () => {
      document.title = prevTitle
    }
  }, [title, description, path, image])
}
