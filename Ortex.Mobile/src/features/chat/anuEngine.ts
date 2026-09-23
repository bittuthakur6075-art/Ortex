/**
 * Anu's answer to one typed message in Team chat, with NO language model — the
 * phone's port of Ortex.Admin/src/components/chat/anuEngine.js.
 *
 * parseIntent() (domain/anuIntent.ts) decides what was asked; the phone's own
 * collections (collectionStore, under the user's session and RLS) and the
 * database's report functions (migration 0046) supply the facts; anuReply.ts
 * writes the sentence. The lookups are the same pure functions voice Anu uses
 * (domain/anu.ts), so the two can never answer differently.
 */

import { RELEASES } from "@/constants/whatsNew"
import { getCollectionSnapshot, loadCollection } from "@/data/collectionStore"
import type { Collection } from "@/data/repo"
import {
  briefing,
  findCustomers,
  findEnquiries,
  findProducts,
  findQuotations,
  quotationDetail,
  salesSummary,
  type Access,
  type CustomerRow,
  type EnquiryRow,
  type ProductRow,
  type QuotationRow,
} from "@/domain/anu"
import { briefingStats, cardsFrom, summaryStats, type SurfacedCard } from "@/domain/anuConversation"
import { parseIntent, TEAM_TITLES, type TeamKey } from "@/domain/anuIntent"
import {
  briefingReply,
  customersReply,
  enquiriesReply,
  greetReply,
  helpReply,
  NOT_ALLOWED,
  productsReply,
  quotationDetailReply,
  quotationsReply,
  salesReply,
  sendConfirmText,
  unknownReply,
  whatsNewReply,
} from "@/domain/anuReply"
import { canAccess, type Profile } from "@/domain/modules"
import { chat } from "@/lib/chat"

export type AnuStat = { label: string; value: string }
export type AnuAnswer = {
  body: string
  meta?: { cards?: SurfacedCard[]; stats?: AnuStat[] }
  pending?: { team: TeamKey; body: string }
}

async function rows<T>(name: Collection): Promise<T[]> {
  try {
    await loadCollection(name)
  } catch {
    /* the cached copy is better than nothing */
  }
  return getCollectionSnapshot<T>(name).items
}

// Phone help: what a rep does on THIS app, in its own words.
const HELP: { title: string; module: string; steps: string[] }[] = [
  { title: "Create a quotation", module: "quotations", steps: ["Open the Quotes tab and tap the + button.", "Pick the customer, then add each item with its quantity. A product fills its rate, HSN and GST.", "Set the place of supply, then save. Share it on WhatsApp from the quotation page."] },
  { title: "Return a lead or an Anu call", module: "enquiries", steps: ["Open the Leads tab. Enquiries and Anu's voice calls are side by side.", "Open one: the advice at the top says what to ask. Call or WhatsApp from the round buttons.", "Change its status as you go so the team knows."] },
  { title: "Add a customer", module: "customers", steps: ["Open the Customers tab and tap +.", "A name or company, and a phone or email, are needed. A GSTIN must match the state."] },
  { title: "Mark attendance", module: "attendance", steps: ["On Home, slide to check in and scan the QR code on the office screen.", "Out in the field? Check in without a code; the office reviews it.", "A missed check-out is fixed with a correction from the day's page."] },
  { title: "Apply for leave", module: "attendance", steps: ["Open Profile, Leave, and tap Apply.", "Pick the type and dates. An admin approves it and you get a notification."] },
  { title: "See your payslip", module: "payslips", steps: ["Open Profile, My pay. A payslip appears once that month's pay run is marked paid."] },
  { title: "Use Team chat", module: "chat", steps: ["Open the Chat tab. Tap + to message a colleague or make a group.", "Your team's channel is there too: Anu posts the daily update and attendance in it.", "Long-press your own message to delete it for everyone."] },
  { title: "Reach another team", module: "chat", steps: ["Ask Anu in Chat, for example: tell accounts that INV-12 is paid.", "She shows it to you first and sends it under your name when you tap Send. Only admins can post to Everyone."] },
]

