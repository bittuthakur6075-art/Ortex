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
