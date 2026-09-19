// Answers a message sent to the bot.
//
// 1. A COMMAND ("today", "week", "due", "leads", …) is answered instantly from
//    reports.js, with no AI: the everyday questions cost nothing and cannot be
//    misread.
// 2. Anything else goes to Gemini with a small set of READ-ONLY tools over the
//    same data. The model never sees the whole database, only what a tool
//    returns, and the prompt forbids a figure that did not come from one.
//    Without a Gemini key the bot still does (1) and says so for (2).
import { resolveInvoiceStatus, invoiceBalance, buildVisitors, headline, INTEREST, formatCurrency } from "./admin.js"
import {
  dailyDigest, periodReport, websiteReport, leadsReport, quotesReport, dueReport, needsYou,
} from "./reports.js"

const DAY = 86400000
const ms = (ts) => new Date(ts).getTime() || 0
const money = (v) => formatCurrency(v, { compact: true }).replace(/\.00$/, "")
const dateOf = (ts, tz) => (ts ? new Date(ts).toLocaleDateString("en-IN", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }) : "")

export const HELP = [
  "🤖 *Ortex bot*. Ask me about the business, or send one of these:",
  "",
  "*today*: the last 24 hours and what needs you",
  "*week* / *month* / *quarter*: the 7 / 30 / 90 day report",
  "*due*: money to collect, overdue first",
  "*leads*: leads nobody has contacted yet",
  "*quotes*: quotations waiting, expiring or due a chase",
  "*website*: visitors, what they looked at, where they came from",
  "*mute* / *unmute*: pause alerts for 2 hours, or resume them",
  "",
  "Or just ask, for example:",
  "_Did Sharma Traders pay?_",
  "_How many leads came from Anu this month?_",
  "_Which products are people looking at most?_",
].join("\n")

// Words people actually type, including a little Hinglish.
const COMMANDS = [
  ["help", /^(help|menu|commands?|\?|hi|hello|namaste)$/],
  ["today", /^(today|daily|report|update|summary|aaj|aaj ka)$/],
  ["week", /^(week|weekly|this week|hafta|7 ?d(ays)?)$/],
  ["month", /^(month|monthly|this month|mahina|30 ?d(ays)?)$/],
  ["quarter", /^(quarter|90 ?d(ays)?)$/],
  ["due", /^(due|dues|money|collect(ions?)?|overdue|outstanding|receivables?|payments? due)$/],
  ["leads", /^(leads?|enquir(y|ies)|calls?)$/],
  ["quotes", /^(quotes?|quotations?)$/],
  ["website", /^(website|site|web|visitors?|traffic)$/],
  ["needs", /^(needs|todo|to do|attention|pending)$/],
  ["mute", /^(mute|pause|stop alerts?|quiet)$/],
  ["unmute", /^(unmute|resume|start alerts?)$/],
]

export function parseCommand(text) {
  const t = String(text || "").trim().toLowerCase().replace(/^[/!.]+/, "").replace(/[.!?]+$/, "").trim()
  for (const [cmd, re] of COMMANDS) if (re.test(t)) return cmd
  return null
}

export function runCommand(cmd, data, now, tz) {
  switch (cmd) {
    case "help": return HELP
    case "today": return dailyDigest(data, now, tz)
    case "week": return periodReport(data, now, tz, "7d")
    case "month": return periodReport(data, now, tz, "30d")
    case "quarter": return periodReport(data, now, tz, "90d")
    case "due": return dueReport(data, now)
    case "leads": return leadsReport(data, now)
    case "quotes": return quotesReport(data, now)
    case "website": return websiteReport(data, now, 7)
    case "needs": return `🤖 ${needsYou(data, now, 15)}`
    default: return null
  }
}

// ---- tools the model may call --------------------------------------------------

const has = (q, ...fields) => {
  const needle = String(q || "").trim().toLowerCase()
  if (!needle) return true
  const digits = needle.replace(/\D/g, "")
  return fields.some((f) => {
    const v = String(f || "").toLowerCase()
    return v.includes(needle) || (digits.length >= 5 && v.replace(/\D/g, "").includes(digits))
  })
}
const digits10 = (p) => String(p || "").replace(/\D/g, "").slice(-10)
const who = (c = {}) => [c.name, c.company].filter(Boolean).join(", ")
const recent = (days, now) => (ts) => !days || ms(ts) >= now - days * DAY

