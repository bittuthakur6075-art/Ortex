// AI telecaller — shared engine used by telecaller-dial, telecaller-engine and
// telecaller-webhook.
//
// The console queues JOBS ("follow up this lead", "feedback call for this
// invoice", "upsell this customer"). This module turns a job into a CALL:
//
//   brief    → gather everything we know about the person (lead, enquiries,
//              invoices, earlier calls) plus the catalogue, and write the
//              agent's system prompt + opening line for THIS call.
//   dial     → hand the brief to a telephony provider. Two are wired:
//                vapi      real outbound phone call (api.vapi.ai); the result
//                          arrives later on telecaller-webhook.
//                simulate  no phone at all — Gemini role-plays the customer so
//                          the whole pipeline can be exercised end to end
//                          before a number is bought. Completes synchronously.
//   finalize → analyse the transcript with Gemini into a structured outcome,
//              store it on the call, roll it up to the job, update the lead /
//              enquiry it came from, and queue whatever comes next (callback,
//              retry, follow-up round, feedback, upsell).
//   sweep    → the cron tick: auto-queue new leads, feedback and upsell jobs
//              from the rest of the data, then dial whatever is due inside
//              calling hours and under the daily cap.
//
// Secrets (Deno.env): GEMINI_API_KEY (required), VAPI_API_KEY +
// VAPI_PHONE_NUMBER_ID (real calls), VAPI_ASSISTANT_ID (optional, use a
// dashboard-built assistant for voice/transcriber), TELECALLER_WEBHOOK_SECRET
// (shared secret the webhook checks).

import { generateContent, extractText, logAiUsage } from "./gemini.ts"
import type { Db } from "./auth.ts"
import { DEFAULT_SCRIPTS } from "./telecallerScripts.ts"
import { calendarBrief, parseCustomOccasions } from "./telecallerCalendar.ts"
import { ensurePulse } from "./telecallerPulse.ts"
import { detectRegion, regionBrief } from "./telecallerRegion.ts"

// deno-lint-ignore no-explicit-any
export type Doc = Record<string, any>
export type Row = { id: string; doc: Doc; created_at: string; updated_at: string }

export const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash"

// Mirrors src/data/domain/telecallerLanguages.js. `name` is what the prompt
// says; `speech` the TTS locale; `stt` the Deepgram code for Vapi calls
// ("multi" = language-agnostic model, needed for auto and regional languages).
export const LANGUAGES: Record<string, { name: string; speech: string; stt: string; opener: string }> = {
  auto: { name: "Hinglish, switching to whatever language the customer speaks", speech: "hi-IN", stt: "multi", opener: "hi" },
  hinglish: { name: "Hinglish (Hindi with English business words)", speech: "hi-IN", stt: "hi", opener: "hi" },
  hi: { name: "Hindi", speech: "hi-IN", stt: "hi", opener: "hi" },
  en: { name: "Indian English", speech: "en-IN", stt: "en-IN", opener: "en" },
  bn: { name: "Bengali", speech: "bn-IN", stt: "multi", opener: "model" },
  ta: { name: "Tamil", speech: "ta-IN", stt: "multi", opener: "model" },
  te: { name: "Telugu", speech: "te-IN", stt: "multi", opener: "model" },
  mr: { name: "Marathi", speech: "mr-IN", stt: "multi", opener: "model" },
  gu: { name: "Gujarati", speech: "gu-IN", stt: "multi", opener: "model" },
  kn: { name: "Kannada", speech: "kn-IN", stt: "multi", opener: "model" },
  ml: { name: "Malayalam", speech: "ml-IN", stt: "multi", opener: "model" },
  pa: { name: "Punjabi", speech: "hi-IN", stt: "multi", opener: "model" },
  or: { name: "Odia", speech: "hi-IN", stt: "multi", opener: "model" },
  as: { name: "Assamese", speech: "hi-IN", stt: "multi", opener: "model" },
  ur: { name: "Urdu", speech: "hi-IN", stt: "multi", opener: "model" },
}
export const languageOf = (id: string) => LANGUAGES[id] || LANGUAGES.auto

// ---- settings ---------------------------------------------------------------
// Mirrors DEFAULT_SETTINGS.telecaller in src/data/domain/settingsDefaults.js.
export const DEFAULT_TELECALLER = {
  enabled: false,
  provider: "simulate",
  agentName: "Sneha",
  language: "auto",
  callingHours: { start: "10:00", end: "19:00" },
  timezone: "Asia/Kolkata",
  dailyCap: 40,
  maxAttempts: 3,
  retryGapHours: 24,
  autoQueueNewLeads: true,
  followUp: { enabled: true, delayHours: 24, maxRounds: 3 },
  feedback: { enabled: true, daysAfterInvoice: 7 },
  upsell: { enabled: true, daysAfterInvoice: 30, repeatEveryDays: 90 },
  pitchNotes: "",
  // Team-added occasions, one per line: "YYYY-MM-DD Name — what to pitch".
  occasions: "",
  doNotCall: [] as string[],
  // Training: free-text overrides written by the team. `persona` is appended to
  // the identity block; the per-kind entries REPLACE the default objective.
  scripts: { ...DEFAULT_SCRIPTS } as Record<string, string>,
}
export type TelecallerSettings = typeof DEFAULT_TELECALLER

export async function loadSettings(db: Db): Promise<{ telecaller: TelecallerSettings; company: Doc }> {
  const { data } = await db.from("settings").select("doc").eq("id", true).maybeSingle()
  const saved = (data?.doc?.telecaller || {}) as Partial<TelecallerSettings>
  const telecaller: TelecallerSettings = {
    ...DEFAULT_TELECALLER,
    ...saved,
    callingHours: { ...DEFAULT_TELECALLER.callingHours, ...saved.callingHours },
    followUp: { ...DEFAULT_TELECALLER.followUp, ...saved.followUp },
    feedback: { ...DEFAULT_TELECALLER.feedback, ...saved.feedback },
    upsell: { ...DEFAULT_TELECALLER.upsell, ...saved.upsell },
    doNotCall: Array.isArray(saved.doNotCall) ? saved.doNotCall.map(normalizePhone).filter(Boolean) : [],
    scripts: Object.fromEntries(Object.keys(DEFAULT_SCRIPTS).map((k) => [k, String(saved.scripts?.[k] || "").trim() || DEFAULT_SCRIPTS[k]])),
  }
  return { telecaller, company: data?.doc?.company || {} }
}

// ---- phones & time ----------------------------------------------------------
export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D+/g, "")
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2)
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
  return d
}
export const isIndianMobile = (d: string) => /^[6-9]\d{9}$/.test(d)
export const toE164 = (d: string) => (d.length === 10 ? `+91${d}` : `+${d}`)

/** "HH:MM" clock in the configured timezone, plus weekday (0 = Sunday). */
function localClock(tz: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ""
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))
  return { hhmm: `${get("hour")}:${get("minute")}`, weekday }
}

