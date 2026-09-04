// Queue planner: reads every lead, enquiry and invoice, decides who deserves a
// call, which kind, how urgently, and why. Replaces "queue everything in table
// order" with a scored worklist so the daily cap goes to the calls most likely
// to produce revenue:
//
//   enquiry follow-up   fresh buying intent (website, IndiaMART, voice leads)
//   lead follow-up      open pipeline: overdue follow-ups, quoted/negotiating deals
//   feedback            delivered orders, N days after invoice
//   upsell / network    repeat customers, key accounts, seasonal reorders,
//                       and "who else in your network" introductions
//
// Each candidate gets a 0-100 priority and a plain-English reason. Gemini then
// writes a one-line objective + pitch angle per new job in a single batch call
// (deterministic fallback when it is unavailable). The sweep dials by
// priority, not by insertion time, and keeps a healthy mix per tick.

import { generateContent, extractText, logAiUsage } from "./gemini.ts"
import type { Db } from "./auth.ts"
import { upcomingOccasions } from "./telecallerCalendar.ts"

// deno-lint-ignore no-explicit-any
type Doc = Record<string, any>

export type Candidate = {
  kind: "followup" | "feedback" | "upsell" | "pitch"
  phone: string
  contactName: string
  company: string
  leadId?: string | null
  enquiryId?: string | null
  invoiceId?: string | null
  customerId?: string | null
  source: string
  priority: number
  reason: string
  objective?: string
  context: Doc
  scheduledAt: string
}

const DAY = 86400000
const HOUR = 3600000
const URGENT_RE = /\b(urgent|urgently|asap|immediate|immediately|jaldi|turant|emergency|same day|tomorrow|kal chahiye|this week)\b/i
const SUPPORT_RE = /\b(cancel|cancell?ation|complain|complaint|refund|return|rude|angry|not happy|dissatisf|poor service|damaged|defect|wrong (item|product|order)|delay(ed)? (order|delivery)|escalat)\b/i
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n)
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0 }
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

type Input = {
  leads: Doc[]
  enquiries: Doc[]
  invoices: Doc[]
  jobs: Doc[]
  calls: Doc[]
  settings: Doc
  normalizePhone: (v: unknown) => string
  isIndianMobile: (d: string) => boolean
  nextSlot: (from?: Date) => Date
  now?: number
}

