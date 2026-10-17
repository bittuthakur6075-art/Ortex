// Post-build prerender: writes dist/<route>/index.html for every route in
// routes-meta.mjs with the page ITSELF rendered into it (headings, copy, links)
// plus that route's <title>, description, canonical and social tags, then
// dist/404.html and dist/sitemap.xml from the same list.
//
// Why: the Hostinger Horizons site this replaces shipped an empty
// <div id="root"> and a blank <title>, so crawlers that do not run JavaScript
// and every WhatsApp/LinkedIn link preview saw nothing. Each page is rendered
// by src/entry-server.jsx (built with `vite build --ssr` into dist-ssr/) and
// the browser hydrates the markup in place (src/main.jsx).
//
// Every page here is static: content lives in src/constants/, nothing is read
// from the database at build time. Hosting is static (public/.htaccess), so a
// URL with no file here is a real 404 served as 404.html.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { SITE_URL } from "../src/constants/site.js"
import { PORTFOLIO, portfolioImage } from "../src/constants/content.js"
import { STATIC_ROUTES, ROUTE_SOURCE } from "./routes-meta.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "dist")
const ssrDir = join(root, "dist-ssr")
const template = withSiteVerification(readFileSync(join(dist, "index.html"), "utf8"))

// index.html and robots.txt cannot import SITE_URL, so check they spell the
// same origin: a canonical or sitemap pointing at another host (bizgift. is the
// other Ortex site) tells Google to index that host instead of this one.
for (const [file, text] of [["index.html", template], ["robots.txt", readFileSync(join(dist, "robots.txt"), "utf8")]]) {
  const stray = [...new Set(text.match(/https:\/\/[a-z0-9.-]*ortexindustries\.in/g) || [])].filter((o) => o !== SITE_URL)
  if (stray.length) throw new Error(`prerender: ${file} links ${stray.join(", ")}, but SITE_URL is ${SITE_URL}`)
}
const BUILD_DATE = new Date().toISOString().slice(0, 10)
const manifestPath = join(dist, ".vite", "manifest.json")
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null

// Pages are lazy chunks, so their CSS would otherwise be fetched only after the
// JavaScript that imports it has run. Linking the page chunk's CSS and
// modulepreloading its JS from the HTML lets both start with the document.
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

// A plain node script sees no .env values, so read the files Vite would.
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

// Google Search Console ownership (URL-prefix property), from
// GOOGLE_SITE_VERIFICATION in .env.production. Keep it set for good: Google
// re-checks it periodically.
function withSiteVerification(html) {
  const fileEnv = envFromFiles(process.env.NODE_ENV === "staging" ? "staging" : "production")
  const raw = (process.env.GOOGLE_SITE_VERIFICATION || fileEnv.GOOGLE_SITE_VERIFICATION || "").trim()
  if (!raw) {
    console.warn("prerender: GOOGLE_SITE_VERIFICATION not set, no Search Console verification tag")
    return html
  }
  const code = raw.match(/content="([^"]+)"/)?.[1] ?? raw
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) {
    throw new Error(`prerender: GOOGLE_SITE_VERIFICATION does not look like a Search Console code: ${raw}`)
  }
  const tag = `<meta name="google-site-verification" content="${code}" />`
  const next = html.replace(/(<meta name="author"[^>]*>)/, (m) => `${m}\n    ${tag}`)
  if (next === html) throw new Error("prerender: could not place the Search Console tag (index.html head changed?)")
  console.log("[search console] verification tag written")
  return next
}

// JSON inside a <script> block must never contain "</script>" or "<!--".
const jsonForScript = (value) =>
  JSON.stringify(value).replace(/</g, "\u003c").replace(/>/g, "\u003e").replace(/&/g, "\u0026")

// Per-page JSON-LD: the page type, tied to the site-wide WebSite and
// Organization in index.html by @id, and a breadcrumb trail for inner pages
// (Google shows it in place of the raw URL).
function pageSchema(route) {
  const url = `${SITE_URL}${route.path === "/" ? "/" : route.path}`
  const page = {
    "@type": route.type || "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: route.title,
    description: route.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
  }
  if (route.images?.length) page.primaryImageOfPage = { "@type": "ImageObject", url: route.images[0] }
  const graph = [page]
  if (route.path !== "/") {
    page.breadcrumb = { "@id": `${url}#breadcrumb` }
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: route.name, item: url },
      ],
    })
  }
  return { "@context": "https://schema.org", "@graph": graph }
}

