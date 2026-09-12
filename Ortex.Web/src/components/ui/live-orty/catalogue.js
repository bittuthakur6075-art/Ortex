import { supabase, hasSupabase } from "../../../lib/supabaseClient"

// ---- The live catalogue, as Anu sees it ------------------------------------
//
// Anu's prompt carries the general range Ortex makes, but the real list lives
// in the console. This reads the PUBLIC views (migration 0020: `products_public`
// / `categories_public`, which expose an allow-list of fields and never price,
// cost, HSN or GST), so a product added or edited in the console reaches the
// next call with no code change.
//
// Three levels, so the prompt stays small as the catalogue grows: a compact
// index of everything goes into the system instruction, `lookup_product`
// returns the full briefing for one product on demand along with what to offer
// next to it, and anything the console does not list is answered from the
// STANDARD RANGE below rather than being pushed away as an exotic custom job.
//
// Everything here is DERIVED from what the console holds or from what the
// factory actually does (the capability list in prompt.js). Nothing invents a
// size, a price or a certification, and a material that is only guessed is
// handed to Anu marked as unconfirmed, so she says the team will confirm it.

// Re-read per call, so a product an admin adds or edits in the console is
// described on the very next call. The window only stops a retried connection
// fetching twice within the same minute; a long call revalidates in the
// background (see `revalidate`), so a product added mid-call is still found.
const FRESH_MS = 60 * 1000
// Guardrails for the system instruction: a few hundred products must not turn
// into a prompt Anu has to wade through before she can speak.
const MAX_INDEX_PRODUCTS = 120
// While the catalogue is small, every product carries a one-line hook in the
// index too, so Anu can brief a caller properly without a lookup round trip.
// Past this count the index falls back to names and facts only.
const MAX_INDEX_WITH_HOOKS = 30
const NAME_CHARS = 90
const INTRO_CHARS = 160
const HOOK_CHARS = 130
const DESCRIPTION_CHARS = 700

// ---- Product names arrive dirty --------------------------------------------
// Products imported or pasted from a marketplace listing carry the page's own
// furniture in the name ("Get More Photos Interested in this product? Get Best
// Quote ..."). Anu reads the name out loud, so it is stripped here rather than
// waiting for the console data to be cleaned.
const NAME_NOISE = [
  /get\s+more\s+photos?/gi,
  /interested\s+in\s+this\s+product\s*\??/gi,
  /get\s+(?:best|latest)\s+(?:quote|price)/gi,
  /ask\s+(?:for\s+)?price/gi,
  /(?:view|see)\s+more\s+details?/gi,
  /send\s+(?:inquiry|enquiry)/gi,
  /request\s+(?:a\s+)?call\s*back/gi,
  /minimum\s+order\s+quantity/gi,
  /click\s+to\s+(?:view|zoom)/gi,
  /\bapprox(?:imately)?\s+price\b/gi,
]

const cleanName = (v) => {
  let s = String(v ?? "").replace(/\s+/g, " ")
  for (const re of NAME_NOISE) s = s.replace(re, " ")
  return s.replace(/\s+/g, " ").replace(/^[\s\-:,.|]+|[\s\-:,.|]+$/g, "").trim()
}

const clip = (v, max) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
const norm = (v) => String(v ?? "").toLowerCase()