export function withinCallingHours(s: TelecallerSettings, at = new Date()): boolean {
  const { hhmm, weekday } = localClock(s.timezone || "Asia/Kolkata", at)
  if (weekday === 0) return false // never on Sunday
  return hhmm >= (s.callingHours.start || "10:00") && hhmm < (s.callingHours.end || "19:00")
}

/** Next instant inside calling hours at or after `from`. */
export function nextCallingSlot(s: TelecallerSettings, from = new Date()): Date {
  const t = new Date(from)
  for (let i = 0; i < 24 * 8; i++) {
    if (withinCallingHours(s, t)) return t
    t.setTime(t.getTime() + 30 * 60 * 1000)
    t.setSeconds(0, 0)
  }
  return from
}

const hours = (h: number) => h * 60 * 60 * 1000
const days = (d: number) => d * 24 * 60 * 60 * 1000
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n)

// ---- data access ------------------------------------------------------------
const rows = (r: Row[] | null | undefined) => (r || []).map((x) => ({ ...x.doc, id: x.id, createdAt: x.created_at }))

async function all(db: Db, table: string, limit = 2000): Promise<Doc[]> {
  const { data, error } = await db.from(table).select("*").order("created_at", { ascending: false }).limit(limit)
  if (error) throw new Error(`${table}: ${error.message}`)
  return rows(data as Row[])
}

export async function getDoc(db: Db, table: string, id: string): Promise<Doc | null> {
  const { data } = await db.from(table).select("*").eq("id", id).maybeSingle()
  return data ? { ...(data as Row).doc, id: (data as Row).id, createdAt: (data as Row).created_at } : null
}

export async function patchDoc(db: Db, table: string, id: string, patch: Doc): Promise<Doc | null> {
  const existing = await getDoc(db, table, id)
  if (!existing) return null
  const { id: _i, createdAt: _c, ...doc } = existing
  const { id: _pi, createdAt: _pc, ...p } = patch
  const { data, error } = await db.from(table).update({ doc: { ...doc, ...p } }).eq("id", id).select("*").single()
  if (error) throw new Error(`${table} update: ${error.message}`)
  return { ...(data as Row).doc, id: (data as Row).id, createdAt: (data as Row).created_at }
}

export async function insertDoc(db: Db, table: string, doc: Doc): Promise<Doc> {
  const { data, error } = await db.from(table).insert({ doc }).select("*").single()
  if (error) throw new Error(`${table} insert: ${error.message}`)
  return { ...(data as Row).doc, id: (data as Row).id, createdAt: (data as Row).created_at }
}

// ---- job model --------------------------------------------------------------
export type JobKind = "followup" | "pitch" | "feedback" | "upsell" | "manual"
export type Outcome =
  | "deal_closed" | "interested" | "needs_quote" | "callback" | "not_interested"
  | "no_answer" | "busy" | "voicemail" | "wrong_number" | "complaint" | "do_not_call" | "failed"

const OPEN_JOB = ["queued", "dialing", "in_progress"]

export function newJob(input: Doc): Doc {
  const phone = normalizePhone(input.phone)
  return {
    kind: (input.kind || "followup") as JobKind,
    status: "queued",
    phone,
    contactName: clip(input.contactName, 120),
    company: clip(input.company, 160),
    leadId: input.leadId || null,
    enquiryId: input.enquiryId || null,
    customerId: input.customerId || null,
    invoiceId: input.invoiceId || null,
    objective: clip(input.objective, 600),
    context: input.context || {},
    scheduledAt: input.scheduledAt || new Date().toISOString(),
    attempts: 0,
    maxAttempts: Number(input.maxAttempts) || DEFAULT_TELECALLER.maxAttempts,
    round: Number(input.round) || 1,
    source: clip(input.source || "manual", 40),
    createdBy: input.createdBy || "engine",
    lastCallId: null,
    result: null,
  }
}

// ---- brief ------------------------------------------------------------------
const KIND_OBJECTIVE: Record<string, string> = {
  followup: "FOLLOW-UP SALES CALL. They enquired recently. Reconnect warmly, confirm the requirement (items, quantities, timeline, delivery city, logo ready?), answer doubts, handle objections, and CLOSE: get a yes to start the free mockup and a quotation on WhatsApp, or book a specific callback time.",
  pitch: "OUTBOUND PITCH. Introduce Ortex briefly, discover their use-case, recommend the right product, and move them to a free mockup + quotation. Book a callback if they are busy.",
  feedback: "POST-DELIVERY FEEDBACK CALL. Thank them for the order, ask how the products and the experience were (quality, packaging, on-time), capture a 1-5 rating and any issue. If anything is wrong, apologise, note it precisely for the team, and promise a human callback. If they are happy, ask for a Google review / referral and mention the team can help with their next event or festival gifting.",
  upsell: "RELATIONSHIP + UPSELL CALL to an existing customer. Reference their last order specifically. Ask what is coming up (events, joining kits, Diwali / New Year gifting, exhibitions), suggest one or two matching add-ons or a reorder at better volume rates, and close on a free mockup + quotation or a callback. Build trust; never pushy.",
  manual: "SALES CALL as briefed by the team. Follow the objective given below.",
}

function itemsLine(items: Doc[] | undefined): string {
  if (!Array.isArray(items) || !items.length) return ""
  return items.map((i) => `${i.product || i.description || i.name || "item"} × ${i.quantity ?? "?"}`).join(", ")
}

export type Brief = { systemPrompt: string; firstMessage: string; contextText: string; agentName: string }

