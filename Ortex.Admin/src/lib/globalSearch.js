// Global search (Ctrl/⌘ K) over every record a person might be holding in their
// head: half a company name, a quotation number, the last digits of a phone, a
// product SKU, or what a caller asked Anu for. The console's port of the phone's
// `features/search/GlobalSearchScreen.tsx`, with the same groups plus invoices.
//
// Two steps, so typing stays fast on a few thousand rows:
//   buildSearchIndex(data, can)  once per data/profile change: one lower-cased
//                                haystack per record, access-gated up front
//   searchIndex(index, query)    per keystroke: scoring over those strings only
//
// Every hit carries `to` + `state`, the route that opens the RECORD itself, not
// the list it lives in.

import { VOICE_SOURCE } from "../pages/voice-leads/helpers"
import { voiceCalls } from "./analytics/today"

export const MAX_PER_GROUP = 5
export const MIN_QUERY = 2

const lc = (v) => String(v ?? "").toLowerCase().trim()
const join = (...parts) => parts.filter(Boolean).join(" · ")

// Digits a phone is matched on: +91, a trunk 0, spaces and dashes all dropped,
// so "98765 43210", "+919876543210" and "09876543210" are the same number.
export function phoneDigits(phone) {
  const d = String(phone ?? "").replace(/\D/g, "")
  if (d.length === 12 && d.startsWith("91")) return d.slice(2)
  if (d.length === 11 && d.startsWith("0")) return d.slice(1)
  return d
}

// Query digits, with the same prefixes stripped, so a pasted "+91 98765…" still
// matches a stored bare ten-digit number.
function queryDigits(q) {
  if (/[a-z]/i.test(q)) return ""
  const d = String(q).replace(/\D/g, "")
  if (/^\s*\+\s*91/.test(q) || (d.length > 10 && d.startsWith("91"))) return d.slice(2)
  if (d.startsWith("0")) return d.slice(1)
  return d
}

// 3 = a field starts with the needle, 2 = a word does, 1 = anywhere, 0 = no hit.
function scoreText(fields, needle) {
  let best = 0
  for (const f of fields) {
    if (!f) continue
    if (f.startsWith(needle)) return 3
    if (best < 2 && (f.includes(` ${needle}`) || f.includes(`-${needle}`) || f.includes(`/${needle}`))) best = 2
    else if (best < 1 && f.includes(needle)) best = 1
  }
  return best
}

function entry(kind, rec, fields, phones, hit) {
  return {
    kind,
    fields: fields.map(lc).filter(Boolean),
    phones: phones.map(phoneDigits).filter(Boolean),
    sortKey: String(rec.updatedAt || rec.createdAt || rec.endedAt || ""),
    hit: { kind, id: `${kind}-${rec.id}`, ...hit },
  }
}

export const GROUPS = [
  { kind: "customer", label: "Customers", module: "customers" },
  { kind: "enquiry", label: "Enquiries", module: "enquiries" },
  { kind: "voice", label: "Voice calls", module: "voice-leads" },
  { kind: "quotation", label: "Quotations", module: "quotations" },
  { kind: "invoice", label: "Invoices", module: "invoices" },
  { kind: "product", label: "Products", module: "products" },
]

/**
 * @param data  { customers, enquiries, quotations, invoices, products }
 * @param can   (moduleKey) => boolean, normally canAccess bound to the profile
 */
export function buildSearchIndex(data = {}, can = () => true) {
  const out = []

  if (can("customers")) {
    for (const c of data.customers || []) {
      out.push(entry("customer", c, [c.name, c.company, c.email, c.gstin, c.address], [c.phone], {
        title: c.company || c.name || "Unnamed customer",
        meta: join(c.company && c.name && c.company !== c.name ? c.name : "", c.phone || c.email),
        to: `/customers/${c.id}`,
      }))
    }
  }

  const enquiries = data.enquiries || []
  if (can("enquiries")) {
    for (const e of enquiries) {
      if (e.source === VOICE_SOURCE) continue
      const cu = e.customer || {}
      out.push(entry("enquiry", e, [cu.name, cu.company, cu.email, e.reference, e.productInterest, e.message, e.source], [cu.phone], {
        title: cu.name || cu.company || "Unnamed enquiry",
        meta: join(e.productInterest, e.status),
        to: `/enquiries/${e.id}`,
      }))
    }
  }

  if (can("voice-leads")) {
    for (const call of voiceCalls(enquiries)) {
      const cu = call.customer || {}
      // Every capture's items and summary, so a product dropped from the final
      // order is still findable by what the caller said.
      const said = call.rows.flatMap((r) => [r.summary, r.productInterest, r.reference, ...(r.itemsList || []).map((i) => i.product)])
      out.push(entry("voice", { ...call, updatedAt: call.endedAt }, [cu.name, cu.company, cu.email, call.reference, ...said], call.rows.map((r) => r.customer?.phone), {
        title: call.name || "Unnamed caller",
        meta: join(call.itemsList.map((i) => i.product).join(", ") || call.productInterest, call.status),
        to: "/crm?tab=voice",
        state: { openId: call.id },
      }))
    }
  }

  const docs = (kind, list, to) => {
    for (const d of list || []) {
      const cu = d.customer || {}
      out.push(entry(kind, d, [d.number, d.reference, cu.name, cu.company, cu.email, cu.gstin], [cu.phone], {
        title: d.number || "Draft",
        meta: join(cu.company || cu.name, d.status),
        to,
        state: { openId: d.id },
      }))
    }
  }
  if (can("quotations")) docs("quotation", data.quotations, "/quotations")
  if (can("invoices")) docs("invoice", data.invoices, "/billing?tab=invoices")

  if (can("products")) {
    for (const p of data.products || []) {
      const status = p.status || "active"
      if (status !== "active" && status !== "draft") continue
      out.push(entry("product", p, [p.name, p.sku, p.hsn, p.category, p.material], [], {
        title: p.name || "Unnamed product",
        meta: join(p.sku, p.category, status === "draft" ? "draft" : ""),
        to: "/catalog?tab=products",
        state: { openId: p.id },
      }))
    }
  }

  return out
}

/** Grouped hits for a query: [{ kind, label, items: [hit] }], empty below MIN_QUERY. */
export function searchIndex(index, query, max = MAX_PER_GROUP) {
  const needle = lc(query)
  if (needle.length < MIN_QUERY) return []
  const digits = queryDigits(needle)

  const buckets = new Map()
  for (const e of index) {
    let s = scoreText(e.fields, needle)
    if (digits.length >= 3 && e.phones.some((p) => p.includes(digits))) s = Math.max(s, phoneScore(e.phones, digits))
    if (!s) continue
    if (!buckets.has(e.kind)) buckets.set(e.kind, [])
    buckets.get(e.kind).push({ e, s })
  }

  return GROUPS.filter((g) => buckets.has(g.kind)).map((g) => ({
    kind: g.kind,
    label: g.label,
    items: buckets
      .get(g.kind)
      .sort((a, b) => b.s - a.s || (a.e.sortKey < b.e.sortKey ? 1 : a.e.sortKey > b.e.sortKey ? -1 : 0))
      .slice(0, max)
      .map((x) => x.e.hit),
  }))
}

// A number that starts with the typed digits ranks above one that merely contains them.
const phoneScore = (phones, digits) => (phones.some((p) => p.startsWith(digits)) ? 3 : 1)
