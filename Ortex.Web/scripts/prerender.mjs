// Post-build prerender: writes dist/<route>/index.html for every public route
// with the page ITSELF rendered into it (headings, copy, product names, links)
// plus that route's <title>, description, canonical, social tags and JSON-LD,
// then dist/404.html and dist/sitemap.xml from the same route list.
//
// Why: the SPA ships one index.html whose body is an empty <div id="root">.
// Google renders JavaScript eventually, in a second and slower pass; Bing, AI
// search crawlers and WhatsApp/LinkedIn link previews mostly do not, so they
// saw a blank page. Each page is rendered by src/entry-server.jsx (built with
// `vite build --ssr` into dist-ssr/), and the browser hydrates the markup in
// place (src/main.jsx), so nothing repaints.
//
// Hosting is static (Hostinger, public/.htaccess): a URL with no file here is a
// real 404, served as 404.html. A product or category added in the console
// therefore needs a rebuild and upload to be indexable, and until then its URL
// answers 404 while still rendering for a visitor (404.html boots the app).
//
// Static route metadata lives in routes-meta.mjs (check-meta.mjs keeps it in
// step with each page's useDocumentMetadata call).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { buildCategorySchema, buildProductSchema, productSeo, photosForCategory, SITE_URL } from "../src/constants/categories.js"
import { mergeCategories, mapProduct, staticCategories, productsInCategory } from "../src/lib/catalogCore.js"
import { PRODUCTS } from "../src/constants/products.js"
import { STATIC_ROUTES, ROUTE_SOURCE } from "./routes-meta.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "dist")
const ssrDir = join(root, "dist-ssr")
const template = readFileSync(join(dist, "index.html"), "utf8")

// index.html and robots.txt cannot import SITE_URL, so check they spell the
// same origin: a canonical or sitemap pointing at another host tells Google to
// index that host instead of this site.
for (const [file, text] of [["index.html", template], ["robots.txt", readFileSync(join(dist, "robots.txt"), "utf8")]]) {
  const stray = [...new Set(text.match(/https:\/\/[a-z0-9.-]*ortexindustries\.in/g) || [])].filter((o) => o !== SITE_URL)
  if (stray.length) throw new Error(`prerender: ${file} links ${stray.join(", ")}, but SITE_URL is ${SITE_URL}`)
}
const BUILD_DATE = new Date().toISOString().slice(0, 10)
const manifestPath = join(dist, ".vite", "manifest.json")
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null

