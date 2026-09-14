/**
 * Anu for staff: the conversation around her tools.
 *
 * The sibling of domain/anu.ts (which answers the tools). This file holds what
 * the SCREEN needs to draw a conversation that can be typed as well as spoken:
 * the transcript and its dedupe, the words a tool step shows, the "For you"
 * rows on the idle page, and the Confirm / Cancel card for the two writes.
 * Ported from the console's components/anu/useAnuSession.js and AnuPanel.jsx
 * (and lib/anu.js's attentionCounts / cardFor), kept pure so it is tested in
 * test/anuConversation.test.mjs.
 */

import { briefing, type Access, type EnquiryRow, type QuotationRow } from "@/domain/anu"
import { ENQUIRY_STATUS } from "@/domain/schema"

// ---- records ------------------------------------------------------------------

export type SurfacedCard = {
  key: string
  kind: string
  id: string
  title: string
  subtitle: string
  /** A support complaint or an urgent call, drawn as a pill on the card. */
  flag: "" | "support" | "urgent"
}

/** A record a tool result names, as the card drawn under that step. */
export function cardFor(r: Record<string, unknown> | null | undefined): SurfacedCard | null {
  const kind = String(r?.kind || "")
  const id = String(r?.id || "")
  if (!r || !kind || !id) return null
  const title = String(r.number || r.customer || r.caller || r.name || "Record")
  const subtitle =
    kind === "quotation"
      ? [r.customer, r.status, r.value].filter(Boolean).join(" · ")
      : kind === "customer"
        ? [r.company !== "none" ? r.company : "", r.phone !== "not recorded" ? r.phone : ""].filter(Boolean).join(" · ")
        : kind === "product"
          ? [r.price_ex_gst, r.minimum_order].filter(Boolean).join(" · ")
          : [r.wants, r.status || r.received].filter(Boolean).join(" · ")
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    title: kind === "quotation" ? `Quotation ${title}` : title,
    subtitle: String(subtitle),
    flag: r.support ? "support" : r.urgent ? "urgent" : "",
  }
}

/** Every record in a result (a list or one detail), as cards, duplicates dropped. */
export function cardsFrom(results: unknown): SurfacedCard[] {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean) as Record<string, unknown>[]
  const seen = new Set<string>()
  const out: SurfacedCard[] = []
  for (const r of list) {
    const c = cardFor(r)
    if (c && !seen.has(c.key)) {
      seen.add(c.key)
      out.push(c)
    }
  }
  return out
}

// ---- transcript ---------------------------------------------------------------

export type Stat = { label: string; value: string }

export type Turn = {
  id: number
  role: "user" | "anu" | "tool"
  text: string
  /** A user turn typed into the composer rather than spoken. */
  typed?: boolean
  /** ms timestamp, for the echo window. */
  at: number
  tool?: string
  failed?: boolean
  count?: number
  cards?: SurfacedCard[]
  stats?: Stat[]
}

export type TurnInput = Omit<Turn, "id" | "at"> & { at?: number }

/** Enough to scroll back through a long session; the oldest fall away. */
export const MAX_TURNS = 80
/** How long after a typed turn a matching spoken transcription counts as its echo. */
export const ECHO_WINDOW_MS = 15_000