// ---- What Ortex can do to a material ---------------------------------------
// The decoration methods are the factory's own, listed in prompt.js (laser
// cutting and engraving, CNC routing, UV printing, dye sublimation, hot
// stamping). Matched on the product's own words, so "Stainless Steel ... Bottle"
// yields steel from the NAME, which is quotable as fact; a family found only in
// the description is returned as unconfirmed.
// Order matters: an explicitly named material wins over the generic ones.
const MATERIAL_FAMILIES = [
  {
    key: "steel",
    label: "stainless steel",
    match: /\b(stainless|steel|inox|vacuum[\s-]?insulated)\b/i,
    customisation: "laser engraving for a permanent mark, UV and pad printing for a full-colour logo, matte, mirror or powder-coated finishes, and a choice of lid and cap styles",
  },
  {
    key: "acrylic",
    label: "acrylic",
    match: /\b(acrylic|perspex|plexi(?:glass)?)\b/i,
    customisation: "laser cutting to any shape at all, laser engraving, full-colour UV printing, and clear, frosted, mirror or coloured sheet with the logo printed behind the face for depth",
  },
  {
    key: "mdf",
    label: "MDF and engineered wood",
    match: /\b(mdf|wood|wooden|plywood|timber)\b/i,
    customisation: "CNC routing to a custom shape, laser engraving into the grain, full-colour UV printing, and natural, stained or painted finishes",
  },
  {
    key: "plastic",
    label: "plastic, PVC and silicone",
    match: /\b(plastic|pvc|silicone|polypropylene|acrylonitrile|abs|polycarbonate)\b/i,
    customisation: "moulding to a custom shape, screen and pad printing, UV printing, soft-PVC moulded logos with a raised 3D effect, and colour matching of the body itself",
  },
  {
    key: "textile",
    label: "fabric and polyester",
    match: /\b(satin|polyester|fabric|nylon|lanyard|ribbon|cloth|cotton|woven)\b/i,
    customisation: "full-colour dye sublimation edge to edge, screen printing, woven logos, and a choice of hooks, clips, badge holders and safety breakaways",
  },
  {
    key: "paper",
    label: "paper and board",
    match: /\b(paper|notebook|diary|note ?pad|card ?board)\b/i,
    customisation: "offset and UV printing, foil hot-stamping, embossing and debossing, plus custom covers and page layouts",
  },
  {
    key: "metal",
    label: "metal",
    match: /\b(metal|brass|zinc|alloy|enamel|gold[\s-]?tone|silver[\s-]?tone|electroplat|die[\s-]?cast)\b/i,
    customisation: "die-struck or die-cast shapes, soft and hard enamel colour fill, electroplating in gold, silver, nickel or antique, and magnet, butterfly or safety-pin backs",
  },
]

const familyFor = (text) => MATERIAL_FAMILIES.find((f) => f.match.test(String(text ?? "")))

// Words that name a FITTING rather than the product's own material. Left in,
// "multiple sturdy metal hooks" in a description turns a printed wooden key
// holder into a metal one.
const FITTING_WORDS = /\b(?:metal|steel|brass|plastic|nylon)\s+(?:hook|hooks|clip|clips|clasp|ring|rings|chain|chains|lid|lids|cap|caps|screw|screws|hinge|hinges|zip|zipper|buckle)\b/gi

/**
 * The material to speak, and whether it is safe to state as fact.
 * `confirmed` means the console recorded it, or the product's own name says it.
 * A set is deliberately left unconfirmed: it is several materials, and naming
 * one of them as "the" material is how a caller is told something untrue.
 */
function materialOf(p) {
  const recorded = clip(p.material, 60)
  if (recorded) return { text: recorded, confirmed: true, family: familyFor(`${recorded} ${p.name}`) }
  const name = cleanName(p.name)
  const isSet = kindOf(p) === "giftset" || /\b(set|combo|kit|hamper)\b/i.test(name)
  const fromName = familyFor(name)
  if (fromName && !isSet) return { text: fromName.label, confirmed: true, family: fromName }
  const fromDesc = familyFor(String(p.description ?? "").replace(FITTING_WORDS, " "))
  const guess = fromName || fromDesc
  if (isSet) {
    return {
      text: guess ? `a set of several materials, mainly ${guess.label}` : "a set of several materials",
      confirmed: false,
      family: guess || null,
    }
  }
  if (fromDesc) return { text: fromDesc.label, confirmed: false, family: fromDesc }
  return { text: "", confirmed: false, family: null }
}