/** Score everything and return new candidates, best first, de-duplicated by phone. */
export function planCandidates(input: Input): { candidates: Candidate[]; forHuman: { who: string; why: string }[] } {
  const { leads, enquiries, invoices, jobs, calls, settings: s, normalizePhone, isIndianMobile } = input
  const now = input.now ?? Date.now()
  const dnc = new Set<string>((s.doNotCall || []).map(normalizePhone))
  const openByPhone = new Set(jobs.filter((j) => ["queued", "dialing", "in_progress"].includes(j.status)).map((j) => j.phone))
  const jobFor = (pred: (j: Doc) => boolean) => jobs.some(pred)
  const lastCallByPhone = new Map<string, Doc>()
  for (const c of calls) if (c.phone && !lastCallByPhone.has(c.phone)) lastCallByPhone.set(c.phone, c)
  const invoicesByPhone = new Map<string, Doc[]>()
  for (const inv of invoices) {
    if (["draft", "cancelled"].includes(inv.status)) continue
    const p = normalizePhone(inv.customer?.phone)
    if (!p) continue
    invoicesByPhone.set(p, [...(invoicesByPhone.get(p) || []), inv])
  }
  const { occasions } = upcomingOccasions({ horizonDays: 60, max: 3 })
  const bigSeason = occasions.find((o) => o.name === "Diwali" || o.name === "New Year") || occasions[0]

  const out: Candidate[] = []
  const forHuman: { who: string; why: string }[] = []
  const taken = new Set<string>()
  const ok = (phone: string) => isIndianMobile(phone) && !dnc.has(phone) && !openByPhone.has(phone) && !taken.has(phone)
  const recentlyRefused = (phone: string) => {
    const c = lastCallByPhone.get(phone)
    return c?.analysis?.outcome && ["not_interested", "wrong_number", "do_not_call", "complaint"].includes(c.analysis.outcome) && now - new Date(c.createdAt).getTime() < 45 * DAY
  }
  const push = (c: Candidate) => { taken.add(c.phone); out.push({ ...c, priority: clamp(c.priority) }) }

  // ---- 1. Open pipeline: leads -------------------------------------------
  const leadByEnquiry = new Set(leads.map((l) => l.enquiryId).filter(Boolean))
  if (s.autoQueueNewLeads !== false) {
    for (const l of leads) {
      const phone = normalizePhone(l.customer?.phone)
      const stage = l.stage || "new"
      if (!ok(phone) || !["new", "contacted", "qualified", "quoted", "negotiation"].includes(stage)) continue
      if (recentlyRefused(phone)) continue
      const followUpAt = l.nextFollowUp ? new Date(l.nextFollowUp).getTime() : 0
      if (followUpAt && followUpAt > now + 12 * HOUR) continue // a human booked it for later
      if (jobFor((j) => j.leadId === l.id && now - new Date(j.createdAt).getTime() < 3 * DAY)) continue
      if (SUPPORT_RE.test(`${l.notes || ""} ${l.productInterest || ""}`)) { forHuman.push({ who: l.customer?.name || phone, why: "lead notes read like a complaint" }); continue }

      const stageBoost: Record<string, number> = { negotiation: 28, quoted: 22, qualified: 12, contacted: 6, new: 10 }
      const overdueDays = followUpAt ? (now - followUpAt) / DAY : 0
      const idleDays = (now - new Date(l.lastActivityAt || l.createdAt).getTime()) / DAY
      const value = num(l.estimatedValue)
      let p = 48 + (stageBoost[stage] || 0)
      let why = `${stage} lead`
      if (overdueDays > 0) { p += Math.min(18, 8 + overdueDays * 2); why += `, follow-up overdue by ${Math.ceil(overdueDays)} day(s)` }
      else if (followUpAt) { p += 8; why += ", follow-up due today" }
      if (value) { p += Math.min(15, value / 8000); why += `, est. ₹${Math.round(value).toLocaleString("en-IN")}` }
      if (idleDays > 7 && stage !== "new") { p += 4; why += `, quiet for ${Math.floor(idleDays)} days` }
      if (idleDays < 1 && stage === "new") { p += 6; why += ", brand new" }
      if (URGENT_RE.test(`${l.notes || ""} ${l.productInterest || ""}`)) { p += 8; why += ", urgent wording" }
      push({
        kind: "followup", phone, contactName: l.customer?.name || "", company: l.customer?.company || "", leadId: l.id, enquiryId: l.enquiryId || null,
        source: "planner-lead", priority: p, reason: why,
        context: { productInterest: l.productInterest, quantity: l.quantityEstimate, summary: l.notes, city: l.customer?.address, estimatedValue: value },
        scheduledAt: input.nextSlot().toISOString(),
      })
    }
  }

  // ---- 2. Fresh intent: enquiries not yet converted ------------------------
  if (s.autoQueueNewLeads !== false) {
    for (const e of enquiries) {
      const phone = normalizePhone(e.customer?.phone)
      if (!ok(phone) || (e.status || "new") !== "new" || leadByEnquiry.has(e.id)) continue
      if (recentlyRefused(phone)) continue
      const ageH = (now - new Date(e.submittedAt || e.createdAt).getTime()) / HOUR
      if (ageH < 2) continue // the human team gets the first two hours
      if (jobFor((j) => j.enquiryId === e.id)) continue
      const text = `${e.message || ""} ${e.productInterest || ""} ${e.notes || ""}`
      if (SUPPORT_RE.test(text)) { forHuman.push({ who: e.customer?.name || phone, why: "enquiry reads like a support issue" }); continue }
      const voice = /voice|anu|orty/i.test(e.source || "")
      const items = Array.isArray(e.items) ? e.items : []
      const qty = items.reduce((a: number, i: Doc) => a + num(i.quantity), 0) || num(e.quantity)
      let p = 62
      let why = `new enquiry via ${e.source || "website"}`
      if (ageH < 24) { p += 16; why += ", under 24h old" } else if (ageH < 72) { p += 8 } else if (ageH > 14 * 24) { p -= 10; why += ", getting cold" }
      if (voice) { p += 6; why += ", spoke to the voice assistant" }
      if (items.length || qty) { p += 8; why += qty ? `, ~${qty} pcs` : "" }
      if (qty >= 500) p += 8
      if (URGENT_RE.test(text)) { p += 8; why += ", urgent wording" }
      if (e.starred) { p += 6; why += ", starred by the team" }
      push({
        kind: "followup", phone, contactName: e.customer?.name || "", company: e.customer?.company || "", enquiryId: e.id,
        source: e.source || "planner-enquiry", priority: p, reason: why,
        context: { items: items.map((i: Doc) => ({ product: i.product, quantity: i.quantity, notes: i.notes })), productInterest: e.productInterest, summary: e.message, city: e.customer?.address },
        scheduledAt: input.nextSlot().toISOString(),
      })
    }
  }

  // ---- 3. Customers: feedback, upsell, key-account network calls ----------
  for (const [phone, invs] of invoicesByPhone) {
    if (!ok(phone) || recentlyRefused(phone)) continue
    const sorted = [...invs].sort((a, b) => new Date(b.issueDate || b.createdAt).getTime() - new Date(a.issueDate || a.createdAt).getTime())
    const last = sorted[0]
    const ageDays = (now - new Date(last.issueDate || last.createdAt).getTime()) / DAY
    const total = sorted.reduce((a, i) => a + num(i.totals?.grandTotal), 0)
    const keyAccount = sorted.length >= 2 || total >= 100000
    const items = (last.lines || []).map((l: Doc) => ({ product: l.description, quantity: l.quantity }))
    const base = { phone, contactName: last.customer?.name || "", company: last.customer?.company || "", invoiceId: last.id, context: { items, summary: `Last order ${last.number || ""} on ${String(last.issueDate || last.createdAt).slice(0, 10)}, ${sorted.length} order(s), lifetime ₹${Math.round(total).toLocaleString("en-IN")}`, city: last.shipTo?.address || last.customer?.address, orders: sorted.length, lifetimeValue: total } }

    // feedback: once per invoice, in the window after delivery
    if (s.feedback?.enabled !== false && ageDays >= (s.feedback?.daysAfterInvoice ?? 7) && ageDays <= (s.feedback?.daysAfterInvoice ?? 7) + 30 && !jobFor((j) => j.invoiceId === last.id && j.kind === "feedback")) {
      let p = 44
      let why = `order ${last.number || ""} delivered ~${Math.floor(ageDays)} days ago, no feedback yet`
      if (num(last.totals?.grandTotal) >= 50000) { p += 10; why += ", large order" }
      if (keyAccount) { p += 6; why += ", key account" }
      push({ ...base, kind: "feedback", source: "planner-feedback", priority: p, reason: why, scheduledAt: input.nextSlot().toISOString() })
      continue
    }

    // upsell / network: after the upsell delay, not more often than repeatEveryDays
    if (s.upsell?.enabled !== false && ageDays >= (s.upsell?.daysAfterInvoice ?? 30)) {
      const lastUpsell = jobs.find((j) => j.phone === phone && j.kind === "upsell")
      if (lastUpsell && now - new Date(lastUpsell.createdAt).getTime() < (s.upsell?.repeatEveryDays ?? 90) * DAY) continue
      const lastFeedback = lastCallByPhone.get(phone)
      const happy = lastFeedback?.analysis?.feedbackRating >= 4 || lastFeedback?.analysis?.sentiment === "positive"
      let p = 36
      let why = `repeat-order window open (${Math.floor(ageDays)} days since last order)`
      if (keyAccount) { p += 16; why += `, key account (${sorted.length} orders, ₹${Math.round(total).toLocaleString("en-IN")})` }
      if (happy) { p += 8; why += ", happy on last call" }
      if (bigSeason && bigSeason.bookDays >= 0 && bigSeason.bookDays <= 35) { p += 12; why += `, ${bigSeason.name} order window open` }
      if (ageDays > 180) { p += 6; why += ", at risk of lapsing" }
      const network = keyAccount || happy
      push({
        ...base, kind: "upsell", source: network ? "planner-network" : "planner-upsell", priority: p, reason: why + (network ? ", ask for other departments / branches / referrals" : ""),
        context: { ...base.context, network },
        scheduledAt: input.nextSlot().toISOString(),
      })
    }
  }

  out.sort((a, b) => b.priority - a.priority)
  return { candidates: out, forHuman }
}

