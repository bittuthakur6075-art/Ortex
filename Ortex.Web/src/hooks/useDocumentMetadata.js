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
  if (!content) {
    const el = document.head.querySelector(`meta[name="${name}"][data-managed="true"]`)
    if (el) el.remove()
    return
  }
  const el = setMeta(`meta[name="${name}"]`, () => {
    const m = document.createElement("meta")
    m.setAttribute("name", name)
    return m
  })
  el.setAttribute("content", content)
}

function metaByProp(property, content) {
  if (!content) {
    const el = document.head.querySelector(`meta[property="${property}"][data-managed="true"]`)
    if (el) el.remove()
    return
  }
  const el = setMeta(`meta[property="${property}"]`, () => {
    const m = document.createElement("meta")
    m.setAttribute("property", property)
    return m
  })
  el.setAttribute("content", content)
}

export default function useDocumentMetadata(title, description, options = {}) {
  const { 
    path, 
    image, 
    keywords, 
    robots = "index, follow", 
    schema, 
    schemas, 
    type = "website", 
    card = "summary_large_image" 
  } = options

  useEffect(() => {
    const prevTitle = document.title
    const url = path ? `${SITE_URL}${path}` : window.location.origin + window.location.pathname

    if (title) document.title = title
    metaByName("description", description)
    metaByName("keywords", keywords)
    metaByName("robots", robots)

    // Canonical
    const canonical = setMeta('link[rel="canonical"]', () => {
      const l = document.createElement("link")
      l.setAttribute("rel", "canonical")
      return l
    })
    canonical.setAttribute("href", url)

    // Open Graph + Twitter mirror
    metaByProp("og:type", type)
    metaByProp("og:title", title)
    metaByProp("og:description", description)
    metaByProp("og:url", url)
    if (image) {
      metaByProp("og:image", image)
      metaByProp("og:image:alt", title)
    }
    metaByProp("og:locale", "en_IN")
    metaByProp("og:site_name", "Ortex Industries")

    metaByName("twitter:card", card)
    metaByName("twitter:title", title)
    metaByName("twitter:description", description)
    if (image) metaByName("twitter:image", image)

    // JSON-LD Schema Injection
    const activeSchemas = []
    const rawSchemas = schemas || (schema ? [schema] : [])
    
    rawSchemas.forEach((s) => {
      if (!s) return
      const script = document.createElement("script")
      script.type = "application/ld+json"
      script.setAttribute("data-managed-schema", "true")
      script.text = JSON.stringify(s)
      document.head.appendChild(script)
      activeSchemas.push(script)
    })

    return () => {
      document.title = prevTitle
      activeSchemas.forEach((script) => {
        if (script && script.parentNode) {
          script.parentNode.removeChild(script)
        }
      })
    }
  }, [title, description, path, image, keywords, robots, type, card, schema, schemas])
}

