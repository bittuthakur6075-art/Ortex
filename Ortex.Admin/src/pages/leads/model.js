import { Globe, Mic, MessageCircle, FileSpreadsheet, Hash, Mail, Phone } from "../../components/ui/Icons"
import { parseQuoteRfq, rfqSummary, rfqUnits } from "../../lib/quoteRfq"
import { leadNextStep, leadFlags, leadGroup, OPEN_LEAD } from "../../lib/salesWork"
import { sameCustomer } from "../../data/domain/domain"
import { gstinProblem } from "../../lib/validateCustomer"
import { VOICE_SOURCE, parseMessage, itemsFor, parseQuantity } from "../voice-leads/helpers"
import { stateName } from "../../lib/gstStates"

// Where a lead came in. The channel is what the list filters on and the badge
// on each avatar; `source` stays the raw field it is derived from.
export const CHANNELS = [
  { key: "website", label: "Website", icon: Globe },
  { key: "anu", label: "Anu call", icon: Mic },
  { key: "indiamart", label: "IndiaMART", icon: Hash },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "import", label: "Import", icon: FileSpreadsheet },
  { key: "email", label: "Email", icon: Mail },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "other", label: "Other", icon: Hash },
]

export function channelOf(e) {
  const s = (e.source || "").toLowerCase()
  if (e.source === VOICE_SOURCE) return "anu"
  if (e.imported) return "import"
  if (s.includes("indiamart")) return "indiamart"
  if (s.includes("whatsapp")) return "whatsapp"
  if (s.includes("website") || s.includes("quote calculator") || s.includes("chatbot")) return "website"
  if (s.includes("email")) return "email"
  if (s.includes("phone")) return "phone"
  return "other"
}

export const channelMeta = (key) => CHANNELS.find((c) => c.key === key) || CHANNELS[CHANNELS.length - 1]

export const STATUS_TONE = { new: "blue", contacted: "amber", qualified: "violet", quoted: "blue", won: "emerald", lost: "rose" }

const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Everything one row, the preview and the smart views need, derived once.
export function buildLead(e, { products, quotations, now }) {
  const rfq = parseQuoteRfq(e)
  const items = rfq?.items || []
  const quote = quotations
    .filter((q) => q.enquiryId === e.id || (e.quotationId && q.id === e.quotationId))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
  let value = 0
  let valueNote = ""
  if (quote) {
    value = quote.totals?.taxable ?? quote.totals?.grandTotal ?? 0
    valueNote = quote.number
  } else if (items.length) {
    value = rfqSummary(items, products).value
    valueNote = "estimate"
  } else if (num(e.quantity) && num(e.rate)) {
    value = num(e.quantity) * num(e.rate)
    valueNote = "their rate"
  }
  // Every source keeps quantity and place somewhere different: an import in
  // `quantity` and `customer.city`, IndiaMART in `customer.city` / `state`,
  // Anu in the message ("Qty: 1000 · Timeline: ...") or an `items` list and
  // in `customer.address`. Resolve them once here so every screen agrees.
  const voice = e.source === VOICE_SOURCE
  const parsed = voice ? parseMessage(e.message) : { summary: e.message || "", quantity: "", timeline: "", itemsLine: "" }
  const spoken = voice ? itemsFor({ ...e, itemsLine: parsed.itemsLine, quantity: e.quantity || parsed.quantity }) : []
  const qtyText = String(e.quantity || parsed.quantity || (spoken.length === 1 ? spoken[0].quantity : "") || "").trim()
  const askedItems = items.length
    ? items.map((it) => ({ product: it.name || "Custom item", quantity: String(it.quantity ?? ""), unit: it.unit || "pcs" }))
    : spoken.length
      ? spoken.map((it) => ({ product: it.product, quantity: it.quantity, unit: "pcs", notes: it.notes }))
      : e.productInterest || qtyText
        ? [{ product: e.productInterest || "Not given yet", quantity: qtyText, unit: "pcs" }]
        : []
  const c0 = e.customer || {}
  const addressCity = String(c0.address || "").split(",").map((p) => p.trim()).filter(Boolean).pop() || ""
  const location = [c0.city || (voice ? addressCity : ""), c0.state || (c0.stateCode && stateName(c0.stateCode)) || ""].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ")
  if (!value && parseQuantity(qtyText) && num(e.rate)) {
    value = parseQuantity(qtyText) * num(e.rate)
    valueNote = "their rate"
  }

  const step = leadNextStep(e, now)
  const flags = leadFlags(e)
  const units = items.length ? rfqUnits(items) : spoken.length > 1 ? spoken.reduce((n, it) => n + (parseQuantity(it.quantity) || 0), 0) : parseQuantity(qtyText) || 0
  const c = e.customer || {}
  return {
    e,
    id: e.id,
    rfq,
    items,
    askedItems,
    qtyText,
    location,
    summary: voice ? parsed.summary : e.message || "",
    timeline: parsed.timeline,
    quote,
    value,
    valueNote,
    units,
    step,
    group: leadGroup(step),
    flags,
    channel: channelOf(e),
    open: OPEN_LEAD.includes(e.status || "new"),
    name: c.name?.trim() || "",
    org: [c.company, c.city].filter(Boolean).join(" · ") || c.phone || c.email || "",
    asked: items.length ? items[0].name || "Custom item" : askedItems.length > 1 ? `${askedItems[0].product} +${askedItems.length - 1} more` : e.productInterest || firstLine(parsed.summary) || "Not given",
    askedSub: items.length
      ? `Qty ${units.toLocaleString("en-IN")} · ${items.length} line${items.length === 1 ? "" : "s"}`
      : spoken.length > 1
        ? `Qty ${units ? units.toLocaleString("en-IN") : "not given"} · ${spoken.length} items`
        : qtyText
          ? /^\d[\d,]*$/.test(qtyText)
            ? `Qty ${num(qtyText).toLocaleString("en-IN")}${e.rate ? ` · ₹${e.rate}/pc` : ""}`
            : `Qty "${qtyText}"`
          : "Qty not given",
  }
}

