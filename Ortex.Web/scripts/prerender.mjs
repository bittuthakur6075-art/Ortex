// Post-build prerender: emits dist/<route>/index.html with that route's real
// <title>, meta description, canonical, and social tags — plus baked JSON-LD
// for category pages — and generates dist/sitemap.xml from the same route list.
//
// Why: the SPA ships one index.html whose head describes the homepage; every
// other route's metadata is injected by JavaScript at runtime, which non-JS
// crawlers never see. Vercel serves static files before applying the SPA
// rewrite in vercel.json, so any file this script writes wins over the
// fallback, and client-side navigation is untouched.
//
// The route metadata below mirrors each page's useDocumentMetadata() call.
// If a page's title changes, change it here too — `npm run build` runs this on
// every deploy, and scripts/check is the place a mismatch would surface.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { buildCategorySchema, photosForCategory, SITE_URL } from "../src/constants/categories.js"
import { mergeCategories, mapProduct, staticCategories } from "../src/lib/catalogCore.js"
import { STATIC_ROUTES } from "./routes-meta.mjs"

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist")
const template = readFileSync(join(dist, "index.html"), "utf8")

// Pull the live, Admin-managed catalogue at build time so prerendered SEO/
// JSON-LD reflects Admin edits. Falls back to the static constants when Supabase
// env vars are absent (e.g. local build) or the fetch fails.
async function loadLiveCatalogue() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const sb = createClient(url, key)
    const [prodRes, catRes] = await Promise.all([
      sb.from("products").select("id, doc"),
      sb.from("categories").select("id, doc"),
    ])
    if (prodRes.error || catRes.error) throw prodRes.error || catRes.error
    const products = (prodRes.data || []).map(mapProduct).filter((p) => p.status === "active")
    const categories = mergeCategories((catRes.data || []).map((r) => ({ id: r.id, ...(r.doc || {}) })))
    return { products: products.length ? products : undefined, categories }
  } catch (err) {
    console.warn("prerender: live catalogue fetch failed, using static —", err.message)
    return null
  }
}

function categoryRoutes(categories, products) {
  return categories.map((entry) => ({
    path: `/products/${entry.slug}`,
    title: entry.seoTitle,
    description: entry.seoDescription,
    image: entry.image || photosForCategory(entry, 1)[0]?.url,
    schema: buildCategorySchema(entry, products),
  }))
}

// Everything below is sourced from the live catalogue (products/categories
// tables), which any staff account with those modules can edit. It is written
// into raw HTML here, outside React's escaping, so every value must be
// neutralised before it touches the template.
const escapeAttr = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

// JSON inside a <script> block must never contain "</script>" or "<!--".
// Escaping < > & as \uXXXX keeps it valid JSON while making it inert in HTML.
const jsonForScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")

// Only a plain http(s) URL may become a social-card image; anything else is
// dropped rather than rendered.
const safeImageUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/.test(String(u ?? "")) ? u : null)

// The pattern must capture the opening and closing markup as groups 1 and 2.
// The value is inserted via a replacer function so "$&", "$'" and friends
// inside data are never interpreted by String.prototype.replace.
function replaceTag(html, pattern, value, route, what) {
  const next = html.replace(pattern, (_m, open, close) => `${open}${value}${close}`)
  if (next === html) throw new Error(`prerender: could not rewrite ${what} for ${route} — index.html head changed?`)
  return next
}

function renderRoute(route) {
  const url = `${SITE_URL}${route.path}`
  const title = escapeAttr(route.title)
  const description = escapeAttr(route.description)

  let html = template
  html = replaceTag(html, /(<title>)[\s\S]*?(<\/title>)/, title, route.path, "<title>")
  html = replaceTag(html, /(<meta\s+name="description"\s+content=")[\s\S]*?(")/, description, route.path, "description")
  html = replaceTag(html, /(<link rel="canonical" href=")[^"]*(")/, url, route.path, "canonical")
  html = replaceTag(html, /(<meta property="og:title" content=")[^"]*(")/, title, route.path, "og:title")
  html = replaceTag(html, /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/, description, route.path, "og:description")
  html = replaceTag(html, /(<meta property="og:url" content=")[^"]*(")/, url, route.path, "og:url")
  html = replaceTag(html, /(<meta name="twitter:title" content=")[^"]*(")/, title, route.path, "twitter:title")
  html = replaceTag(html, /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/, description, route.path, "twitter:description")
  const image = safeImageUrl(route.image)
  if (image) {
    const img = escapeAttr(image)
    html = replaceTag(html, /(<meta\s+property="og:image"\s+content=")[^"]*(")/, img, route.path, "og:image")
    html = replaceTag(html, /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, img, route.path, "twitter:image")
  }
  if (route.schema) {
    const ld = jsonForScript(route.schema)
    html = html.replace("</head>", () => `<script type="application/ld+json">${ld}</script>\n</head>`)
  }

  const out = join(dist, ...route.path.split("/").filter(Boolean), "index.html")
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
}

function writeSitemap(routes) {
  const entry = (loc, priority, changefreq) =>
    `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    entry(`${SITE_URL}/`, "1.0", "weekly"),
    ...routes.map((r) => {
      const legal = /privacy|terms|cookies|acceptable-use/.test(r.path)
      const category = r.path.startsWith("/products/")
      return entry(`${SITE_URL}${r.path}`, legal ? "0.3" : category ? "0.9" : "0.8", legal ? "yearly" : category ? "weekly" : "monthly")
    }),
    `</urlset>`,
  ]
  writeFileSync(join(dist, "sitemap.xml"), lines.join("\n") + "\n")
}

async function main() {
  const live = await loadLiveCatalogue()
  const categories = live?.categories || staticCategories()
  const routes = [...STATIC_ROUTES, ...categoryRoutes(categories, live?.products)]
  for (const route of routes) renderRoute(route)
  writeSitemap(routes)
  console.log(
    `prerendered ${routes.length} routes (+ sitemap.xml with ${routes.length + 1} URLs)${live ? " [live catalogue]" : ""}`,
  )
}

main().catch((err) => {
  console.error("prerender failed:", err)
  process.exit(1)
})
