import { supabase, hasSupabase } from "../../../lib/supabaseClient"

// ---- The live catalogue, as Anu sees it ------------------------------------
//
// Anu's prompt carries the general range Ortex makes, but the real list lives
// in the console. This reads the PUBLIC views (migration 0020: `products_public`
// / `categories_public`, which expose an allow-list of fields and never price,
// cost, HSN or GST), so a product added or edited in the console reaches the
// next call with no code change.
//
// Two levels, so the prompt stays small as the catalogue grows: a compact index
// of everything goes into the system instruction, and `lookup_product` returns
// the full entry for one product on demand, along with what to offer next to it.

// Re-read per call, so a product an admin adds or edits in the console is
// described on the very next call. The window only stops a retried connection
// fetching twice within the same minute.
const FRESH_MS = 60 * 1000
// Guardrails for the system instruction: a few hundred products must not turn
// into a prompt Anu has to wade through before she can speak.
const MAX_INDEX_PRODUCTS = 120
const NAME_CHARS = 90
const INTRO_CHARS = 160
const DESCRIPTION_CHARS = 500

// What is worth offering alongside a category, by category name. Anything not
// listed falls back to other products in the same category.
const AFFINITY = {
  "Lanyards & ID card accessories": ["Badge manufacturing", "Corporate gifting & merchandise"],
  "Badge manufacturing": ["Lanyards & ID card accessories", "MDF products"],
  "MDF products": ["Acrylic products", "Badge manufacturing"],
  "Acrylic products": ["MDF products", "Corporate gifting & merchandise"],
  "Corporate gifting & merchandise": ["Customization & branding", "Acrylic products"],
  "Customization & branding": ["Corporate gifting & merchandise", "Acrylic products"],
  "Examination boards": ["Clipboards & writing pads", "Badge manufacturing"],
  "Clipboards & writing pads": ["Examination boards", "Corporate gifting & merchandise"],
}

const clip = (v, max) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
const norm = (v) => String(v ?? "").toLowerCase()

// Filler a caller wraps a request in, in English and spoken Hindi. Left in, a
// word like "for" or "custom" matches half the catalogue.
const STOPWORDS = new Set([
  "for", "the", "and", "with", "our", "your", "need", "want", "some", "any", "please", "customised",
  "customized", "custom", "printed", "print", "logo", "branded", "branding", "quantity", "pieces",
  "piece", "order", "quote", "quotation", "chahiye", "mujhe", "aur", "hai", "kya", "karna", "karni",
  "wala", "wali", "bhi", "sir", "madam",
  // Who the order is for, not what it is. Left in, "for our staff" drags in
  // every product whose description mentions staff.
  "client", "clients", "customer", "staff", "employee", "employees", "team", "company", "office",
  "event", "events", "annual", "school", "college", "exhibition", "conference", "festival",
  "diwali", "rakhi", "wedding", "promotional", "promotion",
])
// Crude singular: "trophies" and "boxes" should find "trophy" and "box".
const stem = (t) => (t.endsWith("ies") ? `${t.slice(0, -3)}y` : t.endsWith("es") ? t.slice(0, -2) : t.endsWith("s") ? t.slice(0, -1) : t)
const words = (v) => [...new Set(
  norm(v).split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t))
    .map(stem),
)]

let cache = null

/** Read the public catalogue. Returns null when it cannot be read. */
export async function loadCatalogue() {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache
  if (!hasSupabase) return null
  try {
    const [cats, prods] = await Promise.all([
      supabase.from("categories_public").select("doc"),
      supabase.from("products_public").select("doc").limit(500),
    ])
    if (cats.error) throw cats.error
    if (prods.error) throw prods.error
    const categories = (cats.data || []).map((r) => r.doc).filter((c) => c?.name && c.active !== false)
    // Absent status means active, matching the console and the phone.
    const products = (prods.data || [])
      .map((r) => r.doc)
      .filter((p) => p?.name && (!p.status || p.status === "active"))
    if (!products.length) return null
    cache = { at: Date.now(), categories, products }
    return cache
  } catch (err) {
    console.warn("Live catalogue unavailable for Anu:", err?.message || err)
    return null
  }
}

