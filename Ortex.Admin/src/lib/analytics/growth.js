// ---------------------------------------------------------------------------
// Growth Intelligence — joins the behavioral top-of-funnel (user_activities /
// event_logs from the marketing site) to the quote-to-cash sales data into one
// funnel. P1: acquisition, engagement, demand gaps and the unified funnel.
// ---------------------------------------------------------------------------

import { round2 } from "../format"
import { resolveInvoiceStatus } from "../../data/domain/domain"
import { inRange, periodBounds } from "./period"
import { classifyActivity } from "./activity"

const ENGAGED_TYPES = new Set(["search", "view", "cart", "download"])

// Coarse acquisition channel from a referrer URL.
function channelOf(ref) {
  if (!ref || ref === "Direct") return "Direct"
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "")
    if (/google|bing|duckduckgo|yahoo|ecosia/.test(host)) return "Organic search"
    if (/facebook|instagram|linkedin|twitter|t\.co|youtube|whatsapp/.test(host)) return "Social"
    if (/indiamart|justdial|tradeindia|amazon|flipkart/.test(host)) return "Marketplace"
    return host
  } catch {
    return "Referral"
  }
}

export function computeGrowthAnalytics(
  { activities = [], enquiries = [], quotations = [], invoices = [], payments = [], products = [] },
  period = "mtd",
) {
  const { from, to } = periodBounds(period)
  const acts = activities.filter((a) => inRange(a.timestamp, from, to))

  // ---- acquisition ----
  const visitorsSet = new Set(acts.map((a) => a.userId).filter(Boolean))

  // new vs returning: a visitor is "new" if their earliest activity EVER falls
  // in-period (computed over the full history, not just the window).
  const firstSeen = {}
  activities.forEach((a) => {
    if (!a.userId) return
    const t = new Date(a.timestamp).getTime()
    if (Number.isNaN(t)) return
    if (!(a.userId in firstSeen) || t < firstSeen[a.userId]) firstSeen[a.userId] = t
  })
  let newVisitors = 0
  visitorsSet.forEach((u) => { if (firstSeen[u] >= from) newVisitors++ })
  const returningVisitors = visitorsSet.size - newVisitors

  // Fold activities into sessions once — reused for channel/device/engagement.
  const bySession = {}
  acts.forEach((a) => {
    const s = a.sessionId
    if (!s) return
    const row = bySession[s] || (bySession[s] = { channel: channelOf(a.referrer), device: a.device || "Unknown", count: 0, types: new Set() })
    row.count += 1
    row.types.add(classifyActivity(a))
  })
  const sessions = Object.values(bySession)

  const tally = (arr, keyFn) => {
    const m = {}
    arr.forEach((x) => { const k = keyFn(x); m[k] = (m[k] || 0) + 1 })
    return m
  }
  const toSorted = (map, key) => Object.entries(map).map(([k, count]) => ({ [key]: k, count })).sort((a, b) => b.count - a.count)

  const channels = toSorted(tally(sessions, (s) => s.channel), "channel")
  const devices = toSorted(tally(sessions, (s) => s.device), "device")

  // ---- engagement ----
  const engagedSessions = sessions.filter((s) => [...s.types].some((t) => ENGAGED_TYPES.has(t))).length
  const bounceSessions = sessions.filter((s) => s.count <= 1).length
  const engagedRate = sessions.length ? Math.round((engagedSessions / sessions.length) * 100) : null
  const bounceRate = sessions.length ? Math.round((bounceSessions / sessions.length) * 100) : null
  const actionsPerSession = sessions.length ? round2(acts.length / sessions.length) : 0
  const quoteSessions = new Set(acts.filter((a) => classifyActivity(a) === "quote").map((a) => a.sessionId).filter(Boolean))
  const visitorToQuote = sessions.length ? round2((quoteSessions.size / sessions.length) * 100) : null

  // ---- top searches / views ----
  const searchMap = {}
  acts.filter((a) => classifyActivity(a) === "search").forEach((a) => {
    const q = String(a.metadata?.searchQuery || a.metadata?.query || "").trim().toLowerCase()
    if (q) searchMap[q] = (searchMap[q] || 0) + 1
  })
  const topSearches = toSorted(searchMap, "query").slice(0, 8)

  const viewMap = {}
  acts.filter((a) => classifyActivity(a) === "view").forEach((a) => {
    const name = a.metadata?.productName || a.productId || "Unspecified"
    viewMap[name] = (viewMap[name] || 0) + 1
  })
  const topViews = toSorted(viewMap, "name").slice(0, 8)

  // ---- demand gap: searched terms with no matching product (roadmap signal) ----
  const productHay = products.map((p) => `${p.name || ""} ${p.material || ""} ${p.category || ""}`.toLowerCase())
  const demandGaps = Object.entries(searchMap)
    .filter(([q]) => !productHay.some((h) => h.includes(q)))
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ---- unified funnel (each stage period-scoped by its own timestamp) ----
  const liveInvoices = invoices.filter((i) => i.status !== "cancelled")
  const enquiriesInP = enquiries.filter((e) => inRange(e.createdAt, from, to))
  const quotationsInP = quotations.filter((q) => inRange(q.issueDate || q.createdAt, from, to))
  const wonInP = quotationsInP.filter((q) => q.status === "accepted" || q.status === "invoiced")
  const invoicedInP = liveInvoices.filter((i) => inRange(i.issueDate, from, to))
  const paidInP = invoicedInP.filter((i) => resolveInvoiceStatus(i, payments) === "paid")

  const funnel = [
    { stage: "Visitors", count: visitorsSet.size },
    { stage: "Sessions", count: sessions.length },
    { stage: "Engaged", count: engagedSessions },
    { stage: "Quote requests", count: quoteSessions.size },
    { stage: "Enquiries", count: enquiriesInP.length },
    { stage: "Quotations", count: quotationsInP.length },
    { stage: "Accepted", count: wonInP.length },
    { stage: "Invoiced", count: invoicedInP.length },
    { stage: "Paid", count: paidInP.length },
  ]

  // ---- weekly trend (last 8 weeks): sessions + quote-requesting sessions ----
  const weekMs = 7 * 86400000
  const anchor = new Date(); anchor.setHours(0, 0, 0, 0)
  const anchorMs = anchor.getTime() + 86400000 // end of today
  const trend = []
  for (let i = 7; i >= 0; i--) {
    const wStart = anchorMs - (i + 1) * weekMs
    const wEnd = anchorMs - i * weekMs
    const wActs = activities.filter((a) => inRange(a.timestamp, wStart, wEnd))
    const wSessions = new Set(wActs.map((a) => a.sessionId).filter(Boolean))
    const wQuotes = new Set(wActs.filter((a) => classifyActivity(a) === "quote").map((a) => a.sessionId).filter(Boolean))
    trend.push({
      label: new Date(wStart).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      sessions: wSessions.size,
      quotes: wQuotes.size,
    })
  }

  return {
    period,
    visitors: visitorsSet.size,
    newVisitors,
    returningVisitors,
    sessionCount: sessions.length,
    channels,
    devices,
    engagedSessions,
    engagedRate,
    bounceRate,
    actionsPerSession,
    quoteSessionCount: quoteSessions.size,
    visitorToQuote,
    topSearches,
    topViews,
    demandGaps,
    funnel,
    trend,
    totalActivities: acts.length,
  }
}