// ---- What a product IS, regardless of how it was filed ---------------------
// The console's `category` is unreliable in practice (steel lunch boxes have
// been filed under "MDF products"), and add-ons chosen from a wrong category
// offer a tiffin set alongside an acrylic keychain. So the kind is read from
// the product's own name, and the category is only the fallback.
const KINDS = [
  { key: "lunchbox", label: "lunch box sets", match: /\b(lunch ?box|tiffin|casserole|food container)\b/i },
  { key: "drinkware", label: "bottles and tumblers", match: /\b(bottle|flask|tumbler|sipper|mug|cup|thermos)\b/i },
  { key: "giftset", label: "corporate gift sets", match: /\b(gift ?set|combo|hamper|gift pack)\b/i },
  { key: "keychain", label: "keychains", match: /\b(key ?chain|key ?ring|key ?fob)\b/i },
  { key: "keyholder", label: "wall key holders", match: /\b(key ?holder|key ?hanger|key ?stand)\b/i },
  { key: "badge", label: "badges and lapel pins", match: /\b(badge|lapel ?pin|brooch)\b/i },
  { key: "lanyard", label: "lanyards and ID card accessories", match: /\b(lanyard|id ?card|card ?holder|neck ?strap)\b/i },
  { key: "trophy", label: "trophies and awards", match: /\b(trophy|trophies|award|medal|momento|memento|shield|plaque)\b/i },
  { key: "standee", label: "desk standees and name plates", match: /\b(standee|name ?plate|desk ?plate)\b/i },
  { key: "magnet", label: "fridge magnets", match: /\b(fridge ?magnet|magnet)\b/i },
  { key: "clock", label: "wall clocks", match: /\b(clock)\b/i },
  { key: "board", label: "examination boards and clipboards", match: /\b(exam(?:ination)? ?(?:board|pad)|clip ?board|writing ?pad)\b/i },
  { key: "stationery", label: "diaries, notebooks and pens", match: /\b(diary|diaries|notebook|pen set|note ?pad)\b/i },
  { key: "frame", label: "photo frames", match: /\b(photo ?frame|picture ?frame)\b/i },
  { key: "idol", label: "idols and dashboard pieces", match: /\b(idol|ganesh|ganesha|dashboard|statue)\b/i },
  { key: "apparel", label: "caps, T-shirts and wristbands", match: /\b(cap|t[\s-]?shirt|wrist ?band|hoodie|jersey)\b/i },
  { key: "signage", label: "flags and banners", match: /\b(flag|banner|roll ?up)\b/i },
]

const kindOf = (p) => KINDS.find((k) => k.match.test(cleanName(p.name)))?.key || ""

// The kind regexes are singular phrases, and a caller says "lanyards" or
// "trophies". Test against a singularised copy of the text too, because \b
// stops `lanyard` matching inside `lanyards`.
// Gentler than `stem`, which is built for scoring and happily turns "frames"
// into "fram". Here the result has to stay a real word, because it is matched
// against phrases like "photo frame".
const depluralise = (t) => (t.endsWith("ies") ? `${t.slice(0, -3)}y` : /(?:ss|us|is)$/.test(t) ? t : t.endsWith("es") && /(?:ch|sh|x|z|s)es$/.test(t) ? t.slice(0, -2) : t.endsWith("s") ? t.slice(0, -1) : t)
const singularised = (v) => norm(v).split(/([^a-z0-9]+)/).map((part) => (/[a-z]/.test(part) ? depluralise(part) : part)).join("")
const matchesKind = (key, text) => {
  const re = KINDS.find((k) => k.key === key)?.match
  if (!re) return false
  return re.test(String(text ?? "")) || re.test(singularised(text))
}

// What genuinely belongs next to what, by kind. A sales person offers the thing
// that completes the order, not the next row in the same category.
const KIND_AFFINITY = {
  lanyard: ["badge", "standee", "stationery"],
  badge: ["lanyard", "trophy", "standee"],
  keychain: ["magnet", "badge", "giftset"],
  keyholder: ["frame", "idol", "magnet"],
  trophy: ["standee", "badge", "frame"],
  standee: ["trophy", "badge", "stationery"],
  magnet: ["keychain", "frame"],
  clock: ["standee", "magnet", "frame"],
  board: ["lanyard", "badge", "stationery"],
  stationery: ["drinkware", "keychain", "giftset"],
  drinkware: ["stationery", "giftset", "lunchbox"],
  lunchbox: ["drinkware", "giftset"],
  giftset: ["drinkware", "stationery", "keychain"],
  frame: ["keyholder", "idol", "clock"],
  idol: ["frame", "keyholder"],
  apparel: ["signage", "keychain"],
  signage: ["apparel", "standee"],
}

// Fallback when a product's kind cannot be read from its name: what is worth
// offering alongside a category, by category name.
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