const escapeAttr = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

// The pattern must capture the opening and closing markup as groups 1 and 2.
function replaceTag(html, pattern, value, route, what) {
  const next = html.replace(pattern, (_m, open, close) => `${open}${value}${close}`)
  if (next === html && !html.match(pattern)) {
    throw new Error(`prerender: could not rewrite ${what} for ${route} (index.html head changed?)`)
  }
  return next
}

async function renderRoute(render, route) {
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

  if (!route.notFound) {
    const ld = `<script type="application/ld+json" id="page-schema">${jsonForScript(pageSchema(route))}</script>`
    html = html.replace("</head>", () => `${ld}
</head>`)
  }

  const links = chunkLinks(route.source)
  if (links) html = html.replace("</head>", () => `${links}\n</head>`)

  const body = await render(route.renderPath || route.path)
  if (!html.includes(`<div id="root"></div>`)) throw new Error("prerender: <div id=\"root\"></div> not found in index.html")
  html = html.replace(`<div id="root"></div>`, () => `<div id="root" data-route="${escapeAttr(route.path)}">${body}</div>`)

  const out = route.file
    ? join(dist, route.file)
    : join(dist, ...route.path.split("/").filter(Boolean), "index.html")
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  return body
}

function writeSitemap(routes) {
  const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    ...routes
      .filter((r) => !r.notFound)
      .map((r) => [
        "  <url>",
        `    <loc>${xml(`${SITE_URL}${r.path === "/" ? "/" : r.path}`)}</loc>`,
        `    <lastmod>${BUILD_DATE}</lastmod>`,
        ...(r.images || []).map((src) => `    <image:image><image:loc>${xml(src)}</image:loc></image:image>`),
        "  </url>",
      ].join("\n")),
    `</urlset>`,
  ]
  writeFileSync(join(dist, "sitemap.xml"), lines.join("\n") + "\n")
}

async function main() {
  const ssrEntry = join(ssrDir, "entry-server.js")
  if (!existsSync(ssrEntry)) throw new Error("prerender: dist-ssr/entry-server.js missing. Run `vite build --ssr src/entry-server.jsx --outDir dist-ssr` first.")
  const { render } = await import(pathToFileURL(ssrEntry).href)

  // Real product photos go into the image sitemap: the portfolio lists them
  // all, the home page shows the first six.
  const photo = (p) => `${SITE_URL}${portfolioImage(p.image)}`
  const IMAGES = { "/portfolio": PORTFOLIO.map(photo), "/": PORTFOLIO.slice(0, 6).map(photo) }
  const routes = STATIC_ROUTES.map((r) => ({ ...r, source: ROUTE_SOURCE[r.path], images: IMAGES[r.path] }))
  routes.push({
    path: "/404",
    renderPath: "/__not-found__",
    file: "404.html",
    notFound: true,
    source: "src/pages/NotFound.jsx",
    title: "Page not found (404) | Ortex Industries",
    description: "The page you are looking for does not exist or has moved. Explore our products and portfolio, or get in touch with Ortex Industries.",
  })

  const problems = []
  for (const route of routes) {
    const body = await renderRoute(render, route)
    if (!route.notFound && !/<h1[\s>]/.test(body)) problems.push(`no <h1> rendered on ${route.path}`)
  }
  writeSitemap(routes)
  rmSync(ssrDir, { recursive: true, force: true })
  rmSync(join(dist, ".vite"), { recursive: true, force: true })

  const pages = routes.filter((r) => !r.notFound).length
  console.log(`prerendered ${pages} pages + 404.html, sitemap.xml with ${pages} URLs`)
  if (problems.length) throw new Error("prerender:\n  - " + problems.join("\n  - "))
}

main().catch((err) => {
  console.error("prerender failed:", err)
  process.exit(1)
})