// Pages are lazy chunks, so their CSS (the hero's included) is normally fetched
// only after the JavaScript that imports it has downloaded and run: the
// prerendered markup painted unstyled, or waited seconds for its own styles.
// Linking the page chunk's CSS and modulepreloading its JS from the HTML lets
// both start with the document.
function chunkLinks(source) {
  if (!manifest || !source) return ""
  const css = new Set()
  const js = new Set()
  const seen = new Set()
  const walk = (key) => {
    const entry = manifest[key]
    if (!entry || seen.has(key)) return
    seen.add(key)
    if (!entry.isEntry) js.add(entry.file)
    for (const c of entry.css || []) css.add(c)
    for (const imp of entry.imports || []) walk(imp)
  }
  walk(source)
  for (const f of [...css, ...js]) if (template.includes(`/${f}"`)) { css.delete(f); js.delete(f) }
  if (!seen.size) console.warn(`prerender: ${source} is not in the build manifest; its chunk will load late`)
  return [
    ...[...css].map((f) => `<link rel="stylesheet" crossorigin href="/${f}">`),
    ...[...js].map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`),
  ].join("\n")
}

// Vite reads .env files for the CLIENT bundle only; this is a plain node
// script, so nothing has populated process.env by the time it runs. A build
// on a machine that does not export the variables (Hostinger, a laptop) would
// therefore prerender the static demo catalogue into the public site's SEO
// while the bundle it ships alongside reads the live one — the two disagreeing
// with no error anywhere. So read the same files Vite would, in Vite's own
// precedence: a real environment variable wins, then .env.<mode>, then .env.
function envFromFiles(mode) {
  const out = {}
  for (const file of [".env", `.env.${mode}`]) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
    }
  }
  return out
}

// Raw rows for the catalogue and the work gallery. They are handed to the
// renderer AND written into each page (src/lib/preloaded.js), so the first
// client render starts from exactly what the HTML was rendered with.
async function loadLiveData() {
  const fileEnv = envFromFiles(process.env.NODE_ENV === "staging" ? "staging" : "production")
  const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY
  if (!url || !key || url.includes("YOUR-")) {
    console.warn("\n!! prerender: no Supabase credentials. Baking the STATIC catalogue, not the live one.\n")
    return null
  }
  try {
    const sb = createClient(url, key)
    const [prodRes, catRes, workRes] = await Promise.all([
      sb.from("products_public").select("id, doc"),
      sb.from("categories_public").select("id, doc"),
      sb.from("work").select("id, doc"),
    ])
    if (prodRes.error || catRes.error) throw prodRes.error || catRes.error
    return {
      catalog: { products: prodRes.data || [], categories: catRes.data || [] },
      // The gallery is optional: a failed read keeps the static archive.
      work: workRes.error ? null : workRes.data || [],
    }
  } catch (err) {
    console.warn("\n!! prerender: live catalogue fetch failed, using static:", err.message, "\n")
    return null
  }
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
    .replaceAll(String.fromCharCode(0x2028), "\\u2028")
    .replaceAll(String.fromCharCode(0x2029), "\\u2029")

// Only a plain http(s) URL may become a social-card image; anything else is
// dropped rather than rendered.
const safeImageUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/.test(String(u ?? "")) ? u : null)

// The pattern must capture the opening and closing markup as groups 1 and 2.
// The value is inserted via a replacer function so "$&", "$'" and friends
// inside data are never interpreted by String.prototype.replace.
function replaceTag(html, pattern, value, route, what) {
  const next = html.replace(pattern, (_m, open, close) => `${open}${value}${close}`)
  if (next === html && !html.match(pattern)) {
    throw new Error(`prerender: could not rewrite ${what} for ${route} (index.html head changed?)`)
  }
  return next
}

// The rows each page is rendered with are also embedded in it for hydration,
// so ship only what that page draws. The footer on every page needs the
// categories; product rows (~0.6 KB each, the whole catalogue on every page
// otherwise) go only to pages that list products, and the work gallery only to
// /work. A page given no product rows renders nothing from them on either side,
// so hydration still matches.
function dataFor(route, live) {
  const { path } = route
  const all = live.catalog.products
  // A category or product page draws only its own category's products.
  const products = route.category
    ? all.filter((r) => r.doc?.category === route.category)
    : path === "/" || path === "/products"
      ? all
      : []
  return {
    catalog: { categories: live.catalog.categories, products },
    work: path === "/work" ? live.work : null,
  }
}

async function renderRoute(render, route, data) {
  const url = `${SITE_URL}${route.path === "/" ? "/" : route.path}`
  const title = escapeAttr(route.title)
  const description = escapeAttr(route.description)

  let html = template
  html = replaceTag(html, /(<title>)[\s\S]*?(<\/title>)/, title, route.path, "<title>")
  html = replaceTag(html, /(<meta\s+name="description"\s+content=")[\s\S]*?(")/, description, route.path, "description")
  html = replaceTag(html, /(<meta property="og:title" content=")[^"]*(")/, title, route.path, "og:title")
  html = replaceTag(html, /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/, description, route.path, "og:description")
  html = replaceTag(html, /(<meta name="twitter:title" content=")[^"]*(")/, title, route.path, "twitter:title")
  html = replaceTag(html, /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/, description, route.path, "twitter:description")
  if (route.notFound) {
    // A 404 must not name itself canonical for anything or be indexed.
    html = html.replace(/<link rel="canonical" href="[^"]*" \/>\s*/, "")
    html = html.replace(/<meta property="og:url" content="[^"]*" \/>\s*/, "")
    html = replaceTag(html, /(<meta name="robots" content=")[^"]*(")/, "noindex, follow", route.path, "robots")
  } else {
    html = replaceTag(html, /(<link rel="canonical" href=")[^"]*(")/, url, route.path, "canonical")
    html = replaceTag(html, /(<meta property="og:url" content=")[^"]*(")/, url, route.path, "og:url")
  }
  const image = safeImageUrl(route.image)
  if (image) {
    const img = escapeAttr(image)
    html = replaceTag(html, /(<meta\s+property="og:image"\s+content=")[^"]*(")/, img, route.path, "og:image")
    html = replaceTag(html, /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, img, route.path, "twitter:image")
    // The default card's pixel size and alt text describe the default image only.
    html = html.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*" \/>/g, "")
    html = replaceTag(html, /(<meta property="og:image:alt" content=")[^"]*(")/, title, route.path, "og:image:alt")
  }
  if (route.product) html = html.replace(`<meta property="og:type" content="website" />`, `<meta property="og:type" content="product" />`)
  if (route.schema) {
    // Same id the page's useJsonLd() uses, so hydration replaces this block
    // instead of adding a duplicate.
    const ld = `<script type="application/ld+json" id="${route.schemaId || "page-schema"}">${jsonForScript(route.schema)}</script>`
    html = html.replace("</head>", () => `${ld}\n</head>`)
  }

  const links = chunkLinks(route.source)
  if (links) html = html.replace("</head>", () => `${links}\n</head>`)

  const body = await render(route.renderPath || route.path, data)
  const boot = data ? `<script type="application/json" id="ortex-data">${jsonForScript(data)}</script>` : ""
  if (!html.includes(`<div id="root"></div>`)) throw new Error("prerender: <div id=\"root\"></div> not found in index.html")
  html = html.replace(`<div id="root"></div>`, () => `<div id="root" data-route="${escapeAttr(route.path)}">${body}</div>${boot}`)

  const out = route.file
    ? join(dist, route.file)
    : join(dist, ...route.path.split("/").filter(Boolean), "index.html")
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  return body
}

function writeSitemap(routes) {
  const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const entry = (r) => {
    const loc = `${SITE_URL}${r.path === "/" ? "/" : r.path}`
    const images = (r.images || []).filter(safeImageUrl).slice(0, 10)
    return [
      "  <url>",
      `    <loc>${xml(loc)}</loc>`,
      `    <lastmod>${BUILD_DATE}</lastmod>`,
      ...images.map((src) => `    <image:image><image:loc>${xml(src)}</image:loc></image:image>`),
      "  </url>",
    ].join("\n")
  }
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    ...routes.filter((r) => !r.notFound).map(entry),
    `</urlset>`,
  ]
  writeFileSync(join(dist, "sitemap.xml"), lines.join("\n") + "\n")
}

async function main() {
  const ssrEntry = join(ssrDir, "entry-server.js")
  if (!existsSync(ssrEntry)) throw new Error("prerender: dist-ssr/entry-server.js missing. Run `vite build --ssr src/entry-server.jsx --outDir dist-ssr` first.")
  const { render, FAQ_SCHEMA } = await import(pathToFileURL(ssrEntry).href)

  const live = await loadLiveData()
  const products = live ? live.catalog.products.map(mapProduct).filter((p) => p.status === "active") : []
  const catalogProducts = products.length ? products : PRODUCTS
  const categories = live ? mergeCategories(live.catalog.categories.map((r) => ({ id: r.id, ...(r.doc || {}) }))) : staticCategories()

  const routes = STATIC_ROUTES.map((r) => ({
    ...r,
    source: ROUTE_SOURCE[r.path],
    ...(r.path === "/faq" ? { schema: FAQ_SCHEMA, schemaId: "faq-schema" } : {}),
  }))
  for (const entry of categories) {
    const items = productsInCategory(entry, catalogProducts)
    const catImage = entry.image || items.find((p) => p.images?.[0])?.images?.[0] || photosForCategory(entry, 1)[0]?.url
    routes.push({
      path: `/products/${entry.slug}`,
      title: entry.seoTitle,
      description: entry.seoDescription,
      image: catImage,
      source: "src/pages/ProductCategory.jsx",
      category: entry.category,
      images: [catImage, ...items.map((p) => p.images?.[0])].filter(Boolean),
      schema: buildCategorySchema(entry, catalogProducts),
    })
    for (const p of items) {
      const seo = productSeo(entry, p)
      routes.push({
        path: p.path,
        title: seo.title,
        description: seo.description,
        image: p.images?.[0],
        images: p.images,
        product: true,
        source: "src/pages/ProductDetail.jsx",
        category: entry.category,
        schema: buildProductSchema(entry, p),
      })
    }
  }
  routes.push({
    path: "/404",
    renderPath: "/__not-found__",
    file: "404.html",
    notFound: true,
    source: "src/pages/NotFound.jsx",
    title: "Page not found (404) - Ortex Industries",
    description: "The page you're looking for doesn't exist or has moved. Explore our products, portfolio, or get in touch with Ortex Industries.",
  })

  const problems = []
  for (const route of routes) {
    if (!route.title) throw new Error(`prerender: ${route.path} has no title`)
    const body = await renderRoute(render, route, live && dataFor(route, live))
    if (route.title.length > 65) problems.push(`title ${route.title.length} chars on ${route.path}`)
    if ((route.description || "").length > 165) problems.push(`description ${route.description.length} chars on ${route.path}`)
    if (!route.notFound && !/<h1[\s>]/.test(body)) problems.push(`no <h1> rendered on ${route.path}`)
  }
  writeSitemap(routes)
  rmSync(ssrDir, { recursive: true, force: true })
  rmSync(join(dist, ".vite"), { recursive: true, force: true })

  const pages = routes.filter((r) => !r.notFound).length
  console.log(`prerendered ${pages} pages + 404.html, sitemap.xml with ${pages} URLs${live ? " [live catalogue]" : " [STATIC catalogue]"}`)
  if (problems.length) console.warn("prerender SEO warnings (edit the copy in the console or constants):\n  - " + problems.join("\n  - "))
}

main().catch((err) => {
  console.error("prerender failed:", err)
  process.exit(1)
})