// ---- The standard range, for what the console has not listed yet ------------
// Mirrors the "WHAT ORTEX MAKES" block in prompt.js. These are everyday Ortex
// products with known minimums: when the console does not list one (the
// catalogue is still being filled), the answer is a confident made-to-order
// quote, NOT "this is an exotic custom job and the team will confirm a
// minimum". Keep this table and prompt.js in step.
const STANDARD_RANGE = [
  { kind: "keychain", name: "Custom keychains", moq: "50 to 200 depending on the material", materials: "acrylic, leather, metal, wooden, silicone, soft PVC and satin", note: "any custom shape with the logo" },
  { kind: "lanyard", name: "Lanyards and ID card holders", moq: "100", materials: "full-colour sublimation polyester and satin, with acrylic or PVC ID card holders", note: "hooks, clips and safety breakaways to choice" },
  { kind: "badge", name: "Badges", moq: "50 to 200", materials: "metal name badges with magnet, plastic pin badges, button badges and LED badges", note: "" },
  { kind: "trophy", name: "Trophies and awards", moq: "50 to 100 in MDF, 25 to 50 in acrylic", materials: "MDF and acrylic", note: "custom shapes and engraved titles" },
  { kind: "standee", name: "Acrylic desk standees and name holders", moq: "25 to 50", materials: "acrylic", note: "also paperweights and dashboard idols" },
  { kind: "board", name: "Examination boards and clipboards", moq: "25 to 50", materials: "MDF and acrylic", note: "for schools and institutions" },
  { kind: "magnet", name: "Fridge magnets", moq: "100 to 200", materials: "MDF, acrylic, PVC and wood", note: "custom shapes" },
  { kind: "clock", name: "Promotional wall clocks", moq: "10 to 25", materials: "round, square, designer, wooden and acrylic", note: "" },
  { kind: "stationery", name: "Diary and pen sets", moq: "25", materials: "paper and board with metal pens", note: "often paired into a gift set" },
  { kind: "drinkware", name: "Insulated steel bottles, mugs and tumblers", moq: "25", materials: "stainless steel", note: "" },
  { kind: "giftset", name: "Corporate gift sets", moq: "25", materials: "bottles, diaries, pens and keychains combined", note: "one quotation, one dispatch" },
  { kind: "frame", name: "Photo frames", moq: "25 to 50", materials: "acrylic and MDF", note: "" },
  { kind: "apparel", name: "Promotional merchandise", moq: "confirmed by the team for apparel", materials: "caps, T-shirts, wristbands, popsockets and epoxy dome stickers", note: "" },
  { kind: "signage", name: "Flags and banners", moq: "confirmed by the team", materials: "fabric and vinyl", note: "" },
]

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

// How many of a customer's own words a candidate has to account for, so one
// shared generic noun is not a match on its own.
const overlap = (terms, text) => {
  const tokens = words(text)
  return terms.filter((t) => tokens.includes(t) || (t.length >= 4 && tokens.some((k) => k.startsWith(t) || t.startsWith(k)))).length
}

let cache = null
let inFlight = null

async function read() {
  const [cats, prods] = await Promise.all([
    supabase.from("categories_public").select("doc"),
    supabase.from("products_public").select("doc").limit(500),
  ])
  if (cats.error) throw cats.error
  if (prods.error) throw prods.error
  const categories = (cats.data || []).map((r) => r.doc).filter((c) => c?.name && c.active !== false)
  // Absent status means active, matching the console and the phone. Names are
  // cleaned here, once, so every consumer sees the speakable name.
  const products = (prods.data || [])
    .map((r) => r.doc)
    .filter((p) => p?.name && (!p.status || p.status === "active"))
    .map((p) => ({ ...p, name: cleanName(p.name) }))
    .filter((p) => p.name)
  return { categories, products }
}

/** Read the public catalogue. Returns null when it cannot be read. */
export async function loadCatalogue() {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache
  if (!hasSupabase) return null
  try {
    const fresh = await read()
    if (!fresh.products.length) return null
    // Mutate in place when we already have an object, because a live session
    // holds a reference to it for the whole call.
    if (cache) Object.assign(cache, fresh, { at: Date.now() })
    else cache = { at: Date.now(), ...fresh }
    return cache
  } catch (err) {
    console.warn("Live catalogue unavailable for Anu:", err?.message || err)
    return null
  }
}