/** The index appended to Anu's system instruction. "" when there is nothing. */
export function catalogueBlock(data) {
  if (!data?.products?.length) return ""
  const byCategory = new Map()
  for (const p of data.products) {
    const key = p.category || "Other"
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key).push(p)
  }
  const lines = [
    "",
    "# THE LIVE CATALOGUE (read from the Ortex console at the start of this call)",
    `This is what Ortex actually has listed right now: ${data.products.length} products in ${byCategory.size} categories. It is the truth about names, materials and minimum quantities, and it overrides the general range above wherever they disagree. Call lookup_product before you describe, recommend or take an order for any item, because it returns the real material, minimum quantity, dispatch time and the add-ons worth offering. A product NOT listed here can still be made: custom work is Ortex's core business, so capture it as a custom item instead of refusing.`,
  ]
  let shown = 0
  for (const [category, list] of byCategory) {
    const intro = data.categories.find((c) => c.name === category)?.intro
    lines.push(`## ${category}${intro ? ` (${clip(intro, INTRO_CHARS)})` : ""}`)
    for (const p of list) {
      if (shown >= MAX_INDEX_PRODUCTS) break
      const facts = [
        p.moq ? `min ${p.moq}` : "",
        clip(p.material, 40),
        p.leadTimeDays ? `${p.leadTimeDays} day dispatch` : "",
      ].filter(Boolean).join(", ")
      lines.push(`- ${clip(p.name, NAME_CHARS)}${facts ? ` (${facts})` : ""}`)
      shown += 1
    }
  }
  if (shown < data.products.length) {
    lines.push(`(${data.products.length - shown} more products are listed; use lookup_product to find them by name.)`)
  }
  return lines.join("\n")
}

function detail(p) {
  return {
    name: clip(p.name, NAME_CHARS),
    category: p.category || "",
    material: p.material || "",
    minimum_order: p.moq || "not set, so the team will confirm it",
    unit: p.unit || "pcs",
    dispatch_days: p.leadTimeDays || "",
    description: clip(p.description, DESCRIPTION_CHARS),
  }
}

/**
 * One product, with what to say next to it. `matches` is empty when the
 * customer asked for something Ortex does not list, which is a custom run
 * rather than a refusal.
 */
export function lookupProduct(data, query) {
  if (!data?.products?.length) {
    return {
      catalogue_available: false,
      matches: [],
      next: "The live catalogue could not be read on this call. Describe only the general range in your instructions, never invent a material, size or minimum, and tell the customer the team will confirm the exact minimum and dispatch time in the quotation.",
    }
  }
  const terms = words(query)
  if (!terms.length) return { catalogue_available: true, matches: [], next: "Ask the customer which product they mean, then look it up." }

  // Compare stemmed word against stemmed word, so "trophies" finds "trophy",
  // and let a word of four or more letters match a longer relative of itself
  // ("gift" and "gifting", "keychain" and "keychains").
  const hits = (field, term) => {
    const tokens = words(field)
    return tokens.includes(term) || (term.length >= 4 && tokens.some((t) => t.startsWith(term) || term.startsWith(t)))
  }
  // How many of the customer's own words a product has to account for. One
  // shared generic noun is not enough: "ID card holders" matched a "Wall Key
  // Holder" on "holder" alone, which is a different product entirely.
  const needed = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.67)
  const scored = data.products
    .map((p) => {
      let score = 0
      let strong = 0
      for (const t of terms) {
        if (hits(p.name, t)) { score += 5; strong += 1 }
        else if (hits(p.category, t)) { score += 3; strong += 1 }
        else if (hits(p.material, t)) { score += 2; strong += 1 }
        else if (hits(p.description, t)) { score += 1 }
      }
      return { p, score, strong }
    })
    // A word found only in the marketing description is NOT a match either:
    // that once returned an acrylic keychain for "wedding invitation cards".
    .filter((x) => x.strong >= needed)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (!scored.length) {
    const categories = [...new Set(data.products.map((p) => p.category).filter(Boolean))]
    return {
      catalogue_available: true,
      matches: [],
      is_custom: true,
      categories_we_list: categories,
      next: "Nothing in the catalogue matches, so this is a custom run. Do NOT refuse and do NOT invent a listed product: custom work is Ortex's core business. Ask what you still need (material or finish, size, quantity, branding and timeline), say the team will confirm feasibility and send a quotation, and save it with capture_lead as an item with custom=true and a clear description.",
    }
  }

  const best = scored[0].p
  const sameCategory = data.products
    .filter((p) => p.category === best.category && p.name !== best.name)
    .slice(0, 4)
    .map((p) => clip(p.name, NAME_CHARS))
  const addOns = (AFFINITY[best.category] || [])
    .flatMap((cat) => data.products.filter((p) => p.category === cat).slice(0, 2))
    .map((p) => `${clip(p.name, NAME_CHARS)} (${p.category})`)

  return {
    catalogue_available: true,
    matches: scored.map((s) => detail(s.p)),
    also_in_this_category: sameCategory,
    add_ons_to_offer: addOns,
    next: `Describe ${clip(best.name, NAME_CHARS)} in one or two spoken sentences using the material and description above, state the minimum quantity as listed, and never quote a price. Then offer ONE add-on from add_ons_to_offer if it genuinely suits their use, and ask for its quantity if they accept. If the customer wants a variation that is not listed, treat it as a custom item.`,
  }
}
