// Pure (React-free, Node-importable) catalogue helpers shared by the browser
// hook (lib/catalog.js) and the build-time prerender (scripts/prerender.mjs).
// It merges Admin-managed Supabase categories over the static marketing
// defaults and maps product rows to the website shape. No side effects.

import { PRODUCTS } from "../constants/products.js"
import { PRODUCT_CATEGORIES } from "../constants/categories.js"

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Static categories normalised to the merged shape used everywhere. */
export function staticCategories() {
  return PRODUCT_CATEGORIES.map((entry, i) => ({ ...entry, image: "", _live: null, _order: i }))
}

/** Map a live product row ({id, doc}) to the website product shape. */
export function mapProduct(row) {
  const d = row.doc || {}
  return {
    id: row.id,
    name: d.name || "",
    sku: d.sku || "",
    category: d.category || "",
    material: d.material || "",
    basePrice: Number(d.basePrice) || 0,
    moq: Number(d.moq) || 1,
    gstRate: d.gstRate == null ? 18 : Number(d.gstRate),
    unit: d.unit || "pcs",
    leadTimeDays: Number(d.leadTimeDays) || 0,
    description: d.description || "",
    images: Array.isArray(d.images) ? d.images.filter(Boolean) : [],
    status: d.status || "active",
  }
}

function applyOverrides(entry, live, index) {
  const order = live && Number.isFinite(Number(live.sortOrder)) ? Number(live.sortOrder) : index
  return {
    ...entry,
    name: live?.displayName?.trim() || entry.name,
    seoTitle: live?.seoTitle?.trim() || entry.seoTitle,
    seoDescription: live?.seoDescription?.trim() || entry.seoDescription,
    intro: live?.intro?.trim() || entry.intro,
    image: live?.image?.trim() || "",
    _live: live || null,
    _order: order,
  }
}

function synthCategory(live) {
  const displayName = live.displayName?.trim() || live.name
  const slug = live.slug?.trim() || slugify(live.name)
  const keywordSrc = slug.split("-").filter(Boolean).join("|") || "zzzzzz"
  return {
    slug,
    category: live.name,
    name: displayName,
    seoTitle: live.seoTitle?.trim() || `${displayName} | Ortex Industries`,
    seoDescription:
      live.seoDescription?.trim() ||
      live.description?.trim() ||
      `Custom ${displayName} manufactured in-house by Ortex Industries.`,
    intro: live.intro?.trim() || live.description?.trim() || "",
    image: live.image?.trim() || "",
    photoCategory: null,
    photoKeywords: new RegExp(keywordSrc, "i"),
    extraFaq: () => null,
    _live: live,
    _order: Number.isFinite(Number(live.sortOrder)) ? Number(live.sortOrder) : 999,
  }
}

/** Merge Admin category docs over static marketing entries. */
export function mergeCategories(liveCats) {
  if (!liveCats || !liveCats.length) return staticCategories()
  const byName = new Map(liveCats.map((c) => [c.name, c]))
  const base = PRODUCT_CATEGORIES.map((entry, i) => {
    const live = byName.get(entry.category)
    if (live) byName.delete(entry.category)
    return applyOverrides(entry, live, i)
  })
  const extra = [...byName.values()].map(synthCategory)
  return [...base, ...extra]
    .filter((c) => c._live?.active !== false)
    .sort((a, b) => a._order - b._order)
}

/** Fallback product list when Supabase is unavailable. */
export const STATIC_PRODUCTS = PRODUCTS