export async function buildBrief(db: Db, job: Doc, settings: TelecallerSettings, company: Doc): Promise<Brief> {
  const phone = job.phone
  const [lead, enquiry, invoice, products, priorCalls, leads, enquiries, invoices, pulse] = await Promise.all([
    job.leadId ? getDoc(db, "leads", job.leadId) : null,
    job.enquiryId ? getDoc(db, "enquiries", job.enquiryId) : null,
    job.invoiceId ? getDoc(db, "invoices", job.invoiceId) : null,
    all(db, "products", 300),
    all(db, "telecaller_calls", 400),
    all(db, "leads", 1500),
    all(db, "enquiries", 1500),
    all(db, "invoices", 1500),
    ensurePulse(db),
  ])

  const samePhone = (d: Doc) => normalizePhone(d?.customer?.phone) === phone
  const history: string[] = []
  for (const l of leads.filter(samePhone).slice(0, 3)) {
    history.push(`Lead (${l.stage || "new"}): ${l.productInterest || ""} ${l.quantityEstimate ? "qty " + l.quantityEstimate : ""} ${l.notes ? "— " + clip(l.notes, 200) : ""}`.trim())
    for (const a of (l.activities || []).slice(-3)) history.push(`  • ${a.type || "Note"}: ${clip(a.summary, 160)}`)
  }
  for (const e of enquiries.filter(samePhone).slice(0, 3)) {
    history.push(`Enquiry via ${e.source || "website"} (${e.status || "new"}): ${e.productInterest || ""} — ${clip(e.message, 240)}`)
  }
  for (const inv of invoices.filter(samePhone).slice(0, 3)) {
    const total = inv.totals?.grandTotal
    history.push(`Order ${inv.number || ""} on ${String(inv.issueDate || inv.createdAt || "").slice(0, 10)} (${inv.status || ""}): ${itemsLine(inv.lines) || "see invoice"}${total ? `, ₹${Math.round(total)}` : ""}`)
  }
  for (const c of priorCalls.filter((c) => c.phone === phone && c.analysis).slice(0, 3)) {
    history.push(`Earlier AI call (${c.analysis.outcome}): ${clip(c.analysis.summary || c.summary, 220)}`)
  }

  const ctx = job.context || {}
  const people = [lead?.customer, enquiry?.customer, invoice?.customer, ...leads.filter(samePhone).map((l) => l.customer), ...enquiries.filter(samePhone).map((e) => e.customer), ...invoices.filter(samePhone).map((i) => i.customer)].filter(Boolean)
  const region = detectRegion({
    stateCodes: [...people.map((c) => c.stateCode), ...people.map((c) => c.gstin), invoice?.shipTo?.stateCode],
    texts: [ctx.city, ...people.map((c) => c.address), invoice?.shipTo?.address, job.company, ...people.map((c) => c.company)],
    priorLanguage: priorCalls.find((c) => c.phone === phone && c.analysis?.language)?.analysis?.language || null,
  })
  const regionHints = region ? [...region.hints, region.language] : []
  const target = [
    `Name: ${job.contactName || lead?.customer?.name || enquiry?.customer?.name || "unknown (ask politely)"}`,
    job.company || lead?.customer?.company || enquiry?.customer?.company ? `Company: ${job.company || lead?.customer?.company || enquiry?.customer?.company}` : "",
    ctx.items?.length ? `Requirement: ${itemsLine(ctx.items)}` : ctx.productInterest ? `Requirement: ${ctx.productInterest}${ctx.quantity ? " × " + ctx.quantity : ""}` : "",
    ctx.timeline ? `Timeline: ${ctx.timeline}` : "",
    ctx.city ? `Delivery city: ${ctx.city}` : "",
    ctx.summary ? `Notes: ${clip(ctx.summary, 400)}` : "",
    invoice ? `This call is about order ${invoice.number || ""}: ${itemsLine(invoice.lines)}` : "",
  ].filter(Boolean).join("\n")

  const catalogue = products
    .filter((p) => p.status !== "archived")
    .slice(0, 80)
    .map((p) => `- ${p.name}${p.category ? ` (${p.category})` : ""}${p.moq ? `, MOQ ${p.moq}` : ""}${p.leadTimeDays ? `, ~${p.leadTimeDays} days` : ""}`)
    .join("\n")

  const L = languageOf(settings.language)
  const lang = settings.language === "auto"
    ? "Open in natural Hinglish (conversational Hindi with English product and business words). Then MATCH THE CUSTOMER: if they answer in Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, English or any other language, switch fully to that language for the rest of the call and stay in it. Keep product names and business words (mockup, quotation, GST invoice, MOQ, delivery) in English in every language."
    : settings.language === "en"
      ? "Speak natural Indian English throughout."
      : settings.language === "hi"
        ? "Speak warm, conversational Hindi (English is fine for product and business words). Switch to English only if the customer clearly prefers it."
        : settings.language === "hinglish"
          ? "Speak natural Hinglish: conversational Hindi with English product and business words, the way Indian sales people actually talk. Switch fully to English if the customer prefers it."
          : `Speak ${L.name} throughout, naturally and respectfully, keeping product and business words (mockup, quotation, GST invoice, MOQ, delivery) in English. If the customer clearly prefers Hindi or English, switch to that.`

  const agentName = settings.agentName || "Sneha"
  const contextText = [target, history.length ? "\nHISTORY:\n" + history.join("\n") : ""].join("\n").trim()

  const systemPrompt = `You are "${agentName}", the AI sales telecaller of ${company.name || "Ortex Industries"}, a New Delhi manufacturer of fully customised products (keychains, acrylic and MDF items, lanyards, badges, clocks, corporate gift sets, OEM/white-label), made in-house. You are on an OUTBOUND PHONE CALL that you placed.

# THIS CALL
${clip(settings.scripts?.[job.kind], 4000).trim() || DEFAULT_SCRIPTS[job.kind] || KIND_OBJECTIVE[job.kind] || KIND_OBJECTIVE.manual}
${job.objective ? `Team's objective for this call: ${job.objective}` : ""}

# WHO YOU ARE CALLING
${contextText || "No prior details — discover the requirement."}

# HOW YOU SOUND (team training)
${clip(settings.scripts?.persona?.trim() || DEFAULT_SCRIPTS.persona, 4000)}

# LANGUAGE & DELIVERY
- ${lang}
- You are speaking out loud: one or two short sentences per turn, ONE question at a time. Never read lists, prices tables or URLs.
- Open by confirming you are speaking to the right person, say who you are and why you called in one line, and ask if it is a good time. If not, book a specific callback time and end politely.
- Use their name once you know it. React like a human ("Bilkul", "Great choice", "Samajh gayi").

# SALES EXPERTISE
- Consultative, confident, never pushy. Discover use-case, quantity, timeline, logo readiness. Recommend the best fit and say why.
- Grow the order naturally (lanyards + ID holders + badges; gift hampers with bottles, diaries, pens, keychains). Bigger quantities get better factory-direct rates.
- Objections: price → factory-direct, no middleman, volume rates, free mockup, sample before bulk. Trust → 10+ years, 1,200+ brands, 98% on-time, in-house QC. MOQ → low and flexible. Timeline → lead time 4-12 working days after artwork approval, so share the logo early.
- Do NOT quote fixed prices. Move pricing to a proper quotation: "team will WhatsApp a free mockup and the best price".
- Complaints / order problems: listen, apologise, note exact details, promise a human callback the same day. Do not argue.
- If they ask not to be called again, respect it immediately and end warmly.

# CUSTOMER REGION
${regionBrief(region, settings.language === "auto")}

# TODAY, TIME AND UPCOMING OCCASIONS
${calendarBrief({
    hints: [...regionHints, job.context?.city, lead?.customer?.address, enquiry?.customer?.address, invoice?.customer?.address, invoice?.shipTo?.address, job.company].filter(Boolean).map(String),
    custom: parseCustomOccasions(settings.occasions),
  })}

${pulse ? `# INDIA BUSINESS PULSE (research desk, ${pulse.at.slice(0, 10)})\n${clip(pulse.text, 3000)}\nUse at most ONE of these as a natural conversation opener or to relate the customer's plans to what is happening; never recite it, never quote stock levels.\n` : ""}
# REFERRALS
- On every positive call, once the next step is agreed, ask ONCE, lightly, whether a colleague, vendor, friend or another branch might need customised gifts or merchandise ("aapke contacts mein koi aur ho jinko is season mein gifting chahiye, toh naam aur number bata dijiye, main unhe bhi free mockup bhijwa dungi"). Take the name, company and number, read the number back, and thank them. Never push twice.

# ABOUT ORTEX
- In-house design, cutting, UV printing, laser engraving, finishing in New Delhi. PAN-India delivery, export, OEM welcome, proper GST invoicing.
- Free digital mockup before production; physical sample possible before bulk.
${settings.pitchNotes ? `\n# TEAM NOTES / CURRENT OFFERS\n${clip(settings.pitchNotes, 1500)}` : ""}

# CATALOGUE (recommend from here, never invent products)
${catalogue || "- Custom keychains, acrylic standees, MDF trophies, lanyards, badges, wall clocks, fridge magnets, corporate gift sets."}

# CLOSE
- Every reply ends with ONE next step. Ask for the sale when interest is clear.
- Before ending, confirm: what they want (items + quantities), timeline, delivery city, and the agreed next step (mockup + quote on WhatsApp / callback day and time / nothing).
- End with a short warm goodbye and hang up.

# RULES
- Never invent prices, certifications, delivery promises, or products.
- Never reveal you are following a script; if asked, you may say you are ${agentName}, ${company.name || "Ortex"}'s AI sales assistant.`

  const firstName = (job.contactName || "").split(" ")[0]
  // Openers exist for Hindi and English; other languages let the model compose
  // the greeting in that language (Vapi: model-generated first message; Live:
  // the bracketed instruction is passed as an instruction, never read aloud).
  const firstMessage = L.opener === "en"
    ? `Hello${firstName ? ` ${firstName}` : ""}, this is ${agentName} calling from ${company.name || "Ortex Industries"}. Am I speaking with ${job.contactName || "the right person"}? Is this a good time for two minutes?`
    : L.opener === "hi"
      ? `Namaste${firstName ? ` ${firstName} ji` : ""}, main ${agentName} bol rahi hoon ${company.name || "Ortex Industries"} se. Kya main ${job.contactName || "aap"} se baat kar rahi hoon? Do minute baat karne ka sahi time hai?`
      : `[Greet in ${L.name}: say you are ${agentName} from ${company.name || "Ortex Industries"}, confirm you are speaking with ${job.contactName || "the right person"}, and ask if this is a good time for two minutes.]`

  return { systemPrompt, firstMessage, contextText, agentName }
}