const OBJECTIVE_SCHEMA = {
  type: "ARRAY",
  items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, objective: { type: "STRING" }, angle: { type: "STRING" } }, required: ["i", "objective"] },
}

/**
 * One Gemini call writes a one-line objective and a pitch angle for a batch of
 * candidates. Falls back to a deterministic line per candidate.
 */
export async function writeObjectives(cands: Candidate[], model: string, pulseText?: string): Promise<Candidate[]> {
  const fallback = (c: Candidate) => {
    const what = c.context?.items?.length ? c.context.items.map((i: Doc) => `${i.product} × ${i.quantity ?? "?"}`).join(", ") : c.context?.productInterest || ""
    switch (c.kind) {
      case "feedback": return `Feedback on ${c.context?.summary || "the last order"}: quality, delivery, rating out of 5; note any issue for the team.`
      case "upsell": return c.context?.network ? `Key account: reference ${c.context?.summary || "their orders"}, ask what is coming up, propose a reorder or add-on, and ask which other departments, branches or contacts might need gifting.` : `Reorder call: reference ${c.context?.summary || "their last order"}, ask about upcoming occasions, propose a reorder or add-on.`
      default: return `${c.reason}. ${what ? `Confirm ${what}, ` : "Confirm the requirement, "}timeline and city; close on a free mockup + quotation on WhatsApp or book a callback.`
    }
  }
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey || !cands.length) return cands.map((c) => ({ ...c, objective: c.objective || fallback(c) }))
  const rows = cands.map((c, i) => ({ i, kind: c.kind, name: c.contactName, company: c.company, reason: c.reason, context: { ...c.context, items: (c.context?.items || []).slice(0, 6) } }))
  const prompt = `You are the sales manager at Ortex Industries (custom corporate gifts, New Delhi). For each planned telecall below write:
- "objective": ONE sentence the AI caller must achieve on this call (specific to the data: products, quantities, order history, why now).
- "angle": ONE short pitch idea or opener for this customer (a product to suggest, an occasion to tie to, a value argument).
Be concrete and commercial. English. Return JSON array of {i, objective, angle}.
${pulseText ? `Context this week: ${clip(pulseText, 1200)}\n` : ""}
CALLS:
${JSON.stringify(rows)}`
  try {
    const res = await generateContent(model, apiKey, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: OBJECTIVE_SCHEMA, temperature: 0.4 },
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    await logAiUsage("telecaller-planner", model, data?.usageMetadata)
    const parsed = JSON.parse(extractText(data)) as { i: number; objective?: string; angle?: string }[]
    const byI = new Map(parsed.map((p) => [p.i, p]))
    return cands.map((c, i) => {
      const p = byI.get(i)
      const objective = clip(p?.objective, 400).trim()
      return { ...c, objective: objective ? `${objective}${p?.angle ? ` Angle: ${clip(p.angle, 200)}` : ""}` : fallback(c) }
    })
  } catch (e) {
    console.error("planner objectives failed:", e instanceof Error ? e.message : e)
    return cands.map((c) => ({ ...c, objective: c.objective || fallback(c) }))
  }
}

/**
 * Pick which due jobs to dial this tick: highest priority first, but keep a
 * mix so customer-care and reorder calls are not starved by enquiries.
 */
export function pickForDial(due: Doc[], max: number): Doc[] {
  const sorted = [...due].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50) || new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
  if (sorted.length <= max) return sorted
  const picked: Doc[] = []
  const quota: Record<string, number> = { followup: Math.ceil(max * 0.5), pitch: Math.ceil(max * 0.2), upsell: Math.ceil(max * 0.25), feedback: Math.ceil(max * 0.2), manual: max }
  const used: Record<string, number> = {}
  for (const j of sorted) {
    const k = j.kind || "manual"
    if ((used[k] || 0) < (quota[k] ?? max)) { picked.push(j); used[k] = (used[k] || 0) + 1 }
    if (picked.length >= max) return picked
  }
  for (const j of sorted) { if (!picked.includes(j)) picked.push(j); if (picked.length >= max) break }
  return picked
}
