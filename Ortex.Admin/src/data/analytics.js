// Growth analytics — pure functions over the raw collections. Everything the
// dashboard shows is derived here so the math is testable and lives in one
// place. Revenue/margin figures are GST-exclusive (taxable value); tax is
// tracked separately, per the growth spec.

import { round2, daysUntil } from "../lib/format"
import { resolveInvoiceStatus, invoiceBalance } from "./domain"

const inRange = (ts, from, to) => {
  const t = new Date(ts).getTime()
  return t >= from && t < to
}

function periodBounds(period) {
  const now = new Date()
  const to = now.getTime()
  const start = new Date(now)
  if (period === "mtd") start.setDate(1)
  else if (period === "qtd") start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1)
  else if (period === "ytd") start.setMonth(0, 1)
  else start.setDate(now.getDate() - 30) // rolling 30d default
  start.setHours(0, 0, 0, 0)
  return { from: start.getTime(), to }
}

export function computeAnalytics({ products = [], enquiries = [], quotations = [], invoices = [], payments = [] }, period = "mtd") {
  const { from, to } = periodBounds(period)

  // ---- cash collected (north-star) ----
  const inflows = payments.filter((p) => p.type === "inflow")
  const cashCollected = round2(inflows.filter((p) => inRange(p.date, from, to)).reduce((s, p) => s + p.amount, 0))
  const payouts = round2(
    payments.filter((p) => p.type === "payout" && inRange(p.date, from, to)).reduce((s, p) => s + p.amount, 0),
  )

  // ---- revenue (taxable) from invoices in period, excluding cancelled ----
  const liveInvoices = invoices.filter((i) => i.status !== "cancelled")
  const revenue = round2(
    liveInvoices.filter((i) => inRange(i.issueDate, from, to)).reduce((s, i) => s + (i.totals?.taxable || 0), 0),
  )

  // ---- receivables + AR aging ----
  let outstanding = 0
  const arAging = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 }
  liveInvoices.forEach((inv) => {
    const bal = invoiceBalance(inv, payments)
    if (bal <= 0.5) return
    outstanding = round2(outstanding + bal)
    const d = daysUntil(inv.dueDate)
    if (d === null || d >= 0) arAging.current = round2(arAging.current + bal)
    else if (d >= -30) arAging["1-30"] = round2(arAging["1-30"] + bal)
    else if (d >= -60) arAging["31-60"] = round2(arAging["31-60"] + bal)
    else arAging["60+"] = round2(arAging["60+"] + bal)
  })

  // ---- DSO (rolling): AR / revenue-per-day over trailing 90 days ----
  const ninetyAgo = to - 90 * 86400000
  const revenue90 = round2(
    liveInvoices.filter((i) => inRange(i.issueDate, ninetyAgo, to)).reduce((s, i) => s + (i.totals?.taxable || 0), 0),
  )
  const totalOutstanding = round2(liveInvoices.reduce((s, i) => s + Math.max(0, invoiceBalance(i, payments)), 0))
  const dso = revenue90 > 0 ? Math.round((totalOutstanding / revenue90) * 90) : 0

  // ---- quotation win rate + pipeline ----
  const decided = quotations.filter((q) => ["accepted", "rejected", "expired", "invoiced"].includes(q.status))
  const won = quotations.filter((q) => q.status === "accepted" || q.status === "invoiced")
  const winRate = decided.length > 0 ? Math.round((won.length / decided.length) * 100) : 0
  const openQuotes = quotations.filter((q) => ["draft", "sent"].includes(q.status))
  const quoteAging = { "0-7": 0, "8-15": 0, "16-30": 0, "30+": 0 }
  openQuotes.forEach((q) => {
    const age = -(daysUntil(q.issueDate) || 0)
    if (age <= 7) quoteAging["0-7"] += 1
    else if (age <= 15) quoteAging["8-15"] += 1
    else if (age <= 30) quoteAging["16-30"] += 1
    else quoteAging["30+"] += 1
  })

  // ---- funnel ----
  const funnel = [
    { stage: "Enquiries", count: enquiries.length },
    { stage: "Quotations", count: quotations.length },
    { stage: "Accepted", count: won.length },
    { stage: "Invoiced", count: liveInvoices.length },
    { stage: "Paid", count: liveInvoices.filter((i) => resolveInvoiceStatus(i, payments) === "paid").length },
  ]

  // ---- AOV (from accepted/invoiced quotes) ----
  const orderValues = won.map((q) => q.totals?.grandTotal || 0).filter((v) => v > 0)
  const aov = orderValues.length ? round2(orderValues.reduce((a, b) => a + b, 0) / orderValues.length) : 0

  // ---- avg quote value ----
  const quoteValues = quotations.map((q) => q.totals?.grandTotal || 0).filter((v) => v > 0)
  const avgQuoteValue = quoteValues.length ? round2(quoteValues.reduce((a, b) => a + b, 0) / quoteValues.length) : 0

  // ---- category revenue + gross margin (from invoice lines × product cost) ----
  const productById = Object.fromEntries(products.map((p) => [p.id, p]))
  const categoryMap = {}
  liveInvoices.forEach((inv) => {
    ;(inv.lines || []).forEach((line, i) => {
      const computed = inv.totals?.lines?.[i]
      const taxable = computed?.taxable || 0
      const product = line.productId ? productById[line.productId] : null
      const category = product?.category || "Uncategorised"
      const cost = round2((product?.costPrice || 0) * (Number(line.quantity) || 0))
      const bucket = (categoryMap[category] = categoryMap[category] || { category, revenue: 0, cost: 0 })
      bucket.revenue = round2(bucket.revenue + taxable)
      bucket.cost = round2(bucket.cost + cost)
    })
  })
  const categoryRevenue = Object.values(categoryMap)
    .map((c) => ({ ...c, margin: round2(c.revenue - c.cost), marginPct: c.revenue ? Math.round(((c.revenue - c.cost) / c.revenue) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)

  const grossMargin = round2(categoryRevenue.reduce((s, c) => s + c.margin, 0))
  const grossMarginPct = revenue > 0 ? Math.round((grossMargin / round2(categoryRevenue.reduce((s, c) => s + c.revenue, 0) || 1)) * 100) : 0

  // ---- lead source performance ----
  const sourceMap = {}
  enquiries.forEach((e) => {
    const s = (sourceMap[e.source] = sourceMap[e.source] || { source: e.source, enquiries: 0, won: 0 })
    s.enquiries += 1
    if (e.status === "won") s.won += 1
  })
  const leadSources = Object.values(sourceMap)
    .map((s) => ({ ...s, conv: s.enquiries ? Math.round((s.won / s.enquiries) * 100) : 0 }))
    .sort((a, b) => b.enquiries - a.enquiries)

  // ---- repeat customers (by email across invoices) ----
  const byCustomer = {}
  liveInvoices.forEach((inv) => {
    const key = (inv.customer?.email || inv.customer?.name || "").toLowerCase()
    if (!key) return
    const c = (byCustomer[key] = byCustomer[key] || { name: inv.customer?.name, company: inv.customer?.company, orders: 0, revenue: 0 })
    c.orders += 1
    c.revenue = round2(c.revenue + (inv.totals?.taxable || 0))
  })
  const customers = Object.values(byCustomer)
  const repeatRate = customers.length ? Math.round((customers.filter((c) => c.orders >= 2).length / customers.length) * 100) : 0
  const topCustomers = [...customers].sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  // ---- reasons lost ----
  const reasonMap = {}
  quotations
    .filter((q) => q.status === "rejected" && q.lostReason)
    .forEach((q) => (reasonMap[q.lostReason] = (reasonMap[q.lostReason] || 0) + 1))
  const reasonsLost = Object.entries(reasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  // ---- revenue trend (last 6 months, taxable) ----
  const trend = []
  const base = new Date()
  base.setDate(1)
  base.setHours(0, 0, 0, 0)
  for (let i = 5; i >= 0; i--) {
    const start = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const end = new Date(base.getFullYear(), base.getMonth() - i + 1, 1)
    const rev = round2(
      liveInvoices.filter((inv) => inRange(inv.issueDate, start.getTime(), end.getTime())).reduce((s, inv) => s + (inv.totals?.taxable || 0), 0),
    )
    const collected = round2(
      inflows.filter((p) => inRange(p.date, start.getTime(), end.getTime())).reduce((s, p) => s + p.amount, 0),
    )
    trend.push({ label: start.toLocaleDateString("en-IN", { month: "short" }), revenue: rev, collected })
  }

  return {
    period,
    cashCollected,
    payouts,
    revenue,
    grossMargin,
    grossMarginPct,
    outstanding,
    totalOutstanding,
    arAging,
    dso,
    winRate,
    decidedCount: decided.length,
    wonCount: won.length,
    openQuotesCount: openQuotes.length,
    quoteAging,
    funnel,
    aov,
    avgQuoteValue,
    categoryRevenue,
    leadSources,
    repeatRate,
    topCustomers,
    reasonsLost,
    trend,
    counts: {
      products: products.length,
      enquiries: enquiries.length,
      quotations: quotations.length,
      invoices: liveInvoices.length,
      newEnquiries: enquiries.filter((e) => e.status === "new").length,
    },
  }
}

// ---------------------------------------------------------------------------
// Growth Intelligence — joins the behavioral top-of-funnel (user_activities /
// event_logs from the marketing site) to the quote-to-cash sales data into one
// funnel. P1: acquisition, engagement, demand gaps and the unified funnel.
// ---------------------------------------------------------------------------

// user_activities carry human labels ("Product search"); event_logs carry
// machine names ("search_performed"). Classify both to one vocabulary so counts
// don't silently miss half the data.
export function classifyActivity(a) {
  const t = String(a.activityType || a.eventType || "").toLowerCase()
  if (t.includes("search")) return "search"
  if (t.includes("cart")) return "cart"
  if (t.includes("visit") || t.includes("view")) return "view"
  if (t.includes("quote")) return "quote"
  if (t.includes("contact")) return "contact"
  if (t.includes("pdf") || t.includes("download")) return "download"
  return "other"
}

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
const phoneKey = (c) => String(c?.phone || "").replace(/\D/g, "")
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
