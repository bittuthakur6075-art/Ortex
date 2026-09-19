// Instant alerts: a new website enquiry, a call Anu took (or a complaint), a
// quotation marked won, a payment received. Pure: detectAlerts(data, state,
// now, options) -> { alerts, keys }, tested in test/alerts.test.js.
//
// The bot POLLS rather than listening over realtime: it works whether or not a
// table is in the supabase_realtime publication, and after a restart it simply
// catches up. `state.since` is the moment alerts were switched on, so nothing
// older is ever announced (no flood of history on first start), and
// `state.alerted` remembers what was already sent.
import { voiceCalls, formatCurrency, WON, VOICE_SOURCE } from "./admin.js"

// Anu saves a call several times while it is going on. Announce it once it
// has been quiet this long, as ONE message carrying everything she captured.
export const CALL_SETTLE_MS = 3 * 60 * 1000

const ms = (ts) => new Date(ts).getTime() || 0
const money = (v) => formatCurrency(v, { compact: true }).replace(/\.00$/, "")
const name = (c = {}) => (c.company || "").trim() || (c.name || "").trim() || "Someone"
const phone = (p = "") => {
  const d = String(p).replace(/\D/g, "").slice(-10)
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : p
}

// Web and voice items are { product, quantity }; tolerate `name` too.
const itemName = (i) => {
  const n = String(i?.product || i?.name || "").trim()
  return n && i.quantity ? `${n} (${i.quantity})` : n
}

function itemsText(e) {
  const items = (Array.isArray(e.items) ? e.items : []).map(itemName).filter(Boolean)
  if (items.length) return items.join(", ")
  return e.productInterest || ""
}

function enquiryAlert(e) {
  const c = e.customer || {}
  const who = [c.name, c.company].filter(Boolean).join(", ") || "No name given"
  const lines = [`🔔 *New ${e.source === "Quote calculator" ? "quote request" : "website enquiry"}*`, `*${who}*${c.phone ? ` · ${phone(c.phone)}` : ""}`]
  const wants = itemsText(e)
  if (wants) lines.push(`Wants: ${wants}`)
  if (c.city) lines.push(`City: ${c.city}`)
  if (e.message) lines.push(`_"${String(e.message).slice(0, 160)}${String(e.message).length > 160 ? "…" : ""}"_`)
  lines.push(`Source: ${e.source || "Website"}${e.reference ? ` · ${e.reference}` : ""}`)
  return lines.join("\n")
}

function callAlert(call) {
  const support = call.flags?.support
  const head = support ? "🚨 *Complaint to Anu*" : call.flags?.urgent ? "📞 *Urgent call to Anu*" : "📞 *Anu took a call*"
  const lines = [head, `*${call.name || "Caller"}*${call.customer?.phone ? ` · ${phone(call.customer.phone)}` : " · no number captured"}`]
  const items = (call.itemsList || []).map(itemName).filter(Boolean).join(", ")
  const wants = items || [call.productInterest, call.quantity].filter(Boolean).join(", ")
  if (wants) lines.push(`${support ? "About" : "Wants"}: ${wants}`)
  if (call.timeline) lines.push(`Needed by: ${call.timeline}`)
  if (call.customer?.address) lines.push(`Address: ${call.customer.address}`)
  if (call.summary) lines.push(`_${String(call.summary).slice(0, 200)}_`)
  lines.push(support ? "_Please call them back today._" : "_Open Voice calls in the console for the recording._")
  return lines.join("\n")
}

const wonAlert = (q) =>
  `🎉 *Quotation won*\n*${name(q.customer)}* · ${money(q.totals?.grandTotal)}\n${q.number || "Quotation"} marked ${q.status}`

const paymentAlert = (p) =>
  `💰 *Payment received*\n*${money(p.amount)}* from ${p.party || name(p.customer)}${p.invoiceNumber ? ` · ${p.invoiceNumber}` : ""}${p.method ? ` · ${p.method}` : ""}`

export function detectAlerts(data, state, now, options = {}) {
  const since = ms(state.since)
  const sent = new Set(state.alerted || [])
  const alerts = []
  const keys = []
  const fresh = (ts) => ms(ts) > since
  const add = (key, text, extraKeys = []) => {
    alerts.push(text)
    keys.push(key, ...extraKeys)
  }

  if (options.newEnquiry !== false) {
    for (const e of data.enquiries || []) {
      if (e.source === VOICE_SOURCE || !fresh(e.createdAt) || sent.has(`enq:${e.id}`)) continue
      add(`enq:${e.id}`, enquiryAlert(e))
    }
  }

  if (options.voiceCall !== false) {
    for (const call of voiceCalls(data.enquiries || [])) {
      const rowKeys = call.rows.map((r) => `row:${r.id}`)
      if (!fresh(call.endedAt) || rowKeys.some((k) => sent.has(k))) continue
      if (now - ms(call.endedAt) < CALL_SETTLE_MS) continue // still talking
      add(rowKeys[0], callAlert(call), rowKeys.slice(1))
    }
  }

  if (options.quoteWon !== false) {
    for (const q of data.quotations || []) {
      if (!WON.has(q.status) || !fresh(q.updatedAt) || sent.has(`won:${q.id}`)) continue
      add(`won:${q.id}`, wonAlert(q))
    }
  }

  if (options.paymentReceived !== false) {
    for (const p of data.payments || []) {
      if (p.type !== "inflow" || !fresh(p.createdAt) || sent.has(`pay:${p.id}`)) continue
      add(`pay:${p.id}`, paymentAlert(p))
    }
  }

  return { alerts, keys }
}

// Alerts held back during quiet hours, delivered as one message.
export function bundle(alerts) {
  if (alerts.length === 1) return alerts[0]
  return `🌅 *While you were away* (${alerts.length})\n\n${alerts.join("\n\n")}`
}

// Remember at most this many keys; the oldest fall off.
export const MAX_REMEMBERED = 5000
export function remember(state, keys) {
  const all = [...(state.alerted || []), ...keys]
  return { ...state, alerted: all.slice(-MAX_REMEMBERED) }
}
