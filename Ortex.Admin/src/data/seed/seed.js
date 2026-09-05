// Demo data seeder. Populates every collection with a coherent, cross-linked
// dataset (enquiries → leads → quotations → invoices → payments) spread over
// the last few months so the dashboard, aging buckets and trend charts are
// meaningful.
//
// WHY THE FIXTURES CARRY `key` RATHER THAN `id`
//
// The seeder used to hard-code ids ("qtn_1", "prod_mdf01") and reference them
// directly between records. That works against localStore, which keeps a
// supplied id, but silently breaks against Supabase: those tables are
// (id uuid, doc jsonb), and apiStore.toDoc() strips the id before insert,
// keeping a caller's value only when it is already a uuid. Every seeded row
// therefore landed with a fresh gen_random_uuid(), and every cross-reference
// pointed at an id that no longer existed — dangling enquiryId, quotationId and
// productId links, and `update` calls against missing rows that quietly did
// nothing, so paid invoices never received their amountPaid.
//
// Now each fixture carries a readable `key` used only inside this file. Records
// are created a stage at a time, the ids the store actually assigned are read
// back from the return value, and later stages resolve their references through
// that map. Both stores go down the identical path, so what is tested locally
// is what runs against a hosted project.

import { repo } from "../store/repository"
import { computeDocument } from "../../lib/pricing"
import { documentNumber } from "../../lib/id"
import { toast } from "sonner"

const day = 86400000
const ago = (d) => new Date(Date.now() - d * day).toISOString()
const inFuture = (d) => new Date(Date.now() + d * day).toISOString()

// Home state = Delhi (07). Customers outside 07 are inter-state (IGST).
const HOME_STATE = "07"
const interState = (code) => code && code !== HOME_STATE

// Create a stage and return { key: assignedId }. `key` is stripped before the
// write, so nothing fixture-only reaches the database.
async function createMapped(collection, rows) {
  const created = await repo.bulkCreate(
    collection,
    rows.map(({ key, ...rest }) => {
      void key
      return rest
    }),
  )
  if (created.length !== rows.length) {
    throw new Error(`seed: ${collection} returned ${created.length} rows for ${rows.length} inputs`)
  }
  return Object.fromEntries(rows.map((row, i) => [row.key, created[i].id]))
}

const PRODUCTS = [
  { key: "mdf01", name: "Custom MDF Award Trophy", sku: "MDF-TRO-01", category: "MDF products", hsn: "4420", unit: "pcs", material: "9mm MDF + acrylic", basePrice: 320, costPrice: 165, moq: 50, gstRate: 18, leadTimeDays: 8, status: "active", description: "Laser-engraved MDF trophy with acrylic front plate." },
  { key: "acr01", name: "Acrylic Desk Standee", sku: "ACR-STD-01", category: "Acrylic products", hsn: "3926", unit: "pcs", material: "5mm cast acrylic", basePrice: 210, costPrice: 95, moq: 50, gstRate: 18, leadTimeDays: 6, status: "active", description: "UV-printed acrylic desk standee, custom shape." },
  { key: "lan01", name: "Sublimation Lanyard 16mm", sku: "LAN-SUB-16", category: "Lanyards & ID card accessories", hsn: "6307", unit: "pcs", material: "Polyester + trigger hook", basePrice: 22, costPrice: 9, moq: 100, gstRate: 12, leadTimeDays: 5, status: "active", description: "Full-colour sublimation lanyard with metal trigger hook." },
  { key: "bad01", name: "Metal Name Badge (Magnet)", sku: "BAD-MAG-01", category: "Badge manufacturing", hsn: "8306", unit: "pcs", material: "Brass + magnet backing", basePrice: 85, costPrice: 38, moq: 50, gstRate: 18, leadTimeDays: 7, status: "active", description: "Engraved metal name badge with strong magnet backing." },
  { key: "brd01", name: "Examination Clipboard Board", sku: "BRD-EXM-01", category: "Examination boards", hsn: "3926", unit: "pcs", material: "PVC board + clip", basePrice: 78, costPrice: 34, moq: 25, gstRate: 18, leadTimeDays: 6, status: "active", description: "A4 examination clipboard with branded print." },
  { key: "gft01", name: "Insulated Steel Bottle 750ml", sku: "GFT-BTL-750", category: "Corporate gifting & merchandise", hsn: "9617", unit: "pcs", material: "Stainless steel", basePrice: 340, costPrice: 190, moq: 25, gstRate: 18, leadTimeDays: 10, status: "active", description: "Double-wall insulated bottle with laser-branded logo." },
  { key: "gft02", name: "Executive Diary + Pen Set", sku: "GFT-DRY-01", category: "Corporate gifting & merchandise", hsn: "4820", unit: "set", material: "PU leather diary + metal pen", basePrice: 265, costPrice: 140, moq: 25, gstRate: 18, leadTimeDays: 9, status: "active", description: "A5 executive diary with metal pen in gift box." },
  { key: "cbd01", name: "Branded Writing Pad", sku: "CBD-PAD-01", category: "Clipboards & writing pads", hsn: "4820", unit: "pcs", material: "MDF clip pad", basePrice: 95, costPrice: 44, moq: 50, gstRate: 18, leadTimeDays: 6, status: "draft", description: "MDF writing pad with company branding." },
]