const normText = (s: string) =>
  String(s || "")
    .toLowerCase()
    // Latin and Devanagari letters and digits; no \p{} escapes, which Hermes builds vary on.
    .replace(/[^a-z0-9ऀ-ॿ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/**
 * The transcript with one more turn. Three things are refused rather than
 * shown twice:
 *   · an empty line;
 *   · a SPOKEN user line that repeats the last typed one within the echo window
 *     (a phone speaker reading the question back into its own mic, or the model
 *     transcribing the text it was sent), including a partial of it;
 *   · the same line from the same speaker twice in a row (a flush on an
 *     interruption and again on turn complete).
 */
export function appendTurn(turns: Turn[], input: TurnInput, now = Date.now()): Turn[] {
  const text = String(input.text || "").trim()
  if (!text) return turns
  const at = input.at ?? now
  const last = turns[turns.length - 1]

  if (input.role === "user" && !input.typed) {
    const typed = [...turns].reverse().find((t) => t.role === "user")
    if (typed?.typed && at - typed.at <= ECHO_WINDOW_MS) {
      const a = normText(typed.text)
      const b = normText(text)
      if (b && (a === b || a.includes(b))) return turns
    }
  }
  if (last && input.role !== "tool" && last.role === input.role && normText(last.text) === normText(text)) return turns

  const next: Turn = { ...input, text, at, id: (last?.id ?? 0) + 1 }
  return [...turns, next].slice(-MAX_TURNS)
}

/** Records surfaced across the whole conversation, for "Conversation ended · 3 records found". */
export const foundCount = (turns: Turn[]) => turns.reduce((n, t) => n + (t.cards?.length || 0), 0)

// ---- tool steps ---------------------------------------------------------------

/** What a tool call looked like, in the words the transcript shows. "" = no step drawn. */
export function activityLabel(name: string, args: Record<string, unknown> = {}): string {
  const q = args.query ? ` for "${args.query}"` : ""
  switch (name) {
    case "get_briefing":
      return "Checked today's briefing"
    case "find_customers":
      return `Searched customers${q}`
    case "find_enquiries":
      return `Searched leads${q}${args.status ? `, ${args.status}` : ""}${args.days ? `, last ${args.days} days` : ""}`
    case "find_quotations":
      return `Searched quotations${q}${args.status ? `, ${args.status}` : ""}`
    case "get_quotation":
      return "Opened a quotation's details"
    case "find_products":
      return `Searched the catalogue${q}`
    case "sales_summary":
      return `Summarised the last ${args.days || 30} days`
    case "set_enquiry_status":
      return args.confirmed === true ? "Updated a lead's status" : "Proposed a status change"
    case "start_quotation":
      return args.confirmed === true ? "Started a draft quotation" : "Proposed a draft quotation"
    case "open_record":
      return "Opening a record"
    default:
      return ""
  }
}

/** The briefing's headline figures, drawn under its step so a spoken answer is also readable. */
export function briefingStats(b: Record<string, unknown>): Stat[] {
  const out: Stat[] = []
  const ne = b.new_enquiries as { count?: number } | undefined
  const calls = b.anu_calls_to_return as { count?: number } | undefined
  const q = b.quotations as { open_pipeline_value?: string } | undefined
  if (ne) out.push({ label: "New enquiries", value: String(ne.count ?? 0) })
  if (calls) out.push({ label: "Calls to return", value: String(calls.count ?? 0) })
  if (q?.open_pipeline_value) out.push({ label: "Open pipeline", value: q.open_pipeline_value })
  return out
}

export function summaryStats(s: Record<string, unknown>): Stat[] {
  const out: Stat[] = []
  if (s.quoted_value) out.push({ label: "Quoted", value: String(s.quoted_value) })
  if (s.won_value) out.push({ label: "Won", value: String(s.won_value) })
  if (s.win_rate) out.push({ label: "Win rate", value: String(s.win_rate) })
  if (s.website_enquiries !== undefined) out.push({ label: "Enquiries", value: String(s.website_enquiries) })
  if (s.anu_calls !== undefined) out.push({ label: "Anu calls", value: String(s.anu_calls) })
  return out.slice(0, 4)
}

// ---- "For you" ----------------------------------------------------------------

export type AttentionCounts = { newEnquiries: number; callsToReturn: number; support: number; expiring: number; waiting: number }

/** The briefing as counts: each is a question worth offering only when something is behind it. */
export function attentionCounts(
  data: { enquiries: EnquiryRow[]; quotations: QuotationRow[] },
  access: Access,
  now = Date.now(),
): AttentionCounts {
  const b = briefing(data, access, now) as {
    new_enquiries?: { count: number }
    anu_calls_to_return?: { count: number; support_complaints: number }
    quotations?: { expiring_within_3_days: unknown[]; already_expired_but_still_sent: unknown[]; waiting_a_week_or_more: unknown[] }
  }
  return {
    newEnquiries: b.new_enquiries?.count || 0,
    callsToReturn: b.anu_calls_to_return?.count || 0,
    support: b.anu_calls_to_return?.support_complaints || 0,
    expiring: (b.quotations?.expiring_within_3_days.length || 0) + (b.quotations?.already_expired_but_still_sent.length || 0),
    waiting: b.quotations?.waiting_a_week_or_more.length || 0,
  }
}

export type ForYouRow = {
  key: "support" | "calls" | "enquiries" | "expiring" | "waiting"
  tone: "danger" | "primary" | "warning" | "muted"
  text: string
  /** What tapping the row asks Anu, in Hinglish, as she speaks. */
  ask: string
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** The idle page's "For you" rows, most urgent first, only those with something behind them. */
export function forYouRows(c: AttentionCounts): ForYouRow[] {
  const rows: (ForYouRow | false)[] = [
    c.support > 0 && {
      key: "support",
      tone: "danger",
      text: `${c.support} support ${plural(c.support, "call", "calls")} to return`,
      ask: "Kaunse support calls return karne hain?",
    },
    c.callsToReturn > 0 && {
      key: "calls",
      tone: "primary",
      text: `${c.callsToReturn} Anu ${plural(c.callsToReturn, "call", "calls")} nobody has returned`,
      ask: "Anu ki kaunsi calls abhi tak return nahi hui?",
    },
    c.newEnquiries > 0 && {
      key: "enquiries",
      tone: "primary",
      text: `${c.newEnquiries} new ${plural(c.newEnquiries, "enquiry", "enquiries")} waiting`,
      ask: "Mere new enquiries batao.",
    },
    c.expiring > 0 && {
      key: "expiring",
      tone: "warning",
      text: `${c.expiring} ${plural(c.expiring, "quotation", "quotations")} expiring or lapsed`,
      ask: "Kaunse quotations expire hone wale hain ya ho chuke hain?",
    },
    c.waiting > 0 && {
      key: "waiting",
      tone: "muted",
      text: `${c.waiting} sent a week ago, no decision`,
      ask: "Kaunse quotations ek hafte se decision ka wait kar rahe hain?",
    },
  ]
  return rows.filter(Boolean) as ForYouRow[]
}

// ---- writes: Confirm / Cancel ---------------------------------------------------

export type PendingAction = { name: "set_enquiry_status" | "start_quotation"; args: Record<string, unknown>; title: string; detail: string }

/**
 * The on-screen card for a write Anu proposed without `confirmed: true`, or null
 * for any other call. `known` is every record surfaced so far, by card key, so
 * the card can name the lead rather than say "an enquiry".
 */
export function pendingActionFor(
  name: string,
  args: Record<string, unknown>,
  known: Map<string, SurfacedCard> | Record<string, SurfacedCard>,
): PendingAction | null {
  const get = (key: string) => (known instanceof Map ? known.get(key) : known[key])
  if (name === "set_enquiry_status") {
    const kind = String(args.kind || "")
    const label = ENQUIRY_STATUS.find((s) => s.id === String(args.status))?.label
    if (!label) return null
    const record = get(`${kind}:${args.id}`)
    return {
      name,
      args,
      title: `Mark as ${label}`,
      detail: record ? [record.title, record.subtitle].filter(Boolean).join(" · ") : kind === "voice_call" ? "An Anu call" : "An enquiry",
    }
  }
  if (name === "start_quotation") {
    const items = Array.isArray(args.items) ? (args.items as { product?: string; quantity?: string | number }[]) : []
    const customer = String(args.customer_name || "") || get(`customer:${args.customer_id}`)?.title || "No customer named"
    const list = items.map((i) => [i.quantity, i.product].filter((v) => v !== undefined && v !== "").join(" x ")).filter(Boolean).join(", ")
    return { name, args, title: "Start a draft quotation", detail: [customer, list].filter(Boolean).join(" · ") }
  }
  return null
}

// ---- what Anu is told -----------------------------------------------------------

/** The first turn of a session: the question typed or tapped, or a greeting cue. */
export function openingLine(first: string, question?: string): string {
  const q = String(question || "").trim()
  return q ? `[${first} opened Anu and asks (reply in Hinglish):] ${q}` : `[${first} just opened Anu. Greet them in one short Hinglish line.]`
}

export const confirmedLine = (first: string, response: unknown) =>
  `[${first} pressed Confirm on screen. Result: ${JSON.stringify(response)}. Tell them the outcome in one short Hinglish line, and follow any "next" in the result.]`

export const cancelledLine = (first: string) =>
  `[${first} pressed Cancel on screen. Do not make that change. Acknowledge in a few words.]`
