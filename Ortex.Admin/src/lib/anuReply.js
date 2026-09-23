// Anu's words, built from data by templates, never by a language model. Each
// function takes the structured answer a lookup returned (lib/anu.js through
// components/anu/readTools.js) and returns the message text. Plain text with
// "- " lines, Indian money and dates, no em dashes.
//
// Mirrored by Ortex.Mobile/src/domain/anuReply.ts. Edit both.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const lines = (...parts) => parts.flat().filter((p) => p !== null && p !== undefined && p !== "").join("\n")
const bullets = (items) => items.map((s) => `- ${s}`)

export const NOT_ALLOWED = "That is not in your access. An admin can grant it in Users."

export function greetReply(firstName) {
  return lines(
    `Namaste ${firstName || ""}! I'm Anu. I read the Ortex database and answer straight from it.`.replace(" !", "!"),
    "Try:",
    bullets([
      "What needs my attention today?",
      "Who is not in today?",
      "Daily update for sales",
      "Quotations for Sharma",
      "New leads this week",
      "Price of satin lanyard",
      "Sales this month",
      "Tell accounts that INV-12 is paid",
      "How do I record a payment?",
    ]),
  )
}

export function unknownReply(query) {
  return lines(
    query ? `I couldn't find anything for "${query}".` : "I didn't catch that.",
    "I understand questions like:",
    bullets([
      "What needs my attention today?",
      "Who checked in today?",
      "Daily update for accounts",
      "Quotation QT-2026-014",
      "Leads from Mehta",
      "Customer 9876543210",
      "Price of acrylic keychain",
      "Send to sales team: meeting at 5",
    ]),
  )
}

export function briefingReply(r) {
  if (r?.ok === false) return r.error || NOT_ALLOWED
  const out = []
  if (r.new_enquiries) {
    const e = r.new_enquiries
    out.push(e.count
      ? `${plural(e.count, "new website enquiry", "new website enquiries")} not contacted yet${e.waiting_over_2_days ? `, ${e.waiting_over_2_days} waiting over 2 days` : ""}.`
      : "No new website enquiries waiting.")
  }
  if (r.anu_calls_to_return) {
    const c = r.anu_calls_to_return
    out.push(c.count
      ? `${plural(c.count, "Anu call")} to return${c.support_complaints ? `, including ${plural(c.support_complaints, "support complaint")}` : ""}.`
      : "No Anu calls waiting to be returned.")
  }
  if (r.quotations) {
    const q = r.quotations
    const exp = q.expiring_within_3_days || []
    const lapsed = q.already_expired_but_still_sent || []
    const waiting = q.waiting_a_week_or_more || []
    if (exp.length) out.push(`Expiring in 3 days: ${exp.map((x) => `${x.number} (${x.customer}, ${x.value})`).join("; ")}.`)
    if (lapsed.length) out.push(`Expired but still marked sent: ${lapsed.map((x) => x.number).join(", ")}. Follow up or mark them expired.`)
    if (waiting.length) out.push(`Waiting a week or more for a decision: ${waiting.map((x) => x.number).join(", ")}.`)
    out.push(`Open pipeline: ${q.open_pipeline_value}.`)
  }
  if (!out.length) return NOT_ALLOWED
  return lines("Here's what needs you:", bullets(out))
}

export function customersReply(r, query) {
  if (r?.ok === false) return r.error || NOT_ALLOWED
  if (!r.results?.length) return `No customer matches "${query}". Try a phone number, a company or an email.`
  return lines(
    `${plural(r.results.length, "customer")} found${query ? ` for "${query}"` : ""}:`,
    bullets(r.results.map((c) =>
      `${c.name}${c.company !== "none" ? `, ${c.company}` : ""}, ${c.phone}. ${plural(c.quotations, "quotation")}, won ${c.won_value}. Last: ${c.last_quotation}.`)),
  )
}