const productByKey = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]))

// A line still keyed by fixture; resolveLines() swaps in the real product id
// once products exist. Totals are computed from the line values, not the id, so
// pricing is unaffected by the indirection.
function line(productKey, quantity, discountPercent = 0) {
  const p = productByKey[productKey]
  return { productKey, description: p.name, hsn: p.hsn, quantity, rate: p.basePrice, discountPercent, gstRate: p.gstRate }
}

const resolveLines = (lines, productIds) =>
  lines.map(({ productKey, ...rest }) => ({ ...rest, productId: productIds[productKey] ?? null }))

function cust(name, company, email, phone, stateCode, gstin = "", address = "") {
  return { name, company, email, phone, stateCode, gstin, address }
}

const CUSTOMERS = {
  bright: cust("Priya Sharma", "Bright Corp", "priya@brightcorp.in", "+91-9876543210", "07", "07AABCB1234C1Z2", "Connaught Place, New Delhi"),
  technova: cust("Rahul Verma", "TechNova Solutions", "rahul.v@technova.com", "+91-9811122233", "27", "27AACCT5678D1Z9", "Andheri East, Mumbai, Maharashtra"),
  edulearn: cust("Anita Desai", "EduLearn Academy", "anita@edulearn.org", "+91-9900011122", "29", "29AAECE9012E1Z1", "Koramangala, Bengaluru, Karnataka"),
  gifthub: cust("Vikram Singh", "GiftHub Retail", "vikram@gifthub.in", "+91-9765432109", "07", "07AAGCG3456F1Z8", "Karol Bagh, New Delhi"),
  acme: cust("Meera Nair", "Acme Manufacturing", "meera.nair@acmemfg.com", "+91-9654321098", "24", "24AAACA7890G1Z3", "Vatva GIDC, Ahmedabad, Gujarat"),
  startupx: cust("Karan Mehta", "StartupX", "karan@startupx.io", "+91-9543210987", "07", "", "Nehru Place, New Delhi"),
}

function makeDoc(customer, lines, extraDiscountPercent = 0) {
  return computeDocument(lines, { interState: interState(customer.stateCode), extraDiscountPercent })
}

const CATEGORIES = [
  { name: "MDF products", hsn: "4420", gstRate: 18 },
  { name: "Acrylic products", hsn: "3926", gstRate: 18 },
  { name: "Lanyards & ID card accessories", hsn: "6307", gstRate: 12 },
  { name: "Badge manufacturing", hsn: "8306", gstRate: 18 },
  { name: "Examination boards", hsn: "3926", gstRate: 18 },
  { name: "Clipboards & writing pads", hsn: "4820", gstRate: 18 },
  { name: "Corporate gifting & merchandise", hsn: "9617", gstRate: 18 },
  { name: "Customization & branding", hsn: "9989", gstRate: 18 },
]