export const TOOL_DECLARATIONS = [
  {
    name: "business_report",
    description: "The console Dashboard's report for a period: leads, quoted value, win rate, invoiced, cash in, open pipeline, receivables and website. Use for any 'how are we doing' question.",
    parameters: { type: "OBJECT", properties: { period: { type: "STRING", enum: ["today", "7d", "30d", "90d"], description: "today = last 24 hours" } }, required: ["period"] },
  },
  {
    name: "needs_attention",
    description: "Everything waiting on a person right now: overdue or soon-due invoices, complaints, uncontacted leads and Anu calls, expiring or stale quotations.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "find_customers",
    description: "Search customers by name, company, phone, email or GSTIN. Returns contact details and their quotation/invoice totals.",
    parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
  },
  {
    name: "find_enquiries",
    description: "Search leads: website enquiries and calls Anu took. Filter by text (name, company, phone, product), status and age.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING" },
        status: { type: "STRING", description: "e.g. new, contacted, quoted, won, lost" },
        source: { type: "STRING", enum: ["any", "website", "anu"] },
        days: { type: "NUMBER", description: "only the last N days" },
      },
    },
  },
  {
    name: "find_quotations",
    description: "Search quotations by customer, number or product; filter by status (draft, sent, accepted, rejected, expired, invoiced) and age.",
    parameters: { type: "OBJECT", properties: { query: { type: "STRING" }, status: { type: "STRING" }, days: { type: "NUMBER" } } },
  },
  {
    name: "find_invoices",
    description: "Search invoices by customer or number, with the live status and balance still due.",
    parameters: {
      type: "OBJECT",
      properties: { query: { type: "STRING" }, status: { type: "STRING", enum: ["any", "unpaid", "overdue", "paid"] }, days: { type: "NUMBER" } },
    },
  },
  {
    name: "website_activity",
    description: "Website visitors for the last N days: totals, interest levels, most viewed products, searches, sources, and the most interesting visitors.",
    parameters: { type: "OBJECT", properties: { days: { type: "NUMBER" } }, required: ["days"] },
  },
]

export function runTool(name, args, data, now, tz) {
  const a = args || {}
  switch (name) {
    case "business_report":
      return a.period === "today" ? dailyDigest(data, now, tz) : periodReport(data, now, tz, ["7d", "30d", "90d"].includes(a.period) ? a.period : "30d")
    case "needs_attention":
      return needsYou(data, now, 20)
    case "find_customers": {
      const found = (data.customers || []).filter((c) => has(a.query, c.name, c.company, c.phone, c.email, c.gstin)).slice(0, 8)
      return found.map((c) => {
        // A document carries a snapshot of its customer, not an id, so match
        // it as the console does: phone digits, then email, then the name.
        const mine = (d) => {
          const x = d.customer || {}
          if (c.phone && digits10(x.phone) && digits10(x.phone) === digits10(c.phone)) return true
          if (c.email && x.email && x.email.toLowerCase() === c.email.toLowerCase()) return true
          const n = (c.company || c.name || "").trim().toLowerCase()
          return Boolean(n) && (x.company || x.name || "").trim().toLowerCase() === n
        }
        const quotes = (data.quotations || []).filter(mine)
        const invoices = (data.invoices || []).filter(mine)
        const due = invoices.filter((i) => i.status !== "cancelled" && i.status !== "draft").reduce((s, i) => s + Math.max(0, invoiceBalance(i, data.payments || [])), 0)
        return {
          name: who(c), phone: c.phone, email: c.email, address: c.address, gstin: c.gstin,
          quotations: quotes.length, quotedValue: money(quotes.reduce((s, q) => s + (Number(q.totals?.grandTotal) || 0), 0)),
          invoices: invoices.length, balanceDue: money(due),
        }
      })
    }
    case "find_enquiries": {
      const src = a.source || "any"
      return (data.enquiries || [])
        .filter((e) => (src === "any" || (src === "anu") === (e.source === "Voice assistant (Anu)")))
        .filter((e) => !a.status || (e.status || "new") === a.status)
        .filter((e) => recent(a.days, now)(e.createdAt))
        .filter((e) => has(a.query, e.customer?.name, e.customer?.company, e.customer?.phone, e.customer?.email, e.productInterest, e.reference))
        .slice(0, 12)
        .map((e) => ({
          date: dateOf(e.createdAt, tz), name: who(e.customer), phone: e.customer?.phone, source: e.source,
          wants: e.productInterest, status: e.status || "new", reference: e.reference,
        }))
    }
    case "find_quotations":
      return (data.quotations || [])
        .filter((q) => !a.status || q.status === a.status)
        .filter((q) => recent(a.days, now)(q.issueDate || q.createdAt))
        .filter((q) => has(a.query, q.number, q.customer?.name, q.customer?.company, q.customer?.phone, ...(q.lines || []).map((l) => l.description)))
        .slice(0, 12)
        .map((q) => ({
          number: q.number, customer: who(q.customer), date: dateOf(q.issueDate || q.createdAt, tz), status: q.status,
          total: money(q.totals?.grandTotal), validUntil: dateOf(q.validUntil, tz),
          items: (q.lines || []).slice(0, 5).map((l) => `${l.description} x ${l.quantity}`),
        }))
    case "find_invoices": {
      const want = a.status || "any"
      return (data.invoices || [])
        .map((i) => ({ i, status: resolveInvoiceStatus(i, data.payments || []), balance: invoiceBalance(i, data.payments || []) }))
        .filter(({ status }) => want === "any" || (want === "unpaid" ? !["paid", "cancelled", "draft"].includes(status) : status === want))
        .filter(({ i }) => recent(a.days, now)(i.issueDate || i.createdAt))
        .filter(({ i }) => has(a.query, i.number, i.customer?.name, i.customer?.company, i.customer?.phone))
        .slice(0, 12)
        .map(({ i, status, balance }) => ({
          number: i.number, customer: who(i.customer), date: dateOf(i.issueDate, tz), due: dateOf(i.dueDate, tz),
          total: money(i.totals?.grandTotal), balanceDue: money(Math.max(0, balance)), status,
        }))
    }
    case "website_activity": {
      const days = Math.min(Math.max(Number(a.days) || 7, 1), 60)
      const from = now - days * DAY
      const visitors = buildVisitors((data.activities || []).filter((x) => ms(x.timestamp) >= from), data.enquiries || [])
      const notable = visitors
        .filter((v) => v.interest !== "browsing")
        .slice(0, 8)
        .map((v) => ({ visitor: v.name, interest: INTEREST[v.interest].label, did: headline(v), lastSeen: dateOf(v.lastSeen, tz), visits: v.visits.length }))
      return { report: websiteReport(data, now, days), notableVisitors: notable }
    }
    default:
      return { error: `No tool called ${name}` }
  }
}