/**
 * Refresh in the background, without making the caller wait. Called from
 * `lookupProduct`, so a call that runs for twenty minutes still finds a product
 * an admin added five minutes ago. The cache object is mutated in place, so the
 * session's own reference sees the new products.
 */
function revalidate() {
  if (!hasSupabase || !cache || inFlight) return
  if (Date.now() - cache.at < FRESH_MS) return
  inFlight = read()
    .then((fresh) => {
      if (fresh.products.length) Object.assign(cache, fresh, { at: Date.now() })
    })
    .catch(() => { /* keep serving the copy we already have */ })
    .finally(() => { inFlight = null })
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
  const withHooks = data.products.length <= MAX_INDEX_WITH_HOOKS
  const lines = [
    "",
    "# THE LIVE CATALOGUE (read from the Ortex console at the start of this call)",
    `This is what Ortex has listed in its console right now: ${data.products.length} products in ${byCategory.size} categories. For any product named here it is the truth about the name, material, minimum quantity and dispatch time, and it overrides the general range above wherever the two disagree. Call lookup_product before you describe, recommend or take an order for any item: it returns the full briefing, the customisation options for that material, and the add-ons worth offering.`,
    "IMPORTANT: this list is what has been ENTERED so far, not the limit of what Ortex makes. The console is still being filled, so an everyday Ortex product such as lanyards, trophies, clipboards or fridge magnets can be missing from it while the factory makes it every week. lookup_product tells you which case you are in: a listed product, a standard made-to-order product with a known minimum, or a genuinely new custom run. Never tell a customer that Ortex does not make something.",
  ]
  let shown = 0
  for (const [category, list] of byCategory) {
    const intro = data.categories.find((c) => c.name === category)?.intro
    lines.push(`## ${category}${intro ? ` (${clip(intro, INTRO_CHARS)})` : ""}`)
    for (const p of list) {
      if (shown >= MAX_INDEX_PRODUCTS) break
      const mat = materialOf(p)
      const facts = [
        p.moq ? `min ${p.moq} ${p.unit || "pcs"}` : "",
        mat.text ? (mat.confirmed ? mat.text : `likely ${mat.text}, confirm`) : "material not recorded",
        p.leadTimeDays ? `${p.leadTimeDays} day dispatch` : "",
      ].filter(Boolean).join(", ")
      lines.push(`- ${clip(p.name, NAME_CHARS)}${facts ? ` (${facts})` : ""}`)
      if (withHooks && p.description) lines.push(`  ${clip(p.description, HOOK_CHARS)}`)
      shown += 1
    }
  }
  if (shown < data.products.length) {
    lines.push(`(${data.products.length - shown} more products are listed; use lookup_product to find them by name.)`)
  }
  // Categories with nothing in them are a console housekeeping artefact (a test
  // category, or one whose products are all archived). Anu must not offer them
  // as though they were a range she can sell from.
  const empty = data.categories.filter((c) => !byCategory.has(c.name)).map((c) => c.name)
  if (empty.length) {
    lines.push("", `Categories that exist in the console but have NO products listed yet: ${empty.join(", ")}. Do not offer these as a range of their own; if a customer asks for something in one of them, look it up and treat it as made to order.`)
  }
  lines.push(
    "",
    "# MATERIALS AND CUSTOMISATION OPTIONS (the factory's own capabilities)",
    `Whatever the product, Ortex works in ${MATERIAL_FAMILIES.map((f) => f.label).join(", ")}. Per material: ${MATERIAL_FAMILIES.map((f) => `${f.label}: ${f.customisation}`).join(". ")}.`,
    "Every lookup_product reply carries the customisation options for that product's own material. Use them to answer how the logo will be applied, what shapes are possible and whether brand colours can be matched, and to offer a better finish. Never invent a method that is not in this list, and never state a size, weight, thickness or certification: the team confirms those in the quotation.",
  )
  return lines.join("\n")
}