export async function seedDemo() {
  // ---- categories, products & customers (no inbound references) ----
  await repo.bulkCreate("categories", CATEGORIES.map((c) => ({ ...c, description: "" })))
  const productIds = await createMapped("products", PRODUCTS)
  await repo.bulkCreate("customers", Object.values(CUSTOMERS).map((c) => ({ ...c })))

  // ---- enquiries ----
  const enquiries = [
    { key: "e1", customer: CUSTOMERS.bright, source: "Website contact form", productInterest: "MDF products", message: "Need 500 custom MDF award trophies with laser engraving for our annual event.", status: "won", starred: true, owner: "Sales desk", notes: "Converted - repeat client.", createdAt: ago(96) },
    { key: "e2", customer: CUSTOMERS.technova, source: "Quote calculator", productInterest: "Lanyards & ID card accessories", message: "1000 sublimation lanyards in brand colours for a conference.", status: "won", starred: false, owner: "Sales desk", notes: "", createdAt: ago(70) },
    { key: "e3", customer: CUSTOMERS.edulearn, source: "Referral", productInterest: "Examination boards", message: "200 exam clipboards for our centres.", status: "quoted", starred: false, owner: "Sales desk", notes: "Awaiting PO.", createdAt: ago(20) },
    { key: "e4", customer: CUSTOMERS.gifthub, source: "WhatsApp", productInterest: "Corporate gifting & merchandise", message: "Diwali gifting - bottles + diaries, ~300 sets.", status: "won", starred: true, owner: "Sales desk", notes: "", createdAt: ago(55) },
    { key: "e5", customer: CUSTOMERS.acme, source: "Trade show", productInterest: "Badge manufacturing", message: "Metal badges with magnet backing, ~150 pcs.", status: "lost", starred: false, owner: "Sales desk", notes: "Went with local vendor on price.", createdAt: ago(40) },
    { key: "e6", customer: CUSTOMERS.startupx, source: "Website contact form", productInterest: "Acrylic products", message: "Acrylic desk standees for new office, custom shapes.", status: "quoted", starred: false, owner: "Sales desk", notes: "", createdAt: ago(12) },
    { key: "e7", customer: cust("Sunita Rao", "Horizon Events", "sunita@horizonevents.in", "+91-9432101234", "07"), source: "Phone", productInterest: "Corporate gifting & merchandise", message: "Enquiry for event welcome kits.", status: "new", starred: false, owner: "", notes: "", createdAt: ago(3) },
    { key: "e8", customer: cust("Amit Patel", "NextGen Pharma", "amit@nextgenpharma.com", "+91-9321012345", "24"), source: "Email", productInterest: "Lanyards & ID card accessories", message: "Need ID card lanyards for 400 staff.", status: "contacted", starred: false, owner: "Sales desk", notes: "Follow up Monday.", createdAt: ago(6) },
  ]
  const enquiryIds = await createMapped("enquiries", enquiries)

  // ---- leads (pipeline, converted from enquiries) ----
  const today = new Date().toISOString()
  const horizon = cust("Sunita Rao", "Horizon Events", "sunita@horizonevents.in", "+91-9432101234", "07")
  const nextgen = cust("Amit Patel", "NextGen Pharma", "amit@nextgenpharma.com", "+91-9321012345", "24")
  const leads = [
    { key: "l1", from: "e3", quote: "q3", customer: CUSTOMERS.edulearn, source: "Referral", productInterest: "Examination boards", quantityEstimate: "200 pcs", estimatedValue: 18400, stage: "quoted", owner: "Sales desk", nextFollowUp: today, lastActivityAt: ago(2), lostReason: "", activities: [{ id: "act_s1", type: "Quote sent", direction: "outbound", summary: "Sent quotation for 200 exam clipboards. Awaiting PO.", at: ago(2), owner: "Sales desk" }], notes: "Price-sensitive; competing with local vendor.", createdAt: ago(20) },
    { key: "l2", from: "e6", customer: CUSTOMERS.startupx, source: "Website contact form", productInterest: "Acrylic products", quantityEstimate: "120 pcs", estimatedValue: 60000, stage: "negotiation", owner: "Sales desk", nextFollowUp: ago(1), lastActivityAt: ago(3), lostReason: "", activities: [{ id: "act_s2", type: "Call", direction: "outbound", summary: "Discussed custom shape cutting; sending revised rate.", at: ago(3), owner: "Sales desk" }], notes: "Wants custom shapes - negotiating cutting cost.", createdAt: ago(10) },
    { key: "l3", from: "e5", customer: CUSTOMERS.acme, source: "Trade show", productInterest: "Badge manufacturing", quantityEstimate: "150 pcs", estimatedValue: 20000, stage: "lost", owner: "Sales desk", nextFollowUp: null, lastActivityAt: ago(30), lostReason: "Price too high", activities: [{ id: "act_s3", type: "Note", direction: "outbound", summary: "Lost to a local vendor on price.", at: ago(30), owner: "Sales desk" }], notes: "", createdAt: ago(38) },
    { key: "l4", from: "e7", customer: horizon, source: "Phone", productInterest: "Corporate gifting & merchandise", quantityEstimate: "250 kits", estimatedValue: 112000, stage: "contacted", owner: "Sales desk", nextFollowUp: today, lastActivityAt: ago(1), lostReason: "", activities: [{ id: "act_s4", type: "WhatsApp", direction: "outbound", summary: "Shared gifting catalogue; they will confirm kit contents.", at: ago(1), owner: "Sales desk" }], notes: "Event welcome kits for a Sept conference.", createdAt: ago(3) },
    { key: "l5", from: "e8", customer: nextgen, source: "Email", productInterest: "Lanyards & ID card accessories", quantityEstimate: "400 pcs", estimatedValue: 9000, stage: "qualified", owner: "Sales desk", nextFollowUp: ago(2), lastActivityAt: ago(4), lostReason: "", activities: [{ id: "act_s5", type: "Call", direction: "inbound", summary: "Confirmed 400 staff lanyards, ID card holders needed.", at: ago(4), owner: "Sales desk" }], notes: "Follow up with a sample.", createdAt: ago(6) },
  ]
  const leadIds = await createMapped(
    "leads",
    leads.map(({ from, quote, ...l }) => {
      void quote
      return { ...l, enquiryId: enquiryIds[from] ?? null, linkedQuotationId: null }
    }),
  )

  // Link the originating enquiries back to their leads.
  for (const l of leads) {
    if (l.from) await repo.update("enquiries", enquiryIds[l.from], { leadId: leadIds[l.key] })
  }

  // ---- quotations ----
  const q1Lines = [line("mdf01", 500, 10)]
  const q2Lines = [line("lan01", 1000, 15)]
  const q3Lines = [line("brd01", 200, 5)]
  const q4Lines = [line("gft01", 300, 10), line("gft02", 300, 10)]
  const q5Lines = [line("bad01", 150, 0)]
  const q6Lines = [line("acr01", 120, 0)]
  const q7Lines = [line("gft01", 80, 0)]

  const quotations = [
    { key: "q1", from: "e1", number: documentNumber("QTN", 1), status: "invoiced", customer: CUSTOMERS.bright, lines: q1Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.bright, q1Lines), issueDate: ago(94), validUntil: ago(79), validityDays: 15, notes: "", terms: "", lostReason: "", createdAt: ago(94) },
    { key: "q2", from: "e2", number: documentNumber("QTN", 2), status: "invoiced", customer: CUSTOMERS.technova, lines: q2Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.technova, q2Lines), issueDate: ago(68), validUntil: ago(53), validityDays: 15, notes: "", terms: "", lostReason: "", createdAt: ago(68) },
    { key: "q3", from: "e3", number: documentNumber("QTN", 3), status: "sent", customer: CUSTOMERS.edulearn, lines: q3Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.edulearn, q3Lines), issueDate: ago(18), validUntil: inFuture(-3), validityDays: 15, notes: "Awaiting PO confirmation.", terms: "", lostReason: "", createdAt: ago(18) },
    { key: "q4", from: "e4", number: documentNumber("QTN", 4), status: "invoiced", customer: CUSTOMERS.gifthub, lines: q4Lines, extraDiscountPercent: 5, totals: makeDoc(CUSTOMERS.gifthub, q4Lines, 5), issueDate: ago(52), validUntil: ago(37), validityDays: 15, notes: "", terms: "", lostReason: "", createdAt: ago(52) },
    { key: "q5", from: "e5", number: documentNumber("QTN", 5), status: "rejected", customer: CUSTOMERS.acme, lines: q5Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.acme, q5Lines), issueDate: ago(38), validUntil: ago(23), validityDays: 15, notes: "", terms: "", lostReason: "Price too high", createdAt: ago(38) },
    { key: "q6", from: "e6", number: documentNumber("QTN", 6), status: "sent", customer: CUSTOMERS.startupx, lines: q6Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.startupx, q6Lines), issueDate: ago(10), validUntil: inFuture(5), validityDays: 15, notes: "", terms: "", lostReason: "", createdAt: ago(10) },
    { key: "q7", from: null, number: documentNumber("QTN", 7), status: "draft", customer: CUSTOMERS.gifthub, lines: q7Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.gifthub, q7Lines), issueDate: ago(2), validUntil: inFuture(13), validityDays: 15, notes: "Repeat customer top-up order.", terms: "", lostReason: "", createdAt: ago(2) },
  ]
  const quotationIds = await createMapped(
    "quotations",
    quotations.map(({ from, ...q }) => ({
      ...q,
      lines: resolveLines(q.lines, productIds),
      enquiryId: from ? enquiryIds[from] : null,
      invoiceId: null,
    })),
  )

  // The lead that produced a quote now points at the real quotation.
  for (const l of leads) {
    if (l.quote) await repo.update("leads", leadIds[l.key], { linkedQuotationId: quotationIds[l.quote] })
  }

  // ---- invoices (converted from accepted quotes) ----
  const invoices = [
    { key: "i1", from: "q1", number: documentNumber("INV", 1), status: "paid", customer: CUSTOMERS.bright, lines: q1Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.bright, q1Lines), issueDate: ago(90), dueDate: ago(75), notes: "", terms: "", quotationNumber: documentNumber("QTN", 1), amountPaid: 0, createdAt: ago(90) },
    { key: "i2", from: "q2", number: documentNumber("INV", 2), status: "paid", customer: CUSTOMERS.technova, lines: q2Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.technova, q2Lines), issueDate: ago(64), dueDate: ago(49), notes: "", terms: "", quotationNumber: documentNumber("QTN", 2), amountPaid: 0, createdAt: ago(64) },
    { key: "i3", from: "q4", number: documentNumber("INV", 3), status: "partial", customer: CUSTOMERS.gifthub, lines: q4Lines, extraDiscountPercent: 5, totals: makeDoc(CUSTOMERS.gifthub, q4Lines, 5), issueDate: ago(48), dueDate: ago(33), notes: "50% advance received.", terms: "", quotationNumber: documentNumber("QTN", 4), amountPaid: 0, createdAt: ago(48) },
    { key: "i4", from: null, number: documentNumber("INV", 4), status: "overdue", customer: CUSTOMERS.edulearn, lines: q3Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.edulearn, q3Lines), issueDate: ago(50), dueDate: ago(20), notes: "Payment reminder sent twice.", terms: "", quotationNumber: "", amountPaid: 0, createdAt: ago(50) },
    { key: "i5", from: null, number: documentNumber("INV", 5), status: "sent", customer: CUSTOMERS.startupx, lines: q6Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.startupx, q6Lines), issueDate: ago(5), dueDate: inFuture(10), notes: "", terms: "", quotationNumber: "", amountPaid: 0, createdAt: ago(5) },
  ]
  const invoiceIds = await createMapped(
    "invoices",
    invoices.map(({ from, ...inv }) => ({
      ...inv,
      lines: resolveLines(inv.lines, productIds),
      quotationId: from ? quotationIds[from] : null,
    })),
  )

  // Close the loop: an invoiced quotation points back at its invoice.
  for (const inv of invoices) {
    if (inv.from) await repo.update("quotations", quotationIds[inv.from], { invoiceId: invoiceIds[inv.key] })
  }

  // ---- payments ----
  const byKey = Object.fromEntries(invoices.map((i) => [i.key, i]))
  const total = (key) => byKey[key].totals.grandTotal
  const half = (key) => Math.round(total(key) / 2)

  const payments = [
    { key: "p1", on: "i1", number: documentNumber("PAY", 1), type: "inflow", amount: total("i1"), method: "Bank transfer / NEFT", date: ago(74), reference: "NEFT-8891", note: "Full payment", invoiceNumber: byKey.i1.number, party: CUSTOMERS.bright.name, customer: CUSTOMERS.bright, createdAt: ago(74) },
    { key: "p2", on: "i2", number: documentNumber("PAY", 2), type: "inflow", amount: total("i2"), method: "UPI", date: ago(50), reference: "UPI-4471", note: "Full payment", invoiceNumber: byKey.i2.number, party: CUSTOMERS.technova.name, customer: CUSTOMERS.technova, createdAt: ago(50) },
    { key: "p3", on: "i3", number: documentNumber("PAY", 3), type: "inflow", amount: half("i3"), method: "UPI", date: ago(47), reference: "UPI-5522", note: "50% advance", invoiceNumber: byKey.i3.number, party: CUSTOMERS.gifthub.name, customer: CUSTOMERS.gifthub, createdAt: ago(47) },
    { key: "p4", on: null, number: documentNumber("PAY", 4), type: "payout", amount: 42000, method: "RTGS", date: ago(60), reference: "PO-MAT-221", note: "Raw material - acrylic sheets", invoiceNumber: "", party: "Sheela Acrylics Pvt Ltd", customer: null, createdAt: ago(60) },
    { key: "p5", on: null, number: documentNumber("PAY", 5), type: "payout", amount: 18500, method: "Bank transfer / NEFT", date: ago(30), reference: "PO-JOB-118", note: "Job-work - laser engraving", invoiceNumber: "", party: "Precision Laserworks", customer: null, createdAt: ago(30) },
  ]
  await createMapped(
    "payments",
    payments.map(({ on, ...p }) => ({ ...p, invoiceId: on ? invoiceIds[on] : null })),
  )

  // Sync cached amountPaid on partially/fully paid invoices.
  await repo.update("invoices", invoiceIds.i1, { amountPaid: total("i1") })
  await repo.update("invoices", invoiceIds.i2, { amountPaid: total("i2") })
  await repo.update("invoices", invoiceIds.i3, { amountPaid: half("i3") })

  // ---- Message Templates ----
  const TEMPLATES = [
    { key: "quote_request", name: "template_quote_request", category: "Quote Request", body: "Hi {name}, we received your quote request for {product_name}. Our team is working on your pricing. - Ortex Sales Desk", placeholders: ["name", "product_name"] },
    { key: "contact_form", name: "template_contact_form", category: "Contact Form", body: "Hi {name}, thanks for contacting us! We received your message: \"{message_snippet}\". A representative will contact you soon. - Ortex Industries", placeholders: ["name", "message_snippet"] },
    { key: "cart_abandonment", name: "template_cart_abandonment", category: "Cart Abandonment", body: "Hi {name}, we noticed you left some items in your quote cart, including {product_name}. Can we help you finalize your quote? - Ortex Sales", placeholders: ["name", "product_name"] },
    { key: "order_confirm", name: "template_order_confirm", category: "Order Confirmation", body: "Hi {name}, your order for {product_name} ({quantity} {unit}) is confirmed! Invoice {invoice_number} has been generated. - Ortex Industries", placeholders: ["name", "product_name", "quantity", "unit", "invoice_number"] },
    { key: "payment_confirm", name: "template_payment_confirm", category: "Payment Confirmation", body: "Hi {name}, we received your payment of ₹{amount} for Invoice {invoice_number}. Thank you! - Ortex Accounts", placeholders: ["name", "amount", "invoice_number"] },
  ]
  const templateIds = await createMapped("message_templates", TEMPLATES)

  // ---- Automation Rules ----
  const RULES = [
    { key: "r1", uses: "quote_request", name: "Quote Request Follow-up", triggerEvent: "quote_requested", actionType: "whatsapp", delayMinutes: 0, active: true, description: "Send WhatsApp immediately after quote calculator submission." },
    { key: "r2", uses: "contact_form", name: "Contact Form Auto-reply", triggerEvent: "contact_form_submitted", actionType: "whatsapp", delayMinutes: 0, active: true, description: "Send welcome reply after contact form submission." },
    { key: "r3", uses: "cart_abandonment", name: "Cart Abandonment Reminder", triggerEvent: "cart_abandoned", actionType: "whatsapp", delayMinutes: 30, active: true, description: "Send reminder 30 minutes after quote cart is inactive." },
    { key: "r4", uses: "order_confirm", name: "Order Confirmation Notification", triggerEvent: "order_confirmed", actionType: "whatsapp", delayMinutes: 0, active: true, description: "Send confirmation message when invoice is generated." },
    { key: "r5", uses: "payment_confirm", name: "Payment Receipt Confirmation", triggerEvent: "payment_received", actionType: "whatsapp", delayMinutes: 0, active: true, description: "Send payment confirmation upon receiving payment inflow." },
  ]
  await createMapped(
    "automation_rules",
    RULES.map(({ uses, ...r }) => ({ ...r, templateId: templateIds[uses] })),
  )

  // ---- User Activities ----
  // Demo geolocation for the fake IPs below. It lives here, in the fixture,
  // rather than in a lookup table inside the Activities table renderer — that
  // one guessed "Delhi, India" for every IP it didn't recognise, including real
  // visitor traffic.
  const GEO = {
    "103.88.22.41": { city: "Delhi", country: "India", location: "Delhi, India" },
    "122.161.4.19": { city: "Mumbai", country: "India", location: "Mumbai, Maharashtra, India" },
    "223.189.14.77": { city: "Bengaluru", country: "India", location: "Bengaluru, Karnataka, India" },
    "115.241.89.5": { city: "Ahmedabad", country: "India", location: "Ahmedabad, Gujarat, India" },
  }

  const ACTIVITIES = [
    { key: "a1", userId: "usr_priya", sessionId: "sess_p1", activityType: "Home page visit", pageUrl: "/", referrer: "Google Search", timestamp: ago(4), device: "Mobile", browser: "Chrome", operatingSystem: "Android", ipAddress: "103.88.22.41", metadata: {} },
    { key: "a2", product: "mdf01", userId: "usr_priya", sessionId: "sess_p1", activityType: "Product page visit", pageUrl: "/products?product=Custom%20MDF%20Award%20Trophy", referrer: "Home page link", timestamp: ago(4), device: "Mobile", browser: "Chrome", operatingSystem: "Android", ipAddress: "103.88.22.41", metadata: { productName: "Custom MDF Award Trophy" } },
    { key: "a3", userId: "usr_priya", sessionId: "sess_p1", activityType: "Quote request", pageUrl: "/quote", referrer: "Products page link", timestamp: ago(4), device: "Mobile", browser: "Chrome", operatingSystem: "Android", ipAddress: "103.88.22.41", metadata: { customer: CUSTOMERS.bright, productName: "Custom MDF Award Trophy", quantity: 500 } },
    { key: "a4", userId: "usr_rahul", sessionId: "sess_r1", activityType: "Product search", pageUrl: "/products?search=lanyards", referrer: "Direct", timestamp: ago(3), device: "Desktop", browser: "Chrome", operatingSystem: "Windows", ipAddress: "122.161.4.19", metadata: { searchQuery: "lanyards" } },
    { key: "a5", product: "lan01", userId: "usr_rahul", sessionId: "sess_r1", activityType: "Product page visit", pageUrl: "/products?product=Sublimation%20Lanyard%2016mm", referrer: "Search results", timestamp: ago(3), device: "Desktop", browser: "Chrome", operatingSystem: "Windows", ipAddress: "122.161.4.19", metadata: { productName: "Sublimation Lanyard 16mm" } },
    { key: "a6", userId: "usr_rahul", sessionId: "sess_r1", activityType: "Contact form submission", pageUrl: "/contact", referrer: "Products page link", timestamp: ago(3), device: "Desktop", browser: "Chrome", operatingSystem: "Windows", ipAddress: "122.161.4.19", metadata: { customer: CUSTOMERS.technova, productName: "Sublimation Lanyard 16mm", message: "1000 sublimation lanyards in brand colours for a conference." } },
    { key: "a7", userId: "usr_anon1", sessionId: "sess_a1", activityType: "Home page visit", pageUrl: "/", referrer: "LinkedIn Ads", timestamp: ago(2), device: "Mobile", browser: "Safari", operatingSystem: "iOS", ipAddress: "223.189.14.77", metadata: {} },
    { key: "a8", product: "acr01", userId: "usr_anon1", sessionId: "sess_a1", activityType: "Product page visit", pageUrl: "/products?product=Acrylic%20Desk%20Standee", referrer: "Home page", timestamp: ago(2), device: "Mobile", browser: "Safari", operatingSystem: "iOS", ipAddress: "223.189.14.77", metadata: { productName: "Acrylic Desk Standee" } },
    { key: "a9", userId: "usr_anon1", sessionId: "sess_a1", activityType: "Cart actions", pageUrl: "/quote", referrer: "Products", timestamp: ago(2), device: "Mobile", browser: "Safari", operatingSystem: "iOS", ipAddress: "223.189.14.77", metadata: { action: "add", productName: "Acrylic Desk Standee", quantity: 50 } },
    { key: "a10", userId: "usr_anita", sessionId: "sess_an1", activityType: "PDF download", pageUrl: "/products", referrer: "Direct", timestamp: ago(1), device: "Desktop", browser: "Firefox", operatingSystem: "Linux", ipAddress: "115.241.89.5", metadata: { fileName: "Ortex_Product_Catalogue_2026.pdf" } },
  ].map(({ product, ...a }) => ({ ...a, ...GEO[a.ipAddress], productId: product ? productIds[product] : null }))
  const activityIds = await createMapped("user_activities", ACTIVITIES)

  // ---- Event Logs ----
  const EVENTS = [
    { key: "v1", on: "a1", eventType: "home_visited", userId: "usr_priya", description: "User visited the home page.", timestamp: ago(4), status: "processed" },
    { key: "v2", on: "a2", eventType: "product_visited", userId: "usr_priya", description: "User viewed product: Custom MDF Award Trophy.", timestamp: ago(4), status: "processed" },
    { key: "v3", on: "a3", eventType: "quote_requested", userId: "usr_priya", description: "User requested a quote for Custom MDF Award Trophy (500 pcs).", timestamp: ago(4), status: "processed" },
    { key: "v4", on: "a4", eventType: "search_performed", userId: "usr_rahul", description: "User searched for: \"lanyards\".", timestamp: ago(3), status: "processed" },
    { key: "v5", on: "a5", eventType: "product_visited", userId: "usr_rahul", description: "User viewed product: Sublimation Lanyard 16mm.", timestamp: ago(3), status: "processed" },
    { key: "v6", on: "a6", eventType: "contact_form_submitted", userId: "usr_rahul", description: "User submitted contact form for Sublimation Lanyard 16mm.", timestamp: ago(3), status: "processed" },
    { key: "v7", on: "a7", eventType: "home_visited", userId: "usr_anon1", description: "User visited the home page.", timestamp: ago(2), status: "processed" },
    { key: "v8", on: "a8", eventType: "product_visited", userId: "usr_anon1", description: "User viewed product: Acrylic Desk Standee.", timestamp: ago(2), status: "processed" },
    { key: "v9", on: "a9", eventType: "cart_abandoned", userId: "usr_anon1", description: "User abandoned cart with Acrylic Desk Standee (50 pcs).", timestamp: ago(2), status: "processed" },
    { key: "v10", on: "a10", eventType: "pdf_downloaded", userId: "usr_anita", description: "User downloaded PDF: Ortex_Product_Catalogue_2026.pdf.", timestamp: ago(1), status: "processed" },
  ]
  const eventIds = await createMapped(
    "event_logs",
    EVENTS.map(({ on, ...e }) => ({ ...e, activityId: activityIds[on] })),
  )

  // ---- AI Messages ----
  const AI_MESSAGES = [
    { key: "m1", on: "v3", userId: "usr_priya", customerName: "Priya Sharma", triggerType: "Quote Request Follow-up", context: "Trigger: Quote Request Follow-up. User activity: User requested a quote for Custom MDF Award Trophy (500 pcs). Customer details: Priya Sharma (+91-9876543210).", generatedMessage: "Hi Priya Sharma, we received your quote request for Custom MDF Award Trophy. Our team is working on your pricing. - Ortex Sales Desk", createdAt: ago(4) },
    { key: "m2", on: "v6", userId: "usr_rahul", customerName: "Rahul Verma", triggerType: "Contact Form Auto-reply", context: "Trigger: Contact Form Auto-reply. User activity: User submitted contact form for Sublimation Lanyard 16mm. Customer details: Rahul Verma (+91-9811122233).", generatedMessage: "Hi Rahul Verma, thanks for contacting us! We received your message: \"1000 sublimation lanyards in brand colours for a conference.\". A representative will contact you soon. - Ortex Industries", createdAt: ago(3) },
    { key: "m3", on: "v9", userId: "usr_anon1", customerName: "Anonymous Buyer", triggerType: "Cart Abandonment Reminder", context: "Trigger: Cart Abandonment Reminder. User activity: User abandoned cart with Acrylic Desk Standee (50 pcs).", generatedMessage: "Hi Customer, we noticed you left some items in your quote cart, including Acrylic Desk Standee. Can we help you finalize your quote? - Ortex Sales", createdAt: ago(2) },
  ]
  await createMapped(
    "ai_messages",
    AI_MESSAGES.map(({ on, ...m }) => ({ ...m, eventId: eventIds[on] })),
  )

  // ---- WhatsApp Logs ----
  // templateName is a name, not a foreign key, so it needs no remapping.
  const WA_LOGS = [
    { userId: "usr_priya", customerName: "Priya Sharma", phone: "+91-9876543210", templateName: "template_quote_request", messageText: "Hi Priya Sharma, we received your quote request for Custom MDF Award Trophy. Our team is working on your pricing. - Ortex Sales Desk", status: "delivered", retryCount: 0, maxRetries: 3, errorMessage: "", responsePayload: { success: true }, createdAt: ago(4), sentAt: ago(4) },
    { userId: "usr_rahul", customerName: "Rahul Verma", phone: "+91-9811122233", templateName: "template_contact_form", messageText: "Hi Rahul Verma, thanks for contacting us! We received your message: \"1000 sublimation lanyards in brand colours for a conference.\". A representative will contact you soon. - Ortex Industries", status: "delivered", retryCount: 0, maxRetries: 3, errorMessage: "", responsePayload: { success: true }, createdAt: ago(3), sentAt: ago(3) },
    { userId: "usr_anon1", customerName: "Anonymous Buyer", phone: "+91-9999999999", templateName: "template_cart_abandonment", messageText: "Hi Customer, we noticed you left some items in your quote cart, including Acrylic Desk Standee. Can we help you finalize your quote? - Ortex Sales", status: "failed", retryCount: 3, maxRetries: 3, errorMessage: "API Error: Invalid recipient phone number format.", responsePayload: null, createdAt: ago(2), sentAt: ago(2) },
  ]
  await repo.bulkCreate("whatsapp_logs", WA_LOGS)

  // Advance numbering counters past the seeded documents.
  const settings = await repo.getSettings()
  await repo.saveSettings({
    ...settings,
    numbering: { ...settings.numbering, quotationSeq: 8, invoiceSeq: 6, paymentSeq: 6 },
  })
}

