import { repo } from "../../data/store/repository"
import {
  briefing, findCustomers, findEnquiries, findProducts, findQuotations, quotationDetail, salesSummary,
} from "../../lib/anu"

// Anu's READ tools, shared by the voice panel (useAnuSession.js) and the Anu
// thread in Team chat (components/chat/useAssistantChat.js), so the two can
// never answer the same question differently.
//
// Each runs against the console's own collections under the person's own
// session: `access` (built with canAccess) turns a module they lack into a
// plain "not in your access", and RLS underneath means a check forgotten here
// still returns nothing. Writes stay with each caller, because confirming one
// looks different on a call and in a chat.

export const READ_TOOL_NAMES = [
  "get_briefing", "find_customers", "find_enquiries", "find_quotations", "get_quotation", "find_products", "sales_summary",
]

export const accessFor = (canAccess, profile) => ({
  enquiries: canAccess(profile, "enquiries"),
  voice: canAccess(profile, "voice-leads"),
  quotations: canAccess(profile, "quotations"),
  customers: canAccess(profile, "customers"),
  products: canAccess(profile, "products"),
})

export const denied = (what) => ({ ok: false, error: `${what} is not in this person's access. Tell them an admin can grant it in Users.` })

const rows = (name) => repo.list(name)

/**
 * Runs one read tool. Returns `{ response, results, stats }`: `response` goes
 * back to the model, `results` are the records to draw as cards (cardFor), and
 * `stats` a few figures to show under the step. Returns null for a name that is
 * not a read tool.
 */
export async function runReadTool(name, args, a, now = Date.now()) {
  switch (name) {
    case "get_briefing": {
      if (!a.enquiries && !a.voice && !a.quotations) return { response: denied("Leads and quotations") }
      const [enquiries, quotations] = await Promise.all([
        a.enquiries || a.voice ? rows("enquiries") : [],
        a.quotations ? rows("quotations") : [],
      ])
      const b = briefing({ enquiries, quotations }, a, now)
      return {
        response: { ok: true, ...b },
        results: [
          ...(b.anu_calls_to_return?.latest || []),
          ...(b.new_enquiries?.latest || []),
          ...(b.quotations?.expiring_within_3_days || []),
          ...(b.quotations?.already_expired_but_still_sent || []),
        ],
        stats: briefingStats(b),
      }
    }
    case "find_customers": {
      if (!a.customers) return { response: denied("Customers") }
      const [customers, quotations] = await Promise.all([rows("customers"), a.quotations ? rows("quotations") : []])
      const results = findCustomers(customers, quotations, String(args.query || ""))
      return { response: { ok: true, count: results.length, results }, results }
    }
    case "find_enquiries": {
      if (!a.enquiries && !a.voice) return { response: denied("Enquiries") }
      const out = findEnquiries(await rows("enquiries"), { query: args.query, status: args.status, days: Number(args.days) || undefined }, a, now)
      return { response: { ok: true, ...out }, results: out.results }
    }
    case "find_quotations": {
      if (!a.quotations) return { response: denied("Quotations") }
      const out = findQuotations(await rows("quotations"), { query: args.query, status: args.status })
      return { response: { ok: true, ...out }, results: out.results }
    }
    case "get_quotation": {
      if (!a.quotations) return { response: denied("Quotations") }
      const q = (await rows("quotations")).find((x) => x.id === args.id)
      if (!q) return { response: { ok: false, error: "No quotation with that id. Search again with find_quotations." } }
      const detail = quotationDetail(q)
      return { response: { ok: true, ...detail }, results: [detail] }
    }
    case "find_products": {
      if (!a.products) return { response: denied("The product catalogue") }
      const results = findProducts(await rows("products"), String(args.query || ""))
      return { response: { ok: true, count: results.length, results }, results }
    }
    case "sales_summary": {
      const days = Math.min(365, Math.max(1, Number(args.days) || 30))
      const [enquiries, quotations] = await Promise.all([
        a.enquiries || a.voice ? rows("enquiries") : [],
        a.quotations ? rows("quotations") : [],
      ])
      const s = salesSummary({ enquiries, quotations }, days, a, now)
      return { response: { ok: true, ...s }, stats: summaryStats(s) }
    }
    default:
      return null
  }
}

// Figures drawn as a small stat row under a step, so a summary is also readable at a glance.
export function briefingStats(b) {
  const out = []
  if (b.new_enquiries) out.push({ label: "New enquiries", value: String(b.new_enquiries.count) })
  if (b.anu_calls_to_return) out.push({ label: "Calls to return", value: String(b.anu_calls_to_return.count) })
  if (b.quotations) out.push({ label: "Open pipeline", value: b.quotations.open_pipeline_value })
  return out
}

export function summaryStats(s) {
  const out = []
  if (s.quoted_value) out.push({ label: "Quoted", value: s.quoted_value })
  if (s.won_value) out.push({ label: "Won", value: s.won_value })
  if (s.win_rate) out.push({ label: "Win rate", value: s.win_rate })
  if (s.website_enquiries !== undefined) out.push({ label: "Enquiries", value: String(s.website_enquiries) })
  if (s.anu_calls !== undefined) out.push({ label: "Anu calls", value: String(s.anu_calls) })
  return out.slice(0, 4)
}