function firstLine(text = "") {
  return String(text).split(/\n|·/)[0].trim().slice(0, 80)
}

// The coloured tags a row may carry. Colour is kept for risk only.
export function leadTags(l) {
  const out = []
  if (l.flags.support) out.push({ label: "Support", tone: "rose" })
  if (l.flags.artwork === "attached") out.push({ label: "Artwork", tone: "emerald" })
  if (l.flags.artwork === "missing") out.push({ label: "No artwork", tone: "rose" })
  if (l.flags.urgent) out.push({ label: "Urgent", tone: "amber" })
  if (l.flags.verifyQty) out.push({ label: "Verify qty", tone: "amber" })
  for (const t of l.e.tags || []) out.push({ label: t, tone: "blue" })
  return out
}

// GST read of the contact: valid GSTIN, and whether supply is inter-state.
export function gstRead(customer, companyState) {
  const g = (customer?.gstin || "").trim().toUpperCase()
  if (!g) return null
  if (gstinProblem(g, customer.stateCode)) return { ok: false, text: "Check GSTIN" }
  const inter = companyState && g.slice(0, 2) !== String(companyState).padStart(2, "0")
  return { ok: true, text: `GSTIN valid · ${inter ? "IGST" : "CGST + SGST"}`, inter, state: g.slice(0, 2) }
}

// Lifetime business with the same party, on the console's email-then-phone rule.
export function historyWith(customer, { invoices = [], quotations = [], customers = [] }) {
  const inv = invoices.filter((i) => i.status !== "cancelled" && sameCustomer(customer, i.customer))
  const quotes = quotations.filter((q) => sameCustomer(customer, q.customer))
  const master = customers.find((c) => sameCustomer(customer, c)) || null
  const lifetime = inv.reduce((s, i) => s + (Number(i.totals?.grandTotal) || 0), 0)
  const last = inv.map((i) => i.issueDate).filter(Boolean).sort().pop() || null
  return { invoices: inv, quotes, master, lifetime, last }
}