function detail(p) {
  const mat = materialOf(p)
  return {
    name: clip(p.name, NAME_CHARS),
    listed_in_catalogue: true,
    category: p.category || "",
    kind: kindOf(p),
    material: mat.text || "not recorded in the catalogue",
    material_confirmed: mat.confirmed,
    material_note: mat.confirmed
      ? ""
      : mat.text
        ? `The material was NOT recorded for this product, and "${mat.text}" is only inferred from its description. Do not state it as fact: say the team will confirm the exact material in the quotation.`
        : "The material was not recorded for this product. Do NOT guess one. Describe what it is and what it is used for, and say the team will confirm the exact material and finish in the quotation.",
    customisation_options: mat.family?.customisation || "laser engraving, UV printing and custom shaping, with the exact options confirmed by the team for this material",
    minimum_order: p.moq || "not set, so the team will confirm it",
    unit: p.unit || "pcs",
    dispatch_days: p.leadTimeDays || "",
    description: clip(p.description, DESCRIPTION_CHARS),
  }
}

/**
 * The standard-range entries a query points at.
 *
 * Matched on the KIND phrase, not on loose shared words: scoring the whole
 * entry as a bag of words answered "wedding invitation cards in acrylic" with
 * "Lanyards and ID card holders", on `card` and `acrylic`. The kind regexes are
 * phrases ("id card", "clip board"), so they separate the two. The materials
 * only rank the hits that already agree on what the thing is.
 */
function standardMatches(terms, query) {
  return STANDARD_RANGE
    .filter((s) => matchesKind(s.kind, query))
    .map((s) => ({ s, strong: 1 + overlap(terms, `${s.name} ${s.materials} ${s.note}`) }))
    .sort((a, b) => b.strong - a.strong)
    .slice(0, 2)
    .map((x) => ({
      name: x.s.name,
      listed_in_catalogue: false,
      standard_ortex_product: true,
      materials: x.s.materials,
      customisation_options: familyFor(x.s.materials)?.customisation || "laser engraving, UV printing and custom shaping",
      minimum_order: x.s.moq,
      note: x.s.note,
    }))
}

/**
 * Products worth naming as the nearest thing Ortex already lists. Scored on the
 * NAME and material only: the console's categories are unreliable, so scoring
 * them offered steel lunch boxes as the nearest thing to an "MDF trophy", and
 * the description offered a plastic lunch box for a "clipboard" (on "clips").
 */
function closest(products, terms) {
  return products
    .map((p) => ({ p, strong: overlap(terms, `${p.name} ${clip(p.material, 60) || materialOf(p).family?.label || ""}`) }))
    .filter((x) => x.strong > 0)
    .sort((a, b) => b.strong - a.strong)
    .slice(0, 3)
    .map((x) => `${clip(x.p.name, NAME_CHARS)} (${x.p.category || "uncategorised"})`)
}

/** Add-ons chosen by what the product IS, falling back to its category. */
function addOnsFor(best, products) {
  const kind = kindOf(best)
  const out = []
  if (kind) {
    for (const want of KIND_AFFINITY[kind] || []) {
      for (const p of products) {
        if (p.name === best.name || kindOf(p) !== want) continue
        out.push(`${clip(p.name, NAME_CHARS)} (${KINDS.find((k) => k.key === want)?.label || p.category || ""})`)
        break
      }
    }
  }
  if (out.length) return out.slice(0, 3)
  // No sibling of a complementary kind is listed. Offer the standard range
  // instead, so the suggestion is still something Ortex genuinely sells.
  const fromRange = (KIND_AFFINITY[kind] || [])
    .map((want) => STANDARD_RANGE.find((s) => s.kind === want))
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => `${s.name} (made to order, minimum ${s.moq})`)
  if (fromRange.length) return fromRange
  return (AFFINITY[best.category] || [])
    .flatMap((cat) => products.filter((p) => p.category === cat && p.name !== best.name).slice(0, 1))
    .map((p) => `${clip(p.name, NAME_CHARS)} (${p.category})`)
}

/**
 * One product, with what to say next to it.
 *
 * Three outcomes, and none of them is a refusal:
 *  - `matches` non-empty: Ortex lists it. Brief from the entry.
 *  - `matches` empty with `standard_range`: an everyday Ortex product that is
 *    simply not entered in the console yet. Sell it with the known minimum.
 *  - both empty: a genuinely new run. Sell the factory, then capture it.
 */
