import { supabase } from "../../data/store/supabaseClient"
import { cardFor } from "../../lib/anu"
import { parseIntent, TEAM_TITLES } from "../../lib/anuIntent"
import {
  briefingReply, customersReply, enquiriesReply, greetReply, helpReply, NOT_ALLOWED, productsReply,
  quotationDetailReply, quotationsReply, salesReply, sendConfirmText, unknownReply, whatsNewReply,
} from "../../lib/anuReply"
import { getInbox } from "../../hooks/useChat"
import { runReadTool } from "../anu/readTools"
import { helpFor, whatsNew } from "./assistant"

/* ============================================================
   Anu's answer to one typed message, with NO language model.

   parseIntent() decides what was asked; the same lookups voice Anu uses
   (readTools.js, under the person's own session and RLS) or the database's
   own report functions (migration 0046) fetch the facts; anuReply.js writes
   the sentence. Deterministic, instant, and never "busy".

   Returns { body, meta: { cards, stats }, pending? }. `pending` is a team
   message waiting for the person's Confirm.
   ============================================================ */

const cardsOf = (results) => (results || []).map(cardFor).filter(Boolean)

async function rpcText(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    if (/not_allowed/.test(error.message)) return NOT_ALLOWED
    if (/Could not find the function|does not exist/i.test(error.message)) return "Team reports need database migration 0046. Ask an admin to push it."
    return `I couldn't read that: ${error.message}`
  }
  return data
}

const teamCard = (team) => {
  const conv = getInbox().find((c) => c.kind === "team" && c.team === team)
  return conv ? [{ key: `page:team:${team}`, kind: "page", id: team, to: `/chat?c=${conv.id}`, title: `Open ${TEAM_TITLES[team]}`, subtitle: "Team chat" }] : []
}

export async function answerAnu(text, { profile, access, now = Date.now() }) {
  const it = parseIntent(text)
  const first = (profile?.name || "").trim().split(/\s+/)[0] || ""
  const read = (name, args) => runReadTool(name, args, access, now)

  switch (it.intent) {
    case "empty":
      return { body: unknownReply() }
    case "greet":
      return { body: greetReply(first) }
    case "thanks":
      return { body: "Happy to help. Ask me anything else about the business." }

    case "send_team": {
      if (it.team === "everyone" && !["admin", "super_admin"].includes(profile?.role)) {
        return { body: "Only admins can post to Everyone. Pick a team instead, for example: tell sales that ..." }
      }
      return { body: sendConfirmText(TEAM_TITLES[it.team], it.body), pending: { team: it.team, body: it.body } }
    }

    case "attendance": {
      const body = await rpcText("anu_attendance_now", { p_team: it.team || null })
      return { body, meta: { cards: it.team ? teamCard(it.team) : [] } }
    }
    case "team_update": {
      const body = await rpcText("anu_team_update", { p_team: it.team || null })
      return { body, meta: { cards: it.team ? teamCard(it.team) : [] } }
    }

    case "whats_new": {
      const res = whatsNew(1)
      return { body: whatsNewReply(res), meta: { cards: [{ key: "page:/whats-new", kind: "page", id: "/whats-new", to: "/whats-new", title: "What's new", subtitle: res.releases[0]?.title || "" }] } }
    }
    case "help": {
      const res = helpFor(it.topic, profile)
      return {
        body: helpReply(res),
        meta: { cards: res.articles.map((a) => ({ key: `page:${a.page}:${a.title}`, kind: "page", id: a.page, to: a.page, title: a.title, subtitle: "Open the page" })) },
      }
    }

    case "briefing": {
      const r = await read("get_briefing", {})
      return { body: briefingReply(r.response), meta: { cards: cardsOf(r.results).slice(0, 8), stats: r.stats || [] } }
    }
    case "sales_summary": {
      const r = await read("sales_summary", { days: it.days })
      return { body: salesReply(r.response), meta: { stats: r.stats || [] } }
    }

    case "quotation": {
      const r = await read("find_quotations", { query: it.query, status: it.status || undefined })
      // One exact hit: show the whole quotation.
      if (r.response.ok !== false && r.response.total === 1) {
        const d = await read("get_quotation", { id: r.response.results[0].id })
        return { body: quotationDetailReply(d.response), meta: { cards: cardsOf(d.results) } }
      }
      return { body: quotationsReply(r.response, it), meta: { cards: cardsOf(r.results) } }
    }
    case "enquiries": {
      const r = await read("find_enquiries", { query: it.query, status: it.status || undefined, days: it.days || undefined })
      return { body: enquiriesReply(r.response, it), meta: { cards: cardsOf(r.results) } }
    }
    case "customers": {
      const r = await read("find_customers", { query: it.query })
      return { body: customersReply(r.response, it.query), meta: { cards: cardsOf(r.results) } }
    }
    case "products": {
      const r = await read("find_products", { query: it.query })
      return { body: productsReply(r.response, it.query), meta: { cards: cardsOf(r.results) } }
    }

    default: {
      // Anything else: look for it everywhere the person may see.
      const q = it.query
      const tries = [
        access.customers && ["find_customers", { query: q }, (r) => customersReply(r, q)],
        access.quotations && ["find_quotations", { query: q }, (r) => quotationsReply(r, { query: q })],
        (access.enquiries || access.voice) && ["find_enquiries", { query: q }, (r) => enquiriesReply(r, { query: q })],
        access.products && ["find_products", { query: q }, (r) => productsReply(r, q)],
      ].filter(Boolean)
      const found = []
      const cards = []
      for (const [name, args, write] of tries) {
        const r = await read(name, args)
        const n = r.response?.total ?? r.response?.count ?? r.results?.length ?? 0
        if (r.response?.ok !== false && n > 0) {
          found.push(write(r.response))
          cards.push(...cardsOf(r.results))
        }
      }
      if (!found.length) return { body: unknownReply(q) }
      return { body: found.join("\n\n"), meta: { cards: cards.slice(0, 8) } }
    }
  }
}

export async function postToTeam(team, body) {
  const { error } = await supabase.rpc("chat_post_to_team", { p_team: team, p_body: body })
  if (error) {
    if (/admins_only/.test(error.message)) return "Only admins can post to Everyone."
    return `It did not send: ${error.message}`
  }
  return `Sent to ${TEAM_TITLES[team]}.`
}