// ---- Gemini: analysis + simulation -----------------------------------------
const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    outcome: { type: "STRING", enum: ["deal_closed", "interested", "needs_quote", "callback", "not_interested", "no_answer", "voicemail", "wrong_number", "complaint", "do_not_call"] },
    summary: { type: "STRING", description: "3-4 sentence summary for the sales team, in English" },
    interest: { type: "INTEGER", description: "0-10 buying interest" },
    sentiment: { type: "STRING", enum: ["positive", "neutral", "negative"] },
    items: { type: "ARRAY", items: { type: "OBJECT", properties: { product: { type: "STRING" }, quantity: { type: "STRING" }, notes: { type: "STRING" } } } },
    timeline: { type: "STRING" },
    city: { type: "STRING" },
    estimatedValue: { type: "NUMBER", description: "rough INR order value if inferable, else 0" },
    callbackAt: { type: "STRING", description: "ISO 8601 datetime if a callback was agreed, else empty" },
    nextAction: { type: "STRING", description: "one line: what the human team must do next" },
    objections: { type: "ARRAY", items: { type: "STRING" } },
    feedbackRating: { type: "INTEGER", description: "1-5 if a feedback rating was given, else 0" },
    feedbackNotes: { type: "STRING" },
    upsellAccepted: { type: "BOOLEAN" },
    sendWhatsapp: { type: "BOOLEAN", description: "true if the customer expects a mockup/quote on WhatsApp" },
    language: { type: "STRING", description: "language the CUSTOMER mainly spoke: one of hi, en, bn, ta, te, mr, gu, kn, ml, pa, or, as, ur, hinglish" },
    referrals: { type: "ARRAY", description: "people the customer referred, with a phone number if given", items: { type: "OBJECT", properties: { name: { type: "STRING" }, phone: { type: "STRING" }, company: { type: "STRING" }, note: { type: "STRING" } } } },
  },
  required: ["outcome", "summary", "interest", "sentiment", "nextAction"],
}

export async function analyzeTranscript(transcriptText: string, job: Doc, endedReason = ""): Promise<Doc> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  const fallback = { outcome: transcriptText.trim() ? "interested" : "no_answer", summary: transcriptText ? "Transcript recorded; automatic analysis unavailable." : "No conversation captured.", interest: 0, sentiment: "neutral", nextAction: "Review the transcript.", items: [] }
  if (!apiKey) return fallback
  if (!transcriptText.trim()) return { ...fallback, outcome: /busy/i.test(endedReason) ? "busy" : /voicemail/i.test(endedReason) ? "voicemail" : "no_answer" }

  const now = new Date().toISOString()
  const prompt = `You are the sales operations analyst for Ortex Industries. Read this outbound telecaller transcript and return a strict JSON analysis.
Call type: ${job.kind}. Contact: ${job.contactName || "unknown"}. Now: ${now} (Asia/Kolkata). Provider ended reason: ${endedReason || "n/a"}.
Capture any referral the customer gave (name, company, phone) in referrals. Rules: "deal_closed" only if the customer clearly agreed to proceed with the order / mockup + quotation with quantities. "callback" when a specific later time was agreed (fill callbackAt in ISO with +05:30). "complaint" for any delivery/quality/service problem. "do_not_call" if they asked never to be called. Wrong person = "wrong_number". Silence / only the agent speaking = "no_answer".

TRANSCRIPT:
${clip(transcriptText, 24000)}`

  const res = await generateContent(MODEL, apiKey, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: ANALYSIS_SCHEMA, temperature: 0.2 },
  })
  if (!res.ok) { console.error("analysis failed", res.status, await res.text().catch(() => "")); return fallback }
  const data = await res.json()
  await logAiUsage("telecaller-analysis", MODEL, data?.usageMetadata)
  try {
    const parsed = JSON.parse(extractText(data))
    return { ...fallback, ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [], referrals: Array.isArray(parsed.referrals) ? parsed.referrals : [] }
  } catch {
    return fallback
  }
}

