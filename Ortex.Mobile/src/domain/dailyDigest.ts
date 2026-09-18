// The two DAILY notifications: a morning line of motivation, and a morning
// insight about the day before.
//
// Pure, like domain/dashboard.ts, whose vocabulary this borrows so a number in
// the shade never disagrees with the Home tab: a lead is a web enquiry or a
// folded Anu call (`leadsFrom`), "won" is accepted or invoiced, a quotation is
// dated by `issueDate`, and a draft is not "quoted".
//
// THE HONEST LIMIT, stated in the notification itself. These are scheduled on
// the phone ahead of time (lib/dailyPush.ts) so they fire at 9 even when the app
// is closed; the figures are therefore the ones the phone held when it last ran.
// When that snapshot was taken before the reported day ended, the body says
// "as of" the snapshot's time instead of passing a partial day off as final.

import { formatCurrency } from "@/domain/format"
import type { Enquiry, Quotation } from "@/domain/schema"
import { attentionItems, DAY, leadsFrom, WON } from "@/domain/dashboard"

/** When each one fires, local time. */
export const MOTIVATION_AT = { hour: 9, minute: 0 }
export const INSIGHT_AT = { hour: 9, minute: 30 }

/** The next moment at `at` strictly after `now`. */
export function nextAt(now: number, at: { hour: number; minute: number }): number {
  const d = new Date(now)
  d.setHours(at.hour, at.minute, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ---- motivation --------------------------------------------------------------

/**
 * Lines for a field-sales rep, not poster slogans: each one points at something
 * they can do today. No em dashes (the app's rule for on-screen text).
 */
export const MOTIVATION: { title: string; body: string }[] = [
  { title: "Good morning", body: "Every call you return today is a customer someone else did not. Start with the oldest lead." },
  { title: "Small wins count", body: "One quotation sent before lunch beats five planned for tomorrow." },
  { title: "Speed sells", body: "The first supplier to reply usually gets the order. Be first today." },
  { title: "Aaj ka target", body: "Ek extra follow-up call. That is often the one that closes." },
  { title: "Follow up", body: "Most orders come after the second or third follow-up. Ring the quote you sent last week." },
  { title: "Know the product", body: "A customer trusts the rep who can say how the logo goes on. Open one product page today." },
  { title: "Listen first", body: "Ask what the event is and when it is. The right quantity follows the right question." },
  { title: "Fresh start", body: "Yesterday is done. Today has new leads waiting for someone who picks up." },
  { title: "Be the easy choice", body: "Clear price, clear delivery date, one message. Make saying yes simple." },
  { title: "Chalo, shuru karein", body: "Pehle woh lead jo sabse zyada wait kar raha hai. Baaki sab uske baad." },
  { title: "Repeat customers", body: "A customer who ordered once is the easiest sale you have. Say hello to one today." },
  { title: "Keep it moving", body: "A quote with no reply is a question you have not asked yet. Ask it today." },
  { title: "Show, do not tell", body: "Send a photo of work we have done. It answers questions before they are asked." },
  { title: "Consistency wins", body: "Ten calls a day, every day, beats fifty on a Friday." },
  { title: "Make it personal", body: "Use the customer's name and their event. Nobody wants a copy-paste reply." },
  { title: "Close the loop", body: "Mark what you finished today. A clean list tomorrow starts faster." },
  { title: "Ask for the order", body: "If the price and the date work for them, ask. Many deals wait only for the question." },
  { title: "Har call important hai", body: "Chhota order aaj, bada order kal. Har customer ko same respect do." },
  { title: "One thing at a time", body: "Pick the one lead that matters most this morning and finish it before the next." },
  { title: "Energy is contagious", body: "Customers hear a smile on the phone. Make the first call a good one." },
  { title: "Plan the day", body: "Two minutes on the Home tab now saves an hour of guessing later." },
  { title: "Turn no into not yet", body: "A lost quote can still teach you the price, the date or the competitor. Note the reason." },
  { title: "Be reliable", body: "Promise a delivery date you can keep. Trust closes the next order too." },
  { title: "New week energy", body: "Every big customer started as one enquiry. Treat today's like it could be the big one." },
  { title: "Reply before they chase", body: "If a customer has to ask twice, the order is already at risk. Reply first." },
  { title: "Sharp and simple", body: "Short messages get read. Price, quantity, date, and a clear next step." },
  { title: "Keep learning", body: "Ask Anu about a product you rarely sell. Tomorrow's customer might want exactly that." },
  { title: "Proud work", body: "Every lanyard and trophy we ship carries someone's name. Sell it like it matters, because it does." },
]

/** The same line all day for everyone, a new one each day, cycling through the list. */
export function motivationFor(day: number, firstName = ""): { title: string; body: string } {
  const index = Math.floor(startOfDay(day) / DAY) % MOTIVATION.length
  const line = MOTIVATION[(index + MOTIVATION.length) % MOTIVATION.length]
  return {
    title: firstName && line.title === "Good morning" ? `Good morning, ${firstName}` : line.title,
    body: line.body,
  }
}

// ---- insight -----------------------------------------------------------------

export type InsightAccess = { enquiries: boolean; voice: boolean; quotations: boolean }

export type DailyInsight = {
  title: string
  body: string
  /** The figures behind the words, for the tests and for a future screen. */
  figures: {
    leads: number
    web: number
    voice: number
    quoted: number
    quotedValue: number
    won: number
    wonValue: number
    waiting: number
    expiring: number
    chase: number
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function clock(t: number): string {
  const d = new Date(t)
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

/**
 * The insight that fires at `fireAt`, about the calendar day BEFORE it, from the
 * rows the phone holds at `now`. Returns null when the profile can see neither
 * leads nor quotations, since there would be nothing true to say.
 */
export function dailyInsight({
  enquiries = [],
  quotations = [],
  access,
  now,
  fireAt,
}: {
  enquiries?: Enquiry[]
  quotations?: Quotation[]
  access: InsightAccess
  now: number
  fireAt: number
}): DailyInsight | null {
  const seesLeads = access.enquiries || access.voice
  if (!seesLeads && !access.quotations) return null

  const dayEnd = startOfDay(fireAt)
  const dayStart = dayEnd - DAY
  const inDay = (t: number) => t >= dayStart && t < dayEnd
  const at = (ts: unknown) => new Date(ts as string).getTime()

  const leads = seesLeads
    ? leadsFrom(enquiries).filter((l) => inDay(l.at) && (l.kind === "web" ? access.enquiries : access.voice))
    : []
  const web = leads.filter((l) => l.kind === "web").length
  const voice = leads.length - web

  const issued = access.quotations
    ? quotations.filter((q) => q.status !== "draft" && inDay(at(q.issueDate || q.createdAt)))
    : []
  const quotedValue = issued.reduce((s, q) => s + (Number(q.totals?.grandTotal) || 0), 0)
  const won = issued.filter((q) => WON.has(q.status))
  const wonValue = won.reduce((s, q) => s + (Number(q.totals?.grandTotal) || 0), 0)

  // Today's to-do list, as the Home tab's "Needs you today" would draw it at the
  // moment the notification fires.
  const todo = attentionItems({ enquiries, quotations, now: fireAt }, access)
  const waiting = todo.filter((i) => i.icon === "enquiry" || i.icon === "voice").length
  const expiring = todo.filter((i) => i.icon === "clock").length
  const chase = todo.filter((i) => i.icon === "quote").length

  const parts: string[] = []
  if (seesLeads) {
    parts.push(
      leads.length
        ? `${plural(leads.length, "new lead")}${voice && web ? ` (${web} website, ${voice} Anu)` : voice ? " from Anu" : ""}`
        : "no new leads",
    )
  }
  if (access.quotations) {
    parts.push(
      issued.length
        ? `${plural(issued.length, "quotation")} sent worth ${formatCurrency(quotedValue, { compact: true })}`
        : "no quotations sent",
    )
    if (won.length) parts.push(`${won.length} won, ${formatCurrency(wonValue, { compact: true })}`)
  }

  const today: string[] = []
  if (waiting) today.push(`${plural(waiting, "lead")} waiting for a reply`)
  if (expiring) today.push(`${plural(expiring, "quote")} about to expire`)
  if (chase) today.push(`${plural(chase, "quote")} to chase`)

  const partial = now < dayEnd
  const yesterday = `Yesterday${partial ? ` (as of ${clock(now)})` : ""}: ${parts.join(", ")}.`
  const body = today.length ? `${yesterday} Today: ${today.join(", ")}.` : `${yesterday} Nothing waiting on you. A good day to follow up.`

  return {
    title: leads.length || issued.length ? "Your daily sales update" : "Your daily update",
    body,
    figures: {
      leads: leads.length,
      web,
      voice,
      quoted: issued.length,
      quotedValue,
      won: won.length,
      wonValue,
      waiting,
      expiring,
      chase,
    },
  }
}