export function lookupProduct(data, query) {
  if (!data?.products?.length) {
    return {
      catalogue_available: false,
      matches: [],
      next: "The live catalogue could not be read on this call. Describe only the general range in your instructions, never invent a material, size or minimum, and tell the customer the team will confirm the exact minimum and dispatch time in the quotation.",
    }
  }
  revalidate()
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
    const standard = standardMatches(terms, query)
    const nearest = closest(data.products, terms)
    if (standard.length) {
      const lead = standard[0]
      return {
        catalogue_available: true,
        matches: [],
        is_custom: false,
        made_to_order: true,
        standard_range: standard,
        also_listed_and_close: nearest,
        next: `${lead.name} is an everyday Ortex product, made to order in the factory. It is simply not entered in the console list yet, so treat it as completely normal and sell it with confidence. Describe it using the materials and customisation options above, state the minimum as "${lead.minimum_order}", and give the usual dispatch window of 4 to 12 working days after mockup approval. Do NOT call it custom or unusual, do NOT say Ortex does not have it, and never quote a price. Ask which material or finish they want, then the quantity. Save it with capture_lead with a clear product description, and leave custom as false, because it is a standard product.`,
      }
    }
    return {
      catalogue_available: true,
      matches: [],
      is_custom: true,
      made_to_order: true,
      closest_we_make: nearest,
      categories_we_list: [...new Set(data.products.map((p) => p.category).filter(Boolean))],
      materials_we_work_in: MATERIAL_FAMILIES.map((f) => f.label),
      customisation_methods: MATERIAL_FAMILIES.map((f) => `${f.label}: ${f.customisation}`),
      ask: ["which material or finish they have in mind", "the size, roughly", "the quantity", "how the branding should appear, printed, engraved or moulded", "when they need it"],
      next: "This exact item is not in the list, so it is a made-to-order run, which is Ortex's core business and most of what the factory does. Do NOT refuse, do NOT say Ortex does not make it, and do NOT substitute a listed product for it. Sell it: say Ortex manufactures to the customer's own design in its own factory, name the material family that fits what they described from materials_we_work_in, and mention the matching method from customisation_methods so they hear real capability. Then work through the `ask` list, one question at a time. If something in closest_we_make is genuinely similar, offer it as an option they could also consider, never as a replacement for what they asked for. Be honest about the limits: the team confirms feasibility, the exact minimum, the material and the price in the quotation, so do not guess any of those. Save it with capture_lead as an item with custom=true and a clear description of what they asked for.",
    }
  }

  const best = scored[0].p
  const bestKind = kindOf(best)
  const mat = materialOf(best)
  return {
    catalogue_available: true,
    matches: scored.map((s) => detail(s.p)),
    same_product_other_options: bestKind
      ? data.products.filter((p) => p.name !== best.name && kindOf(p) === bestKind).slice(0, 3).map((p) => clip(p.name, NAME_CHARS))
      : [],
    also_in_this_category: data.products
      .filter((p) => p.category === best.category && p.name !== best.name)
      .slice(0, 4)
      .map((p) => clip(p.name, NAME_CHARS)),
    add_ons_to_offer: addOnsFor(best, data.products),
    variations_we_can_make: `Ortex can vary the shape, size, colour and branding of this. For this material: ${mat.family?.customisation || "the team will confirm the options"}. A variation that is not listed is still a normal order: capture it in the item notes and let the team confirm feasibility and the minimum.`,
    next: `Describe ${clip(best.name, NAME_CHARS)} in one or two spoken sentences, using its description and ${mat.confirmed && mat.text ? `its material (${mat.text})` : "what it is used for rather than a material, because the material is not recorded for it"}, then say why it suits their purpose. State the minimum quantity exactly as listed and never quote a price. If they ask how the logo goes on it, answer from customisation_options. Then offer ONE add-on from add_ons_to_offer if it genuinely suits their use, and ask for its quantity if they accept. If they want a variation or a different material, that is still a normal order: capture it in the item notes.`,
  }
}

/**
 * How an item the customer agreed to should be filed, without trusting Anu's
 * own flag. "listed" is in the catalogue, "standard" is an everyday Ortex
 * product that is not entered yet, "custom" is a genuinely new run.
 */
export function classifyItem(data, product) {
  const r = lookupProduct(data, String(product || ""))
  if (r.matches?.length) return "listed"
  if (r.standard_range?.length) return "standard"
  return "custom"
}