/** Gemini role-plays a realistic customer against the brief. Returns turns. */
export async function simulateConversation(brief: Brief, job: Doc): Promise<{ turns: { role: string; text: string }[]; endedReason: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set — the simulator needs Gemini.")
  const moods = ["busy but curious", "warm and ready to order", "price-sensitive and comparing vendors", "happy repeat customer", "had a small delivery issue last time", "wants to think and asks for a callback", "wrong person picks up"]
  const mood = moods[Math.floor(Math.random() * moods.length)]
  const prompt = `Simulate a realistic Indian B2B phone call for testing a telecaller AI. Produce the FULL conversation as JSON: {"turns":[{"role":"agent"|"customer","text":"..."}],"endedReason":"customer-ended-call"|"agent-ended-call"}.
The AGENT must follow this system prompt exactly (language, one question at a time, closing behaviour):
<<<
${brief.systemPrompt}
>>>
The agent's first line is: "${brief.firstMessage}"
The CUSTOMER is: ${job.contactName || "a business buyer"}, mood: ${mood}. Make them talk like a real Indian buyer (short answers, some Hinglish, realistic objections, may share quantities/timeline/city). 10 to 22 turns total, ending with goodbyes.`
  const res = await generateContent(MODEL, apiKey, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
  })
  if (!res.ok) throw new Error(`Simulator: Gemini ${res.status} ${await res.text().catch(() => "")}`)
  const data = await res.json()
  await logAiUsage("telecaller-simulate", MODEL, data?.usageMetadata)
  const parsed = JSON.parse(extractText(data))
  const turns = (Array.isArray(parsed.turns) ? parsed.turns : [])
    .map((t: Doc) => ({ role: t.role === "customer" ? "customer" : "agent", text: clip(t.text, 600) }))
  return { turns, endedReason: `simulated:${mood}` }
}

export const transcriptToText = (turns: { role: string; text: string }[]) =>
  turns.map((t) => `${t.role === "customer" ? "Customer" : "Agent"}: ${t.text}`).join("\n")

// ---- provider: Vapi ---------------------------------------------------------
export function vapiConfigured() {
  return Boolean(Deno.env.get("VAPI_API_KEY") && Deno.env.get("VAPI_PHONE_NUMBER_ID"))
}