export function enquiriesReply(r, { query, status, days } = {}) {
  if (r?.ok === false) return r.error || NOT_ALLOWED
  const scope = [status && `${status}`, query && `for "${query}"`, days && (days === 1 ? "today" : `in the last ${days} days`)].filter(Boolean).join(" ")
  if (!r.total) return `No leads ${scope || "found"}.`
  return lines(
    `${plural(r.total, "lead")} ${scope}${r.total > r.results.length ? `. The latest ${r.results.length}:` : ":"}`.replace(/\s+/g, " ").replace(" :", ":"),
    bullets(r.results.map((e) =>
      e.kind === "voice_call"
        ? `${e.caller} (Anu call${e.support ? ", support" : ""}), wants ${e.wants}, ${e.status}, ${e.called}`
        : `${e.customer}, wants ${e.wants}, ${e.status}, ${e.received}`)),
  )
}

export function quotationsReply(r, { query, status } = {}) {
  if (r?.ok === false) return r.error || NOT_ALLOWED
  const scope = [status, query && `for "${query}"`].filter(Boolean).join(" ")
  if (!r.total) return `No quotations ${scope || "found"}.`
  return lines(
    `${plural(r.total, "quotation")} ${scope}, worth ${r.total_value}${r.total > r.results.length ? `. The latest ${r.results.length}:` : ":"}`.replace(/\s+/g, " "),
    bullets(r.results.map((q) => `${q.number}, ${q.customer}, ${q.value}, ${q.status}, valid till ${q.valid_until}`)),
  )
}

export function quotationDetailReply(d) {
  if (d?.ok === false) return d.error || NOT_ALLOWED
  return lines(
    `Quotation ${d.number} for ${d.customer} (${d.status})`,
    `Contact ${d.contact}, ${d.phone}. Issued ${d.issued}, valid till ${d.valid_until}.`,
    bullets(d.lines.map((l) => `${l.item}: ${l.quantity} at ${l.rate} + ${l.gst} GST`)),
    `Taxable ${d.taxable}, GST ${d.gst}${d.discount !== "none" ? `, discount ${d.discount}` : ""}. Total ${d.grand_total}.`,
    d.lost_reason ? `Lost because: ${d.lost_reason}` : "",
  )
}

export function productsReply(r, query) {
  if (r?.ok === false) return r.error || NOT_ALLOWED
  if (!r.results?.length) return `Nothing in the catalogue matches "${query}".`
  return lines(
    `${plural(r.results.length, "product")} for "${query}":`,
    bullets(r.results.map((p) =>
      `${p.name}: ${p.price_ex_gst} + ${p.gst} GST (${p.price_incl_gst} incl.), minimum ${p.minimum_order}${p.dispatch_days !== "not recorded" ? `, dispatch in ${p.dispatch_days} days` : ""}`)),
  )
}

export function salesReply(r) {
  if (r?.ok === false) return r.error || NOT_ALLOWED
  const out = []
  if (r.quotations_sent !== undefined) {
    out.push(`Quotations sent: ${r.quotations_sent}, worth ${r.quoted_value}`)
    out.push(`Won: ${r.won}, worth ${r.won_value} (win rate ${r.win_rate})`)
    if (r.drafts_not_sent) out.push(`Drafts not sent yet: ${r.drafts_not_sent}`)
  }
  if (r.website_enquiries !== undefined) out.push(`Website enquiries: ${r.website_enquiries}`)
  if (r.anu_calls !== undefined) out.push(`Anu calls: ${r.anu_calls}`)
  if (!out.length) return NOT_ALLOWED
  return lines(`Sales in ${r.period}:`, bullets(out))
}

export function helpReply(res) {
  if (!res.articles?.length) {
    return lines("I don't have a guide for that yet. I can explain:", bullets(res.other_topics || []))
  }
  return lines(res.articles.map((a, i) => lines(`${i ? "\n" : ""}${a.title}:`, a.steps.map((s, n) => `${n + 1}. ${s}`))))
}

export function whatsNewReply(res) {
  const r = res.releases?.[0]
  if (!r) return "Nothing new has been announced."
  return lines(
    `Latest update${r.version ? ` (version ${r.version}, ${r.date})` : ""}: ${r.title}.`,
    r.summary,
    bullets(r.items.map((i) => i.replace(/^(\w+): /, (_, k) => `${k[0].toUpperCase()}${k.slice(1)}: `))),
  )
}

export function sendConfirmText(teamTitle, body) {
  return `Send this to ${teamTitle}?\n"${body}"`
}
