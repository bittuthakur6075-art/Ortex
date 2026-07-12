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
import {
  PRODUCT_CATEGORIES, buildCategorySchema, photosForCategory, SITE_URL,
} from "../src/constants/categories.js"
import { STATIC_ROUTES } from "./routes-meta.mjs"

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist")
const template = readFileSync(join(dist, "index.html"), "utf8")

const CATEGORY_ROUTES = PRODUCT_CATEGORIES.map((entry) => ({
  path: `/products/${entry.slug}`,
  title: entry.seoTitle,
  description: entry.seoDescription,
  image: photosForCategory(entry, 1)[0]?.url,
  schema: buildCategorySchema(entry),
}))

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

function replaceTag(html, pattern, replacement, route, what) {
  const next = html.replace(pattern, replacement)
  if (next === html) throw new Error(`prerender: could not rewrite ${what} for ${route} — index.html head changed?`)
  return next
}

function renderRoute(route) {
  const url = `${SITE_URL}${route.path}`
  const title = escapeAttr(route.title)
  const description = escapeAttr(route.description)

  let html = template
  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`, route.path, "<title>")
  html = replaceTag(html, /(<meta\s+name="description"\s+content=")[\s\S]*?(")/, `$1${description}$2`, route.path, "description")
  html = replaceTag(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`, route.path, "canonical")
  html = replaceTag(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`, route.path, "og:title")
  html = replaceTag(html, /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/, `$1${description}$2`, route.path, "og:description")
  html = replaceTag(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`, route.path, "og:url")
  html = replaceTag(html, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`, route.path, "twitter:title")
  html = replaceTag(html, /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/, `$1${description}$2`, route.path, "twitter:description")
  if (route.image) {
    html = html
      .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${route.image}$2`)
      .replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, `$1${route.image}$2`)
  }
  if (route.schema) {
    html = html.replace(
      "</head>",
      `<script type="application/ld+json">${JSON.stringify(route.schema)}</script>\n</head>`
    )
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

const routes = [...STATIC_ROUTES, ...CATEGORY_ROUTES]
for (const route of routes) renderRoute(route)
writeSitemap(routes)
console.log(`prerendered ${routes.length} routes (+ sitemap.xml with ${routes.length + 1} URLs)`)