async function startVapiCall(job: Doc, brief: Brief, settings: TelecallerSettings, callId: string): Promise<{ providerCallId: string; raw: Doc }> {
  const apiKey = Deno.env.get("VAPI_API_KEY")!
  const phoneNumberId = Deno.env.get("VAPI_PHONE_NUMBER_ID")!
  const assistantId = Deno.env.get("VAPI_ASSISTANT_ID")
  const serverUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telecaller-webhook`
  const secret = Deno.env.get("TELECALLER_WEBHOOK_SECRET") || ""
  const L = languageOf(settings.language)
  const modelOpener = L.opener === "model"

  const assistantCore: Doc = {
    // For languages without a canned opener the model composes the greeting in
    // that language; the bracketed instruction is never read aloud.
    ...(modelOpener ? { firstMessageMode: "assistant-speaks-first-with-model-generated-message" } : { firstMessage: brief.firstMessage }),
    model: {
      provider: "google",
      model: "gemini-2.5-flash",
      temperature: 0.6,
      messages: [{ role: "system", content: brief.systemPrompt }],
    },
    // Supabase's gateway wants a JWT on every function call, so Vapi sends the
    // anon key; our own auth is the shared secret it echoes in x-vapi-secret.
    server: {
      url: serverUrl,
      secret,
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}` },
    },
    serverMessages: ["end-of-call-report", "status-update"],
    endCallFunctionEnabled: true,
    maxDurationSeconds: 600,
    silenceTimeoutSeconds: 20,
    metadata: { callId, jobId: job.id, kind: job.kind },
  }
  const body: Doc = {
    phoneNumberId,
    customer: { number: toE164(job.phone), name: job.contactName || undefined },
    metadata: { callId, jobId: job.id, kind: job.kind },
  }
  if (assistantId) {
    // Voice / transcriber / recording come from the dashboard assistant; we only
    // swap in this call's brief.
    body.assistantId = assistantId
    body.assistantOverrides = assistantCore
  } else {
    body.assistant = {
      name: brief.agentName,
      ...assistantCore,
      // "multi" = Deepgram's language-agnostic model: needed for auto-detect and
      // regional languages, slightly pricier per minute than a fixed language.
      transcriber: L.stt === "multi" ? { provider: "deepgram", model: "nova-3", language: "multi" } : { provider: "deepgram", model: "nova-2", language: L.stt },
      // Google's multilingual voices speak every Indian language above; a fixed
      // Azure voice would only cover Hindi and English.
      voice: { provider: "google", voiceId: L.speech === "en-IN" ? "en-IN-Chirp3-HD-Aoede" : "hi-IN-Chirp3-HD-Aoede" },
      recordingEnabled: true,
    }
  }
  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const raw = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Vapi ${res.status}: ${raw?.message || JSON.stringify(raw)}`)
  return { providerCallId: String(raw.id || ""), raw }
}

// ---- dial -------------------------------------------------------------------
export type DialResult = { callId: string; status: string; simulated: boolean; analysis?: Doc; error?: string }

/**
 * Browser practice call (Gemini Live in the console). Step 1: the brief for a
 * job. Step 2 (recordLiveCall): the transcript the browser captured is stored
 * and analysed exactly like a phone call, so the lead / next job move too.
 */
export async function briefForJob(db: Db, jobId: string): Promise<{ job: Doc; brief: Brief; settings: TelecallerSettings }> {
  const job = await getDoc(db, "telecaller_jobs", jobId)
  if (!job) throw new Error("Job not found")
  const { telecaller: settings, company } = await loadSettings(db)
  const brief = await buildBrief(db, job, settings, company)
  return { job, brief, settings }
}

export async function recordLiveCall(db: Db, jobId: string, input: { transcript: { role: string; text: string }[]; durationSec?: number; startedAt?: string; practice?: boolean; by?: string; recordingPath?: string }): Promise<{ callId: string; analysis: Doc }> {
  const job = await getDoc(db, "telecaller_jobs", jobId)
  if (!job) throw new Error("Job not found")
  const { telecaller: settings, company } = await loadSettings(db)
  const brief = await buildBrief(db, job, settings, company)
  const call = await insertDoc(db, "telecaller_calls", {
    jobId, kind: job.kind, phone: job.phone, contactName: job.contactName,
    provider: "live", simulated: input.practice !== false, practice: input.practice !== false, by: input.by || "",
    status: "dialing", attempt: (job.attempts || 0) + 1,
    startedAt: input.startedAt || new Date().toISOString(), endedAt: null, durationSec: input.durationSec || 0,
    providerCallId: null, brief: { firstMessage: brief.firstMessage, context: brief.contextText },
    recordingPath: input.recordingPath && /^[\w./-]{1,200}$/.test(input.recordingPath) ? input.recordingPath : null,
    transcript: [], transcriptText: "", analysis: null,
  })
  await patchDoc(db, "telecaller_jobs", jobId, { status: "in_progress", attempts: (job.attempts || 0) + 1, lastCallId: call.id, lastAttemptAt: new Date().toISOString() })
  const analysis = await finalizeCall(db, call.id, { transcript: input.transcript, endedReason: "browser-practice", durationSec: input.durationSec || 0, startedAt: input.startedAt })
  return { callId: call.id, analysis }
}

/**
 * Place the call for a job. Simulated calls complete here; real calls return
 * once the provider has accepted the dial and finish on the webhook.
 */
export async function dialJob(db: Db, jobId: string, opts: { force?: boolean; provider?: string } = {}): Promise<DialResult> {
  const job = await getDoc(db, "telecaller_jobs", jobId)
  if (!job) throw new Error("Job not found")
  if (!OPEN_JOB.includes(job.status) && !opts.force) throw new Error(`Job is ${job.status}`)
  if (!isIndianMobile(job.phone)) throw new Error("Phone is not a valid 10-digit Indian mobile")

  const { telecaller: settings, company } = await loadSettings(db)
  if (settings.doNotCall.includes(job.phone)) {
    await patchDoc(db, "telecaller_jobs", jobId, { status: "skipped", result: { outcome: "do_not_call", summary: "Number is on the do-not-call list." } })
    throw new Error("Number is on the do-not-call list")
  }
  const provider = opts.provider || settings.provider || "simulate"
  if (provider === "vapi" && !vapiConfigured()) throw new Error("Vapi is not configured (VAPI_API_KEY / VAPI_PHONE_NUMBER_ID).")

  const brief = await buildBrief(db, job, settings, company)
  const call = await insertDoc(db, "telecaller_calls", {
    jobId,
    kind: job.kind,
    phone: job.phone,
    contactName: job.contactName,
    provider,
    simulated: provider === "simulate",
    status: "dialing",
    attempt: (job.attempts || 0) + 1,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationSec: 0,
    providerCallId: null,
    brief: { firstMessage: brief.firstMessage, context: brief.contextText },
    transcript: [],
    transcriptText: "",
    analysis: null,
  })
  await patchDoc(db, "telecaller_jobs", jobId, {
    status: "in_progress",
    attempts: (job.attempts || 0) + 1,
    lastCallId: call.id,
    lastAttemptAt: new Date().toISOString(),
  })

  if (provider === "simulate") {
    try {
      const started = Date.now()
      const { turns, endedReason } = await simulateConversation(brief, { ...job, id: jobId })
      const analysis = await finalizeCall(db, call.id, {
        transcript: turns,
        endedReason,
        durationSec: Math.round(turns.length * 9 + Math.random() * 30),
        startedAt: new Date(started).toISOString(),
      })
      return { callId: call.id, status: "completed", simulated: true, analysis }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await patchDoc(db, "telecaller_calls", call.id, { status: "failed", error: msg, endedAt: new Date().toISOString() })
      await patchDoc(db, "telecaller_jobs", jobId, { status: "queued", lastError: msg })
      return { callId: call.id, status: "failed", simulated: true, error: msg }
    }
  }

  try {
    const { providerCallId, raw } = await startVapiCall({ ...job, id: jobId }, brief, settings, call.id)
    await patchDoc(db, "telecaller_calls", call.id, { providerCallId, status: "ringing", providerRaw: { id: raw.id, status: raw.status } })
    return { callId: call.id, status: "ringing", simulated: false }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await patchDoc(db, "telecaller_calls", call.id, { status: "failed", error: msg, endedAt: new Date().toISOString() })
    await patchDoc(db, "telecaller_jobs", jobId, { status: "queued", lastError: msg })
    return { callId: call.id, status: "failed", simulated: false, error: msg }
  }
}

// ---- finalize ---------------------------------------------------------------
export type CallEnd = {
  transcript?: { role: string; text: string }[]
  transcriptText?: string
  endedReason?: string
  durationSec?: number
  startedAt?: string
  recordingUrl?: string
  cost?: number
  providerSummary?: string
}

export async function finalizeCall(db: Db, callId: string, end: CallEnd): Promise<Doc> {
  const call = await getDoc(db, "telecaller_calls", callId)
  if (!call) throw new Error("Call not found")
  if (call.status === "completed" && call.analysis) return call.analysis // webhook double-fire

  const job = (await getDoc(db, "telecaller_jobs", call.jobId)) || {}
  const turns = end.transcript || call.transcript || []
  const transcriptText = end.transcriptText || transcriptToText(turns)
  const analysis = await analyzeTranscript(transcriptText, { ...job, kind: call.kind }, end.endedReason)

  await patchDoc(db, "telecaller_calls", callId, {
    status: "completed",
    endedAt: new Date().toISOString(),
    startedAt: end.startedAt || call.startedAt,
    durationSec: end.durationSec ?? call.durationSec ?? 0,
    endedReason: end.endedReason || "",
    recordingUrl: end.recordingUrl || null,
    cost: end.cost ?? null,
    transcript: turns,
    transcriptText,
    summary: end.providerSummary || analysis.summary,
    analysis,
  })
  if (job.id) await applyOutcome(db, job, { ...call, id: callId }, analysis)
  return analysis
}

// ---- outcome → job / lead / enquiry / next job ------------------------------
async function applyOutcome(db: Db, job: Doc, call: Doc, a: Doc) {
  const { telecaller: s } = await loadSettings(db)
  const outcome = a.outcome as Outcome
  const now = new Date()
  const retryable = ["no_answer", "busy", "voicemail"].includes(outcome)
  const attemptsLeft = (job.attempts || 0) < (job.maxAttempts || s.maxAttempts)

  const result = {
    outcome, summary: a.summary, interest: a.interest, sentiment: a.sentiment, nextAction: a.nextAction,
    items: a.items || [], estimatedValue: a.estimatedValue || 0, callbackAt: a.callbackAt || null,
    feedbackRating: a.feedbackRating || 0, upsellAccepted: !!a.upsellAccepted, callId: call.id, at: now.toISOString(),
  }

  // 1. the job itself
  let jobStatus = "completed"
  let nextScheduled: string | null = null
  if (retryable && attemptsLeft) {
    jobStatus = "queued"
    nextScheduled = nextCallingSlot(s, new Date(now.getTime() + hours(s.retryGapHours))).toISOString()
  } else if (retryable) {
    jobStatus = "failed"
  }
  await patchDoc(db, "telecaller_jobs", job.id, {
    status: jobStatus,
    result,
    ...(nextScheduled ? { scheduledAt: nextScheduled } : {}),
  })

  // 2. do-not-call goes straight onto settings so nothing rings them again
  if (outcome === "do_not_call") {
    const { data } = await db.from("settings").select("doc").eq("id", true).maybeSingle()
    const doc = data?.doc || {}
    const list = new Set([...(doc.telecaller?.doNotCall || []).map(normalizePhone), job.phone])
    await db.from("settings").upsert({ id: true, doc: { ...doc, telecaller: { ...(doc.telecaller || {}), doNotCall: [...list] } } })
  }

  // 3. reflect on the CRM record the job came from
  const activity = {
    type: "Call", direction: "outbound", owner: `${s.agentName || "Sneha"} (AI)`, at: now.toISOString(),
    summary: `[${outcome.replace(/_/g, " ")}] ${a.summary}${a.nextAction ? ` Next: ${a.nextAction}` : ""}`,
  }
  const stageFor: Partial<Record<Outcome, string>> = {
    deal_closed: "negotiation", needs_quote: "qualified", interested: "contacted", callback: "contacted",
    not_interested: "lost", wrong_number: "lost", do_not_call: "lost",
  }
  if (job.leadId) {
    const lead = await getDoc(db, "leads", job.leadId)
    if (lead) {
      const patch: Doc = { activities: [...(lead.activities || []), activity], lastActivityAt: now.toISOString() }
      const stage = stageFor[outcome]
      const open = ["new", "contacted", "qualified", "quoted", "negotiation"]
      if (stage && open.includes(lead.stage) && !(stage === "contacted" && ["qualified", "quoted", "negotiation"].includes(lead.stage))) patch.stage = stage
      if (["not_interested", "wrong_number", "do_not_call"].includes(outcome)) patch.lostReason = outcome.replace(/_/g, " ")
      if (a.callbackAt) patch.nextFollowUp = a.callbackAt
      else if (["interested", "needs_quote", "deal_closed"].includes(outcome)) patch.nextFollowUp = new Date(now.getTime() + hours(s.followUp.delayHours)).toISOString()
      if (a.estimatedValue && !lead.estimatedValue) patch.estimatedValue = a.estimatedValue
      if (a.items?.length && !lead.productInterest) patch.productInterest = itemsLine(a.items)
      await patchDoc(db, "leads", job.leadId, patch)
    }
  }
  if (job.enquiryId) {
    const enq = await getDoc(db, "enquiries", job.enquiryId)
    if (enq) {
      const statusFor: Partial<Record<Outcome, string>> = { deal_closed: "qualified", needs_quote: "qualified", interested: "contacted", callback: "contacted", not_interested: "lost", wrong_number: "lost", do_not_call: "lost" }
      const next = statusFor[outcome]
      const patch: Doc = { notes: `${enq.notes ? enq.notes + "\n" : ""}${now.toISOString().slice(0, 16).replace("T", " ")} AI call (${outcome}): ${a.summary}` }
      if (next && ["new", "contacted"].includes(enq.status || "new")) patch.status = next
      await patchDoc(db, "enquiries", job.enquiryId, patch)
    }
  }
  if (job.invoiceId && (outcome === "complaint" || a.feedbackRating)) {
    const inv = await getDoc(db, "invoices", job.invoiceId)
    if (inv) await patchDoc(db, "invoices", job.invoiceId, { feedback: { rating: a.feedbackRating || 0, notes: a.feedbackNotes || a.summary, outcome, at: now.toISOString(), callId: call.id } })
  }

  // 3b. referrals become leads and get their own pitch call
  const referrals = (Array.isArray(a.referrals) ? a.referrals : []) as Doc[]
  if (referrals.length) {
    const existing = await all(db, "leads", 2000)
    const known = new Set(existing.map((l) => normalizePhone(l.customer?.phone)).filter(Boolean))
    let created = 0
    for (const r of referrals.slice(0, 5)) {
      const phone = normalizePhone(r.phone)
      if (!isIndianMobile(phone) || known.has(phone) || s.doNotCall.includes(phone) || phone === job.phone) continue
      known.add(phone)
      const referrer = job.contactName || job.company || "an existing customer"
      const lead = await insertDoc(db, "leads", {
        enquiryId: null,
        customer: { name: clip(r.name, 120), company: clip(r.company, 160), email: "", phone, gstin: "", stateCode: "", address: "" },
        source: "Referral (AI telecaller)",
        productInterest: clip(r.note, 200),
        quantityEstimate: "", estimatedValue: 0, stage: "new", score: 0, owner: "", nextFollowUp: null,
        lastActivityAt: now.toISOString(), lostReason: "", linkedQuotationId: null,
        activities: [{ type: "Note", direction: "inbound", owner: `${s.agentName || "Sneha"} (AI)`, at: now.toISOString(), summary: `Referred by ${referrer} on a ${job.kind} call. ${clip(r.note, 200)}` }],
        notes: `Referred by ${referrer}.`,
      })
      await insertDoc(db, "telecaller_jobs", newJob({
        kind: "pitch", phone, contactName: r.name, company: r.company, leadId: lead.id, source: "referral", createdBy: "engine", maxAttempts: s.maxAttempts,
        context: { productInterest: r.note, summary: `Referred by ${referrer}` },
        scheduledAt: nextCallingSlot(s, new Date(now.getTime() + hours(20))).toISOString(),
        objective: `Referral from ${referrer}: open by mentioning them ("${referrer} ne aapka number diya, unhone bola aapko bhi gifting chahiye ho sakti hai"). Discover the need and offer a free mockup.`,
      }))
      created += 1
    }
    if (created) await patchDoc(db, "telecaller_jobs", job.id, { result: { ...result, referralsCreated: created } })
  }

  // 4. what comes next
  if (jobStatus !== "completed") return
  const base = { phone: job.phone, contactName: job.contactName, company: job.company, leadId: job.leadId, enquiryId: job.enquiryId, customerId: job.customerId, invoiceId: job.invoiceId, createdBy: "engine" }
  const ctx = { ...(job.context || {}), items: a.items?.length ? a.items : job.context?.items, timeline: a.timeline || job.context?.timeline, city: a.city || job.context?.city, summary: a.summary }

  if (outcome === "callback" && a.callbackAt) {
    await insertDoc(db, "telecaller_jobs", newJob({ ...base, kind: job.kind === "manual" ? "followup" : job.kind, round: job.round, context: ctx, scheduledAt: nextCallingSlot(s, new Date(a.callbackAt)).toISOString(), source: "callback", objective: `Callback agreed on the previous call. ${a.nextAction || ""}`, maxAttempts: s.maxAttempts }))
  } else if (["interested", "needs_quote"].includes(outcome) && ["followup", "pitch", "upsell", "manual"].includes(job.kind) && s.followUp.enabled && (job.round || 1) < s.followUp.maxRounds) {
    await insertDoc(db, "telecaller_jobs", newJob({ ...base, kind: "followup", round: (job.round || 1) + 1, context: ctx, scheduledAt: nextCallingSlot(s, new Date(now.getTime() + hours(s.followUp.delayHours))).toISOString(), source: "followup-round", objective: `Round ${(job.round || 1) + 1}: check they received the mockup / quotation and close. Last time: ${a.nextAction || a.summary}`, maxAttempts: s.maxAttempts }))
  } else if (outcome === "deal_closed" && s.feedback.enabled) {
    await insertDoc(db, "telecaller_jobs", newJob({ ...base, kind: "feedback", context: ctx, scheduledAt: nextCallingSlot(s, new Date(now.getTime() + days(s.feedback.daysAfterInvoice + 7))).toISOString(), source: "deal-feedback", objective: "They agreed to order on the last call. Check the order went smoothly and collect feedback.", maxAttempts: 2 }))
  } else if (job.kind === "feedback" && s.upsell.enabled && outcome !== "complaint") {
    await insertDoc(db, "telecaller_jobs", newJob({ ...base, kind: "upsell", context: ctx, scheduledAt: nextCallingSlot(s, new Date(now.getTime() + days(Math.max(1, s.upsell.daysAfterInvoice - s.feedback.daysAfterInvoice)))).toISOString(), source: "feedback-upsell", objective: `Happy customer (feedback ${a.feedbackRating || "n/a"}/5). Suggest a reorder or add-ons for their next occasion.`, maxAttempts: 2 }))
  } else if (job.kind === "upsell" && s.upsell.enabled && !["not_interested", "callback", "do_not_call", "wrong_number", "complaint"].includes(outcome)) {
    await insertDoc(db, "telecaller_jobs", newJob({ ...base, kind: "upsell", context: ctx, scheduledAt: nextCallingSlot(s, new Date(now.getTime() + days(s.upsell.repeatEveryDays))).toISOString(), source: "upsell-cycle", objective: "Periodic relationship call. Ask about upcoming events / festival gifting and offer a reorder.", maxAttempts: 2 }))
  }
}

// ---- sweep (cron) -----------------------------------------------------------
export type SweepReport = { enqueued: Record<string, number>; dialed: number; skipped: string[]; errors: string[] }

export async function sweep(db: Db, opts: { force?: boolean; dial?: boolean } = {}): Promise<SweepReport> {
  const report: SweepReport = { enqueued: { followup: 0, feedback: 0, upsell: 0 }, dialed: 0, skipped: [], errors: [] }
  const { telecaller: s } = await loadSettings(db)
  await ensurePulse(db) // daily research brief, cheap, useful for practice calls too
  if (!s.enabled && !opts.force) { report.skipped.push("telecaller disabled in Settings"); return report }

  const [jobs, leads, enquiries, invoices] = await Promise.all([
    all(db, "telecaller_jobs", 3000), all(db, "leads", 2000), all(db, "enquiries", 2000), all(db, "invoices", 2000),
  ])
  const now = Date.now()
  const hasOpenJob = (phone: string) => jobs.some((j) => j.phone === phone && OPEN_JOB.includes(j.status))
  const hasJob = (pred: (j: Doc) => boolean) => jobs.some(pred)
  const dnc = new Set(s.doNotCall)
  const okPhone = (p: string) => isIndianMobile(p) && !dnc.has(p)
  const queue = async (input: Doc, bucket: string) => {
    await insertDoc(db, "telecaller_jobs", newJob({ ...input, maxAttempts: s.maxAttempts, createdBy: "engine" }))
    report.enqueued[bucket] = (report.enqueued[bucket] || 0) + 1
  }

  // a) new leads + voice / website enquiries → follow-up call
  if (s.autoQueueNewLeads) {
    for (const l of leads) {
      const phone = normalizePhone(l.customer?.phone)
      if (!okPhone(phone) || !["new", "contacted"].includes(l.stage || "new")) continue
      if (hasOpenJob(phone) || hasJob((j) => j.leadId === l.id)) continue
      if (l.nextFollowUp && new Date(l.nextFollowUp).getTime() > now) continue
      await queue({ kind: "followup", phone, contactName: l.customer?.name, company: l.customer?.company, leadId: l.id, enquiryId: l.enquiryId || null, source: "auto-lead", context: { productInterest: l.productInterest, quantity: l.quantityEstimate, summary: l.notes }, scheduledAt: nextCallingSlot(s).toISOString() }, "followup")
    }
    for (const e of enquiries) {
      const phone = normalizePhone(e.customer?.phone)
      if (!okPhone(phone) || (e.status || "new") !== "new") continue
      if (hasOpenJob(phone) || hasJob((j) => j.enquiryId === e.id)) continue
      if (now - new Date(e.createdAt).getTime() < hours(2)) continue // give the human team first shot
      await queue({ kind: "followup", phone, contactName: e.customer?.name, company: e.customer?.company, enquiryId: e.id, source: e.source || "auto-enquiry", context: { productInterest: e.productInterest, summary: e.message, city: e.customer?.address }, scheduledAt: nextCallingSlot(s).toISOString() }, "followup")
    }
  }

  // b) feedback N days after an invoice; c) upsell M days after
  for (const inv of invoices) {
    const phone = normalizePhone(inv.customer?.phone)
    if (!okPhone(phone) || ["draft", "cancelled"].includes(inv.status)) continue
    const age = now - new Date(inv.issueDate || inv.createdAt).getTime()
    if (s.feedback.enabled && age >= days(s.feedback.daysAfterInvoice) && !hasJob((j) => j.invoiceId === inv.id && j.kind === "feedback") && !hasOpenJob(phone)) {
      await queue({ kind: "feedback", phone, contactName: inv.customer?.name, company: inv.customer?.company, invoiceId: inv.id, source: "auto-feedback", context: { items: (inv.lines || []).map((l: Doc) => ({ product: l.description, quantity: l.quantity })), summary: `Invoice ${inv.number}` }, scheduledAt: nextCallingSlot(s).toISOString() }, "feedback")
      continue
    }
    if (s.upsell.enabled && age >= days(s.upsell.daysAfterInvoice)) {
      const recentUpsell = jobs.some((j) => j.phone === phone && j.kind === "upsell" && now - new Date(j.createdAt).getTime() < days(s.upsell.repeatEveryDays))
      const newerOrder = invoices.some((o) => o.id !== inv.id && normalizePhone(o.customer?.phone) === phone && new Date(o.issueDate || o.createdAt) > new Date(inv.issueDate || inv.createdAt))
      if (recentUpsell || newerOrder || hasOpenJob(phone)) continue
      await queue({ kind: "upsell", phone, contactName: inv.customer?.name, company: inv.customer?.company, invoiceId: inv.id, source: "auto-upsell", context: { items: (inv.lines || []).map((l: Doc) => ({ product: l.description, quantity: l.quantity })), summary: `Last order ${inv.number} on ${String(inv.issueDate || inv.createdAt).slice(0, 10)}` }, scheduledAt: nextCallingSlot(s).toISOString() }, "upsell")
    }
  }

  // d) dial what is due
  if (opts.dial === false) return report
  if (!withinCallingHours(s) && !opts.force) { report.skipped.push("outside calling hours"); return report }
  const { data: todayRows } = await db.from("telecaller_calls").select("id").gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
  const remaining = Math.max(0, (s.dailyCap || 40) - (todayRows?.length || 0))
  if (!remaining) { report.skipped.push("daily cap reached"); return report }
  const inFlight = jobs.filter((j) => j.status === "in_progress" && now - new Date(j.lastAttemptAt || j.createdAt).getTime() < hours(1)).length
  const fresh = await all(db, "telecaller_jobs", 3000)
  const due = fresh
    .filter((j) => j.status === "queued" && new Date(j.scheduledAt || 0).getTime() <= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, Math.min(remaining, Math.max(0, 3 - inFlight), 5))
  for (const j of due) {
    try {
      const r = await dialJob(db, j.id)
      if (r.error) report.errors.push(`${j.contactName || j.phone}: ${r.error}`)
      else report.dialed += 1
    } catch (e) {
      report.errors.push(`${j.contactName || j.phone}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return report
}