// ---------------------------------------------------------------------------
// P2: Attribution — ties web behaviour to actual revenue. Contact-level join
// (normalised email/phone) is robust even for older enquiries; enquiries stamped
// with tracking ids (leads.js) are additionally counted as web-originated.
// ---------------------------------------------------------------------------

const emailKey = (c) => String(c?.email || "").trim().toLowerCase()
export const phoneKey = (c) => String(c?.phone || "").replace(/\D/g, "")
const contactKeys = (c) => {
  const out = []
  const e = emailKey(c); if (e) out.push(`e:${e}`)
  const p = phoneKey(c); if (p.length >= 7) out.push(`p:${p}`)
  return out
}

export function computeAttribution(
  { activities = [], enquiries = [], quotations = [], invoices = [], products = [] },
  period = "mtd",
) {
  const { from, to } = periodBounds(period)

  // Web-touched contacts + their first-touch channel, built over ALL history
  // (a visitor touched last month may buy this month).
  const firstChannel = new Map()
  const firstTs = new Map()
  const touch = (c, ts, channel) => {
    const t = new Date(ts).getTime()
    if (Number.isNaN(t)) return
    for (const k of contactKeys(c)) {
      if (!firstTs.has(k) || t < firstTs.get(k)) { firstTs.set(k, t); firstChannel.set(k, channel) }
    }
  }
  activities.forEach((a) => {
    const c = a.metadata?.customer
    if (c && (c.email || c.phone)) touch(c, a.timestamp, channelOf(a.referrer))
  })
  enquiries.forEach((e) => {
    if (e.tracking?.userId || e.tracking?.sessionId) touch(e.customer, e.submittedAt || e.createdAt, e.source || "Website")
  })

  const isWeb = (c) => contactKeys(c).some((k) => firstChannel.has(k))
  const channelFor = (c) => {
    for (const k of contactKeys(c)) if (firstChannel.has(k)) return firstChannel.get(k)
    return "Unknown"
  }

  // Revenue attribution over in-period invoices.
  const liveInvoices = invoices.filter((i) => i.status !== "cancelled")
  const inP = liveInvoices.filter((i) => inRange(i.issueDate, from, to))
  const totalRevenue = round2(inP.reduce((s, i) => s + (i.totals?.taxable || 0), 0))
  const webInvoices = inP.filter((i) => isWeb(i.customer))
  const webInfluencedRevenue = round2(webInvoices.reduce((s, i) => s + (i.totals?.taxable || 0), 0))
  const webShare = totalRevenue > 0 ? Math.round((webInfluencedRevenue / totalRevenue) * 100) : null

  const chMap = {}
  webInvoices.forEach((i) => {
    const ch = channelFor(i.customer)
    chMap[ch] = round2((chMap[ch] || 0) + (i.totals?.taxable || 0))
  })
  const channelRevenue = Object.entries(chMap).map(([channel, revenue]) => ({ channel, revenue })).sort((a, b) => b.revenue - a.revenue)

  // Tracked-enquiry conversion (needs the leads.js stamp; 0 before it ships).
  const trackedEnquiries = enquiries.filter((e) => e.tracking?.userId || e.tracking?.sessionId)
  const quotesByEnquiry = {}
  quotations.forEach((q) => { if (q.enquiryId) (quotesByEnquiry[q.enquiryId] = quotesByEnquiry[q.enquiryId] || []).push(q) })
  const trackedWon = trackedEnquiries.filter((e) =>
    (quotesByEnquiry[e.id] || []).some((q) => q.status === "accepted" || q.status === "invoiced"),
  ).length
  const trackedConversion = trackedEnquiries.length ? Math.round((trackedWon / trackedEnquiries.length) * 100) : null

  // Product performance: page views vs orders won.
  const viewCount = {}
  activities.filter((a) => classifyActivity(a) === "view").forEach((a) => {
    const key = a.productId || a.metadata?.productName
    if (key) viewCount[key] = (viewCount[key] || 0) + 1
  })
  const orderCount = {}
  quotations
    .filter((q) => q.status === "accepted" || q.status === "invoiced")
    .forEach((q) => (q.lines || []).forEach((l) => { if (l.productId) orderCount[l.productId] = (orderCount[l.productId] || 0) + 1 }))
  const productPerformance = products
    .map((p) => {
      const views = (viewCount[p.id] || 0) + (viewCount[p.name] || 0)
      const orders = orderCount[p.id] || 0
      return { name: p.name, views, orders, rate: views ? Math.round((orders / views) * 100) : null }
    })
    .filter((p) => p.views > 0 || p.orders > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 8)

  return {
    totalRevenue,
    webInfluencedRevenue,
    webShare,
    channelRevenue,
    trackedEnquiryCount: trackedEnquiries.length,
    trackedWon,
    trackedConversion,
    productPerformance,
  }
}