function helpFor(topic: string, profile: Profile | null) {
  const words = String(topic || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const visible = HELP.filter((a) => canAccess(profile, a.module as never))
  const scored = visible
    .map((a) => {
      const hay = `${a.title} ${a.steps.join(" ")}`.toLowerCase()
      return { a, score: words.reduce((n, w) => n + (hay.includes(w) ? (a.title.toLowerCase().includes(w) ? 3 : 1) : 0), 0) }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 2)
    .map((x) => x.a)
  return { articles: scored, other_topics: scored.length ? undefined : visible.map((a) => a.title) }
}

async function reportText(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn()
  } catch (e) {
    const m = (e as Error).message || ""
    if (/not in your access/i.test(m)) return NOT_ALLOWED
    return `I couldn't read that: ${m}`
  }
}

export async function answerAnu(text: string, profile: Profile | null, access: Access, now = Date.now()): Promise<AnuAnswer> {
  const it = parseIntent(text)
  const first = (profile?.name || "").trim().split(/\s+/)[0] || ""
  const denied = (what: string) => ({ ok: false, error: `${what} is not in your access. An admin can grant it in Users.` })

  switch (it.intent) {
    case "empty":
      return { body: unknownReply() }
    case "greet":
      return { body: greetReply(first) }
    case "thanks":
      return { body: "Happy to help. Ask me anything else about the business." }

    case "send_team":
      if (it.team === "everyone" && !["admin", "super_admin"].includes(String(profile?.role))) {
        return { body: "Only admins can post to Everyone. Pick a team instead, for example: tell sales that ..." }
      }
      return { body: sendConfirmText(TEAM_TITLES[it.team], it.body), pending: { team: it.team, body: it.body } }

    case "attendance":
      return { body: await reportText(() => chat.attendanceNow(it.team)) }
    case "team_update":
      return { body: await reportText(() => chat.teamUpdate(it.team)) }

    case "whats_new": {
      const r = RELEASES[0]
      return {
        body: whatsNewReply({
          releases: r ? [{ version: r.version, date: r.date, title: r.title, summary: r.summary, items: r.items.map((i) => `${i.kind}: ${i.title}. ${i.detail}`) }] : [],
        }),
      }
    }
    case "help":
      return { body: helpReply(helpFor(it.topic, profile)) }

    case "briefing": {
      if (!access.enquiries && !access.voice && !access.quotations) return { body: NOT_ALLOWED }
      const [enquiries, quotations] = await Promise.all([
        access.enquiries || access.voice ? rows<EnquiryRow>("enquiries") : Promise.resolve([]),
        access.quotations ? rows<QuotationRow>("quotations") : Promise.resolve([]),
      ])
      const b = briefing({ enquiries, quotations }, access, now)
      const lists = b as Record<string, { latest?: unknown[] } & Record<string, unknown[]>>
      const cards = cardsFrom([
        ...(lists.anu_calls_to_return?.latest || []),
        ...(lists.new_enquiries?.latest || []),
        ...(lists.quotations?.expiring_within_3_days || []),
        ...(lists.quotations?.already_expired_but_still_sent || []),
      ])
      return { body: briefingReply(b), meta: { cards: cards.slice(0, 8), stats: briefingStats(b) } }
    }
    case "sales_summary": {
      const [enquiries, quotations] = await Promise.all([
        access.enquiries || access.voice ? rows<EnquiryRow>("enquiries") : Promise.resolve([]),
        access.quotations ? rows<QuotationRow>("quotations") : Promise.resolve([]),
      ])
      const s = salesSummary({ enquiries, quotations }, it.days, access, now)
      return { body: salesReply(s), meta: { stats: summaryStats(s) } }
    }

    case "quotation": {
      if (!access.quotations) return { body: quotationsReply(denied("Quotations")) }
      const all = await rows<QuotationRow>("quotations")
      const out = findQuotations(all, { query: it.query, status: it.status || undefined })
      if (out.total === 1) {
        const q = all.find((x) => x.id === out.results[0].id)
        if (q) {
          const d = quotationDetail(q)
          return { body: quotationDetailReply(d), meta: { cards: cardsFrom(d) } }
        }
      }
      return { body: quotationsReply(out, it), meta: { cards: cardsFrom(out.results) } }
    }
    case "enquiries": {
      if (!access.enquiries && !access.voice) return { body: enquiriesReply(denied("Leads")) }
      const out = findEnquiries(await rows<EnquiryRow>("enquiries"), { query: it.query, status: it.status || undefined, days: it.days || undefined }, access, now)
      return { body: enquiriesReply(out, it), meta: { cards: cardsFrom(out.results) } }
    }
    case "customers": {
      if (!access.customers) return { body: customersReply(denied("Customers"), it.query) }
      const [customers, quotations] = await Promise.all([rows<CustomerRow>("customers"), access.quotations ? rows<QuotationRow>("quotations") : Promise.resolve([])])
      const results = findCustomers(customers, quotations, it.query)
      return { body: customersReply({ results }, it.query), meta: { cards: cardsFrom(results) } }
    }
    case "products": {
      if (!access.products) return { body: productsReply(denied("The catalogue"), it.query) }
      const results = findProducts(await rows<ProductRow>("products"), it.query)
      return { body: productsReply({ results }, it.query), meta: { cards: cardsFrom(results) } }
    }

    default: {
      const q = it.query
      const found: string[] = []
      const cards: SurfacedCard[] = []
      if (access.customers) {
        const results = findCustomers(await rows<CustomerRow>("customers"), [], q)
        if (results.length) { found.push(customersReply({ results }, q)); cards.push(...cardsFrom(results)) }
      }
      if (access.quotations) {
        const out = findQuotations(await rows<QuotationRow>("quotations"), { query: q })
        if (out.total) { found.push(quotationsReply(out, { query: q })); cards.push(...cardsFrom(out.results)) }
      }
      if (access.enquiries || access.voice) {
        const out = findEnquiries(await rows<EnquiryRow>("enquiries"), { query: q }, access, now)
        if (out.total) { found.push(enquiriesReply(out, { query: q })); cards.push(...cardsFrom(out.results)) }
      }
      if (access.products) {
        const results = findProducts(await rows<ProductRow>("products"), q)
        if (results.length) { found.push(productsReply({ results }, q)); cards.push(...cardsFrom(results)) }
      }
      if (!found.length) return { body: unknownReply(q) }
      return { body: found.join("\n\n"), meta: { cards: cards.slice(0, 8) } }
    }
  }
}

export async function postToTeam(team: TeamKey, body: string): Promise<string> {
  try {
    await chat.postToTeam(team, body)
    return `Sent to ${TEAM_TITLES[team]}.`
  } catch (e) {
    return `It did not send: ${(e as Error).message}`
  }
}

export function accessOf(profile: Profile | null): Access {
  return {
    enquiries: canAccess(profile, "enquiries"),
    voice: canAccess(profile, "voice-leads"),
    quotations: canAccess(profile, "quotations"),
    customers: canAccess(profile, "customers"),
    products: canAccess(profile, "products"),
  }
}