// ---- the model ----------------------------------------------------------------

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
const MAX_ROUNDS = 5

function systemPrompt(now, tz) {
  const today = new Date(now).toLocaleDateString("en-IN", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return [
    "You are the Ortex bot, answering the owners of Ortex Industries (custom MDF/acrylic products, lanyards, corporate gifts) in their private WhatsApp group.",
    `Today is ${today}, India time. Money is in rupees, already formatted (₹1.2L = 1.2 lakh, ₹3Cr = 3 crore).`,
    "Answer ONLY from what your tools return. Never guess or invent a number, name, date or status. If the tools do not have it, say so plainly.",
    "Call a tool before answering any question about the business. Prefer one well-chosen call; use a second only if needed.",
    "Reply in the language the person used (English or Hinglish). Be short: a direct answer first, then at most 8 lines of detail.",
    "Use WhatsApp formatting: *bold* for key figures and names, _italic_ sparingly, '• ' bullets. No markdown headings, no tables, no links.",
    "Never use an em dash or en dash; use a comma, colon or full stop instead.",
    "If the message is not about Ortex's sales, leads, quotations, invoices, payments, customers or website, say briefly that you only answer questions about the business and suggest typing *help*.",
  ].join("\n")
}

// Belt and braces for the house rule: the prompt forbids long dashes, and a
// model occasionally slips one in anyway.
export const tidy = (text) => String(text || "").replace(/\s*[‒–—―]\s*/g, ", ").trim()

export async function askModel({ question, history = [], data, now, tz, apiKey, model, fetchImpl = fetch }) {
  const contents = [...history, { role: "user", parts: [{ text: question }] }]
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetchImpl(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(now, tz) }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { temperature: 0.2 },
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error?.message || `Gemini returned ${res.status}`)
    const content = body?.candidates?.[0]?.content
    const parts = content?.parts || []
    const calls = parts.filter((p) => p.functionCall)
    if (!calls.length) {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim()
      return tidy(text) || "Sorry, I could not work that out. Try *help* for the questions I can answer."
    }
    // The model's turn goes back unchanged (Gemini 3 needs its thought
    // signatures returned), followed by every tool's result.
    contents.push({ role: "model", parts })
    contents.push({
      role: "user",
      parts: calls.map(({ functionCall }) => {
        let result
        try {
          result = runTool(functionCall.name, functionCall.args, data, now, tz)
        } catch (err) {
          result = { error: String(err?.message || err) }
        }
        return { functionResponse: { name: functionCall.name, response: { result } } }
      }),
    })
  }
  return "That needed more lookups than I am allowed. Try asking one thing at a time."
}