// UI entry point used by both the Dashboard empty state and Settings → Data:
// seed everything and confirm with a toast.
export async function loadDemoData() {
  await seedDemo()
  toast.success("Demo data loaded")
}

// ---- Removing the demo dataset ---------------------------------------------

// The seeded customers are the anchor: every demo enquiry, lead, quotation,
// invoice and payment carries one of these emails on its embedded `customer`,
// so matching on them removes the sample data without touching anything a real
// visitor or IndiaMART created. Products, categories and the analytics logs are
// deliberately left alone - the marketing site reads the catalogue live, and a
// blanket delete there would empty the public product pages.
export const DEMO_EMAILS = Object.values(CUSTOMERS).map((c) => c.email)

const emailOf = (row) => (row?.customer?.email || row?.email || "").toLowerCase()
const isDemoRow = (row) => DEMO_EMAILS.includes(emailOf(row))

// Children first so a failure part-way through never orphans a document.
const DEMO_COLLECTIONS = ["payments", "invoices", "quotations", "leads", "enquiries", "customers"]

/** How many rows the demo purge would delete, by collection. */
export async function countDemoData() {
  const counts = {}
  for (const name of DEMO_COLLECTIONS) {
    const rows = await repo.list(name)
    counts[name] = rows.filter(isDemoRow).length
  }
  return counts
}

/** Delete every seeded record. Returns the same shape as countDemoData(). */
export async function removeDemoData() {
  const removed = {}
  for (const name of DEMO_COLLECTIONS) {
    const rows = await repo.list(name)
    const doomed = rows.filter(isDemoRow)
    for (const row of doomed) await repo.remove(name, row.id)
    removed[name] = doomed.length
  }
  return removed
}
