// Demo data seeder. Populates every collection with a coherent, cross-linked
// dataset (enquiries → quotations → invoices → payments) spread over the last
// few months so the dashboard, aging buckets and trend charts are meaningful.
//
// Records are written with fixed ids and pre-computed totals via the same
// pricing engine the live app uses, then the numbering counters are advanced
// so freshly-created documents continue the sequence cleanly.

import { repo } from "./repository"
import { computeDocument } from "../lib/pricing"
import { documentNumber } from "../lib/id"

const day = 86400000
const ago = (d) => new Date(Date.now() - d * day).toISOString()
const inFuture = (d) => new Date(Date.now() + d * day).toISOString()

// Home state = Delhi (07). Customers outside 07 are inter-state (IGST).
const HOME_STATE = "07"
const interState = (code) => code && code !== HOME_STATE

const PRODUCTS = [
  { id: "prod_mdf01", name: "Custom MDF Award Trophy", sku: "MDF-TRO-01", category: "MDF products", hsn: "4420", unit: "pcs", material: "9mm MDF + acrylic", basePrice: 320, costPrice: 165, moq: 50, gstRate: 18, leadTimeDays: 8, status: "active", description: "Laser-engraved MDF trophy with acrylic front plate." },
  { id: "prod_acr01", name: "Acrylic Desk Standee", sku: "ACR-STD-01", category: "Acrylic products", hsn: "3926", unit: "pcs", material: "5mm cast acrylic", basePrice: 210, costPrice: 95, moq: 50, gstRate: 18, leadTimeDays: 6, status: "active", description: "UV-printed acrylic desk standee, custom shape." },
  { id: "prod_lan01", name: "Sublimation Lanyard 16mm", sku: "LAN-SUB-16", category: "Lanyards & ID card accessories", hsn: "6307", unit: "pcs", material: "Polyester + trigger hook", basePrice: 22, costPrice: 9, moq: 100, gstRate: 12, leadTimeDays: 5, status: "active", description: "Full-colour sublimation lanyard with metal trigger hook." },
  { id: "prod_bad01", name: "Metal Name Badge (Magnet)", sku: "BAD-MAG-01", category: "Badge manufacturing", hsn: "8306", unit: "pcs", material: "Brass + magnet backing", basePrice: 85, costPrice: 38, moq: 50, gstRate: 18, leadTimeDays: 7, status: "active", description: "Engraved metal name badge with strong magnet backing." },
  { id: "prod_brd01", name: "Examination Clipboard Board", sku: "BRD-EXM-01", category: "Examination boards", hsn: "3926", unit: "pcs", material: "PVC board + clip", basePrice: 78, costPrice: 34, moq: 25, gstRate: 18, leadTimeDays: 6, status: "active", description: "A4 examination clipboard with branded print." },
  { id: "prod_gft01", name: "Insulated Steel Bottle 750ml", sku: "GFT-BTL-750", category: "Corporate gifting & merchandise", hsn: "9617", unit: "pcs", material: "Stainless steel", basePrice: 340, costPrice: 190, moq: 25, gstRate: 18, leadTimeDays: 10, status: "active", description: "Double-wall insulated bottle with laser-branded logo." },
  { id: "prod_gft02", name: "Executive Diary + Pen Set", sku: "GFT-DRY-01", category: "Corporate gifting & merchandise", hsn: "4820", unit: "set", material: "PU leather diary + metal pen", basePrice: 265, costPrice: 140, moq: 25, gstRate: 18, leadTimeDays: 9, status: "active", description: "A5 executive diary with metal pen in gift box." },
  { id: "prod_cbd01", name: "Branded Writing Pad", sku: "CBD-PAD-01", category: "Clipboards & writing pads", hsn: "4820", unit: "pcs", material: "MDF clip pad", basePrice: 95, costPrice: 44, moq: 50, gstRate: 18, leadTimeDays: 6, status: "draft", description: "MDF writing pad with company branding." },
]

const productById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]))

function line(productId, quantity, discountPercent = 0) {
  const p = productById[productId]
  return { productId, description: p.name, hsn: p.hsn, quantity, rate: p.basePrice, discountPercent, gstRate: p.gstRate }
}

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
  // ---- categories & products ----
  await repo.bulkCreate("categories", CATEGORIES.map((c) => ({ ...c, description: "" })))
  await repo.bulkCreate("products", PRODUCTS.map((p) => ({ ...p })))
  await repo.bulkCreate("customers", Object.values(CUSTOMERS).map((c) => ({ ...c })))

  // ---- enquiries ----
  const enquiries = [
    { id: "enq_1", customer: CUSTOMERS.bright, source: "Website contact form", productInterest: "MDF products", message: "Need 500 custom MDF award trophies with laser engraving for our annual event.", status: "won", starred: true, owner: "Sales desk", notes: "Converted — repeat client.", createdAt: ago(96) },
    { id: "enq_2", customer: CUSTOMERS.technova, source: "Quote calculator", productInterest: "Lanyards & ID card accessories", message: "1000 sublimation lanyards in brand colours for a conference.", status: "won", starred: false, owner: "Sales desk", notes: "", createdAt: ago(70) },
    { id: "enq_3", customer: CUSTOMERS.edulearn, source: "Referral", productInterest: "Examination boards", message: "200 exam clipboards for our centres.", status: "quoted", starred: false, owner: "Sales desk", notes: "Awaiting PO.", createdAt: ago(20) },
    { id: "enq_4", customer: CUSTOMERS.gifthub, source: "WhatsApp", productInterest: "Corporate gifting & merchandise", message: "Diwali gifting — bottles + diaries, ~300 sets.", status: "won", starred: true, owner: "Sales desk", notes: "", createdAt: ago(55) },
    { id: "enq_5", customer: CUSTOMERS.acme, source: "Trade show", productInterest: "Badge manufacturing", message: "Metal badges with magnet backing, ~150 pcs.", status: "lost", starred: false, owner: "Sales desk", notes: "Went with local vendor on price.", createdAt: ago(40) },
    { id: "enq_6", customer: CUSTOMERS.startupx, source: "Website contact form", productInterest: "Acrylic products", message: "Acrylic desk standees for new office, custom shapes.", status: "quoted", starred: false, owner: "Sales desk", notes: "", createdAt: ago(12) },
    { id: "enq_7", customer: cust("Sunita Rao", "Horizon Events", "sunita@horizonevents.in", "+91-9432101234", "07"), source: "Phone", productInterest: "Corporate gifting & merchandise", message: "Enquiry for event welcome kits.", status: "new", starred: false, owner: "", notes: "", createdAt: ago(3) },
    { id: "enq_8", customer: cust("Amit Patel", "NextGen Pharma", "amit@nextgenpharma.com", "+91-9321012345", "24"), source: "Email", productInterest: "Lanyards & ID card accessories", message: "Need ID card lanyards for 400 staff.", status: "contacted", starred: false, owner: "Sales desk", notes: "Follow up Monday.", createdAt: ago(6) },
  ]
  await repo.bulkCreate("enquiries", enquiries)

  // ---- leads (pipeline, converted from enquiries) ----
  const today = new Date().toISOString()
  const horizon = cust("Sunita Rao", "Horizon Events", "sunita@horizonevents.in", "+91-9432101234", "07")
  const nextgen = cust("Amit Patel", "NextGen Pharma", "amit@nextgenpharma.com", "+91-9321012345", "24")
  const leads = [
    { id: "lead_1", enquiryId: "enq_3", customer: CUSTOMERS.edulearn, source: "Referral", productInterest: "Examination boards", quantityEstimate: "200 pcs", estimatedValue: 18400, stage: "quoted", owner: "Sales desk", nextFollowUp: today, lastActivityAt: ago(2), lostReason: "", linkedQuotationId: "qtn_3", activities: [{ id: "act_s1", type: "Quote sent", direction: "outbound", summary: "Sent quotation QTN-2526-0003 for 200 exam clipboards. Awaiting PO.", at: ago(2), owner: "Sales desk" }], notes: "Price-sensitive; competing with local vendor.", createdAt: ago(20) },
    { id: "lead_2", enquiryId: "enq_6", customer: CUSTOMERS.startupx, source: "Website contact form", productInterest: "Acrylic products", quantityEstimate: "120 pcs", estimatedValue: 60000, stage: "negotiation", owner: "Sales desk", nextFollowUp: ago(1), lastActivityAt: ago(3), lostReason: "", linkedQuotationId: null, activities: [{ id: "act_s2", type: "Call", direction: "outbound", summary: "Discussed custom shape cutting; sending revised rate.", at: ago(3), owner: "Sales desk" }], notes: "Wants custom shapes — negotiating cutting cost.", createdAt: ago(10) },
    { id: "lead_3", enquiryId: "enq_5", customer: CUSTOMERS.acme, source: "Trade show", productInterest: "Badge manufacturing", quantityEstimate: "150 pcs", estimatedValue: 20000, stage: "lost", owner: "Sales desk", nextFollowUp: null, lastActivityAt: ago(30), lostReason: "Price too high", linkedQuotationId: null, activities: [{ id: "act_s3", type: "Note", direction: "outbound", summary: "Lost to a local vendor on price.", at: ago(30), owner: "Sales desk" }], notes: "", createdAt: ago(38) },
    { id: "lead_4", enquiryId: "enq_7", customer: horizon, source: "Phone", productInterest: "Corporate gifting & merchandise", quantityEstimate: "250 kits", estimatedValue: 112000, stage: "contacted", owner: "Sales desk", nextFollowUp: today, lastActivityAt: ago(1), lostReason: "", linkedQuotationId: null, activities: [{ id: "act_s4", type: "WhatsApp", direction: "outbound", summary: "Shared gifting catalogue; they will confirm kit contents.", at: ago(1), owner: "Sales desk" }], notes: "Event welcome kits for a Sept conference.", createdAt: ago(3) },
    { id: "lead_5", enquiryId: "enq_8", customer: nextgen, source: "Email", productInterest: "Lanyards & ID card accessories", quantityEstimate: "400 pcs", estimatedValue: 9000, stage: "qualified", owner: "Sales desk", nextFollowUp: ago(2), lastActivityAt: ago(4), lostReason: "", linkedQuotationId: null, activities: [{ id: "act_s5", type: "Call", direction: "inbound", summary: "Confirmed 400 staff lanyards, ID card holders needed.", at: ago(4), owner: "Sales desk" }], notes: "Follow up with a sample.", createdAt: ago(6) },
  ]
  await repo.bulkCreate("leads", leads)
  // Link the originating enquiries to their leads.
  for (const l of leads) {
    if (l.enquiryId) await repo.update("enquiries", l.enquiryId, { leadId: l.id })
  }

  // ---- quotations ----
  const q1Lines = [line("prod_mdf01", 500, 10)]
  const q2Lines = [line("prod_lan01", 1000, 15)]
  const q3Lines = [line("prod_brd01", 200, 5)]
  const q4Lines = [line("prod_gft01", 300, 10), line("prod_gft02", 300, 10)]
  const q5Lines = [line("prod_bad01", 150, 0)]
  const q6Lines = [line("prod_acr01", 120, 0)]
  const q7Lines = [line("prod_gft01", 80, 0)]

  const quotations = [
    { id: "qtn_1", number: documentNumber("QTN", 1), status: "invoiced", customer: CUSTOMERS.bright, lines: q1Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.bright, q1Lines), issueDate: ago(94), validUntil: ago(79), validityDays: 15, notes: "", terms: "", enquiryId: "enq_1", invoiceId: "inv_1", lostReason: "", createdAt: ago(94) },
    { id: "qtn_2", number: documentNumber("QTN", 2), status: "invoiced", customer: CUSTOMERS.technova, lines: q2Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.technova, q2Lines), issueDate: ago(68), validUntil: ago(53), validityDays: 15, notes: "", terms: "", enquiryId: "enq_2", invoiceId: "inv_2", lostReason: "", createdAt: ago(68) },
    { id: "qtn_3", number: documentNumber("QTN", 3), status: "sent", customer: CUSTOMERS.edulearn, lines: q3Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.edulearn, q3Lines), issueDate: ago(18), validUntil: inFuture(-3), validityDays: 15, notes: "Awaiting PO confirmation.", terms: "", enquiryId: "enq_3", lostReason: "", createdAt: ago(18) },
    { id: "qtn_4", number: documentNumber("QTN", 4), status: "invoiced", customer: CUSTOMERS.gifthub, lines: q4Lines, extraDiscountPercent: 5, totals: makeDoc(CUSTOMERS.gifthub, q4Lines, 5), issueDate: ago(52), validUntil: ago(37), validityDays: 15, notes: "", terms: "", enquiryId: "enq_4", invoiceId: "inv_3", lostReason: "", createdAt: ago(52) },
    { id: "qtn_5", number: documentNumber("QTN", 5), status: "rejected", customer: CUSTOMERS.acme, lines: q5Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.acme, q5Lines), issueDate: ago(38), validUntil: ago(23), validityDays: 15, notes: "", terms: "", enquiryId: "enq_5", lostReason: "Price too high", createdAt: ago(38) },
    { id: "qtn_6", number: documentNumber("QTN", 6), status: "sent", customer: CUSTOMERS.startupx, lines: q6Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.startupx, q6Lines), issueDate: ago(10), validUntil: inFuture(5), validityDays: 15, notes: "", terms: "", enquiryId: "enq_6", lostReason: "", createdAt: ago(10) },
    { id: "qtn_7", number: documentNumber("QTN", 7), status: "draft", customer: CUSTOMERS.gifthub, lines: q7Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.gifthub, q7Lines), issueDate: ago(2), validUntil: inFuture(13), validityDays: 15, notes: "Repeat customer top-up order.", terms: "", enquiryId: null, lostReason: "", createdAt: ago(2) },
  ]
  await repo.bulkCreate("quotations", quotations)

  // ---- invoices (converted from accepted quotes) ----
  const invoices = [
    { id: "inv_1", number: documentNumber("INV", 1), status: "paid", customer: CUSTOMERS.bright, lines: q1Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.bright, q1Lines), issueDate: ago(90), dueDate: ago(75), notes: "", terms: "", quotationId: "qtn_1", quotationNumber: documentNumber("QTN", 1), amountPaid: 0, createdAt: ago(90) },
    { id: "inv_2", number: documentNumber("INV", 2), status: "paid", customer: CUSTOMERS.technova, lines: q2Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.technova, q2Lines), issueDate: ago(64), dueDate: ago(49), notes: "", terms: "", quotationId: "qtn_2", quotationNumber: documentNumber("QTN", 2), amountPaid: 0, createdAt: ago(64) },
    { id: "inv_3", number: documentNumber("INV", 3), status: "partial", customer: CUSTOMERS.gifthub, lines: q4Lines, extraDiscountPercent: 5, totals: makeDoc(CUSTOMERS.gifthub, q4Lines, 5), issueDate: ago(48), dueDate: ago(33), notes: "50% advance received.", terms: "", quotationId: "qtn_4", quotationNumber: documentNumber("QTN", 4), amountPaid: 0, createdAt: ago(48) },
    { id: "inv_4", number: documentNumber("INV", 4), status: "overdue", customer: CUSTOMERS.edulearn, lines: q3Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.edulearn, q3Lines), issueDate: ago(50), dueDate: ago(20), notes: "Payment reminder sent twice.", terms: "", quotationId: null, quotationNumber: "", amountPaid: 0, createdAt: ago(50) },
    { id: "inv_5", number: documentNumber("INV", 5), status: "sent", customer: CUSTOMERS.startupx, lines: q6Lines, extraDiscountPercent: 0, totals: makeDoc(CUSTOMERS.startupx, q6Lines), issueDate: ago(5), dueDate: inFuture(10), notes: "", terms: "", quotationId: null, quotationNumber: "", amountPaid: 0, createdAt: ago(5) },
  ]
  await repo.bulkCreate("invoices", invoices)

  // ---- payments ----
  const total = (id) => invoices.find((i) => i.id === id).totals.grandTotal
  const half = (id) => Math.round(total(id) / 2)

  const payments = [
    { id: "pay_1", number: documentNumber("PAY", 1), type: "inflow", amount: total("inv_1"), method: "Bank transfer / NEFT", date: ago(74), reference: "NEFT-8891", note: "Full payment", invoiceId: "inv_1", invoiceNumber: invoices[0].number, party: CUSTOMERS.bright.name, customer: CUSTOMERS.bright, createdAt: ago(74) },
    { id: "pay_2", number: documentNumber("PAY", 2), type: "inflow", amount: total("inv_2"), method: "UPI", date: ago(50), reference: "UPI-4471", note: "Full payment", invoiceId: "inv_2", invoiceNumber: invoices[1].number, party: CUSTOMERS.technova.name, customer: CUSTOMERS.technova, createdAt: ago(50) },
    { id: "pay_3", number: documentNumber("PAY", 3), type: "inflow", amount: half("inv_3"), method: "UPI", date: ago(47), reference: "UPI-5522", note: "50% advance", invoiceId: "inv_3", invoiceNumber: invoices[2].number, party: CUSTOMERS.gifthub.name, customer: CUSTOMERS.gifthub, createdAt: ago(47) },
    { id: "pay_4", number: documentNumber("PAY", 4), type: "payout", amount: 42000, method: "RTGS", date: ago(60), reference: "PO-MAT-221", note: "Raw material — acrylic sheets", invoiceId: null, invoiceNumber: "", party: "Sheela Acrylics Pvt Ltd", customer: null, createdAt: ago(60) },
    { id: "pay_5", number: documentNumber("PAY", 5), type: "payout", amount: 18500, method: "Bank transfer / NEFT", date: ago(30), reference: "PO-JOB-118", note: "Job-work — laser engraving", invoiceId: null, invoiceNumber: "", party: "Precision Laserworks", customer: null, createdAt: ago(30) },
  ]
  await repo.bulkCreate("payments", payments)

  // Sync cached amountPaid on partially/fully paid invoices.
  await repo.update("invoices", "inv_1", { amountPaid: total("inv_1") })
  await repo.update("invoices", "inv_2", { amountPaid: total("inv_2") })
  await repo.update("invoices", "inv_3", { amountPaid: half("inv_3") })

  // ---- Message Templates ----
  const TEMPLATES = [
    { id: "template_quote_request", name: "template_quote_request", category: "Quote Request", body: "Hi {name}, we received your quote request for {product_name}. Our team is working on your pricing. - Ortex Sales Desk", placeholders: ["name", "product_name"] },
    { id: "template_contact_form", name: "template_contact_form", category: "Contact Form", body: "Hi {name}, thanks for contacting us! We received your message: \"{message_snippet}\". A representative will contact you soon. - Ortex Industries", placeholders: ["name", "message_snippet"] },
    { id: "template_cart_abandonment", name: "template_cart_abandonment", category: "Cart Abandonment", body: "Hi {name}, we noticed you left some items in your quote cart, including {product_name}. Can we help you finalize your quote? - Ortex Sales", placeholders: ["name", "product_name"] },
    { id: "template_order_confirm", name: "template_order_confirm", category: "Order Confirmation", body: "Hi {name}, your order for {product_name} ({quantity} {unit}) is confirmed! Invoice {invoice_number} has been generated. - Ortex Industries", placeholders: ["name", "product_name", "quantity", "unit", "invoice_number"] },
    { id: "template_payment_confirm", name: "template_payment_confirm", category: "Payment Confirmation", body: "Hi {name}, we received your payment of ₹{amount} for Invoice {invoice_number}. Thank you! - Ortex Accounts", placeholders: ["name", "amount", "invoice_number"] },
  ]
  await repo.bulkCreate("message_templates", TEMPLATES)

  // ---- Automation Rules ----
  const RULES = [
    { id: "rule_quote", name: "Quote Request Follow-up", triggerEvent: "quote_requested", actionType: "whatsapp", templateId: "template_quote_request", delayMinutes: 0, active: true, description: "Send WhatsApp immediately after quote calculator submission." },
    { id: "rule_contact", name: "Contact Form Auto-reply", triggerEvent: "contact_form_submitted", actionType: "whatsapp", templateId: "template_contact_form", delayMinutes: 0, active: true, description: "Send welcome reply after contact form submission." },
    { id: "rule_cart", name: "Cart Abandonment Reminder", triggerEvent: "cart_abandoned", actionType: "whatsapp", templateId: "template_cart_abandonment", delayMinutes: 30, active: true, description: "Send reminder 30 minutes after quote cart is inactive." },
    { id: "rule_order", name: "Order Confirmation Notification", triggerEvent: "order_confirmed", actionType: "whatsapp", templateId: "template_order_confirm", delayMinutes: 0, active: true, description: "Send confirmation message when invoice is generated." },
    { id: "rule_payment", name: "Payment Receipt Confirmation", triggerEvent: "payment_received", actionType: "whatsapp", templateId: "template_payment_confirm", delayMinutes: 0, active: true, description: "Send payment confirmation upon receiving payment inflow." },
  ]
  await repo.bulkCreate("automation_rules", RULES)

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
    { id: "act_1", userId: "usr_priya", sessionId: "sess_p1", activityType: "Home page visit", pageUrl: "/", referrer: "Google Search", timestamp: ago(4), device: "Mobile", browser: "Chrome", operatingSystem: "Android", ipAddress: "103.88.22.41", metadata: {} },
    { id: "act_2", userId: "usr_priya", sessionId: "sess_p1", activityType: "Product page visit", productId: "prod_mdf01", pageUrl: "/products?product=Custom%20MDF%20Award%20Trophy", referrer: "Home page link", timestamp: ago(4), device: "Mobile", browser: "Chrome", operatingSystem: "Android", ipAddress: "103.88.22.41", metadata: { productName: "Custom MDF Award Trophy" } },
    { id: "act_3", userId: "usr_priya", sessionId: "sess_p1", activityType: "Quote request", pageUrl: "/quote", referrer: "Products page link", timestamp: ago(4), device: "Mobile", browser: "Chrome", operatingSystem: "Android", ipAddress: "103.88.22.41", metadata: { customer: CUSTOMERS.bright, productName: "Custom MDF Award Trophy", quantity: 500 } },
    { id: "act_4", userId: "usr_rahul", sessionId: "sess_r1", activityType: "Product search", pageUrl: "/products?search=lanyards", referrer: "Direct", timestamp: ago(3), device: "Desktop", browser: "Chrome", operatingSystem: "Windows", ipAddress: "122.161.4.19", metadata: { searchQuery: "lanyards" } },
    { id: "act_5", userId: "usr_rahul", sessionId: "sess_r1", activityType: "Product page visit", productId: "prod_lan01", pageUrl: "/products?product=Sublimation%20Lanyard%2016mm", referrer: "Search results", timestamp: ago(3), device: "Desktop", browser: "Chrome", operatingSystem: "Windows", ipAddress: "122.161.4.19", metadata: { productName: "Sublimation Lanyard 16mm" } },
    { id: "act_6", userId: "usr_rahul", sessionId: "sess_r1", activityType: "Contact form submission", pageUrl: "/contact", referrer: "Products page link", timestamp: ago(3), device: "Desktop", browser: "Chrome", operatingSystem: "Windows", ipAddress: "122.161.4.19", metadata: { customer: CUSTOMERS.technova, productName: "Sublimation Lanyard 16mm", message: "1000 sublimation lanyards in brand colours for a conference." } },
    { id: "act_7", userId: "usr_anon1", sessionId: "sess_a1", activityType: "Home page visit", pageUrl: "/", referrer: "LinkedIn Ads", timestamp: ago(2), device: "Mobile", browser: "Safari", operatingSystem: "iOS", ipAddress: "223.189.14.77", metadata: {} },
    { id: "act_8", userId: "usr_anon1", sessionId: "sess_a1", activityType: "Product page visit", productId: "prod_acr01", pageUrl: "/products?product=Acrylic%20Desk%20Standee", referrer: "Home page", timestamp: ago(2), device: "Mobile", browser: "Safari", operatingSystem: "iOS", ipAddress: "223.189.14.77", metadata: { productName: "Acrylic Desk Standee" } },
    { id: "act_9", userId: "usr_anon1", sessionId: "sess_a1", activityType: "Cart actions", pageUrl: "/quote", referrer: "Products", timestamp: ago(2), device: "Mobile", browser: "Safari", operatingSystem: "iOS", ipAddress: "223.189.14.77", metadata: { action: "add", productName: "Acrylic Desk Standee", quantity: 50 } },
    { id: "act_10", userId: "usr_anita", sessionId: "sess_an1", activityType: "PDF download", pageUrl: "/products", referrer: "Direct", timestamp: ago(1), device: "Desktop", browser: "Firefox", operatingSystem: "Linux", ipAddress: "115.241.89.5", metadata: { fileName: "Ortex_Product_Catalogue_2026.pdf" } },
  ].map((a) => ({ ...a, ...GEO[a.ipAddress] }))
  await repo.bulkCreate("user_activities", ACTIVITIES)

  // ---- Event Logs ----
  const EVENTS = [
    { id: "evt_1", activityId: "act_1", eventType: "home_visited", userId: "usr_priya", description: "User visited the home page.", timestamp: ago(4), status: "processed" },
    { id: "evt_2", activityId: "act_2", eventType: "product_visited", userId: "usr_priya", description: "User viewed product: Custom MDF Award Trophy.", timestamp: ago(4), status: "processed" },
    { id: "evt_3", activityId: "act_3", eventType: "quote_requested", userId: "usr_priya", description: "User requested a quote for Custom MDF Award Trophy (500 pcs).", timestamp: ago(4), status: "processed" },
    { id: "evt_4", activityId: "act_4", eventType: "search_performed", userId: "usr_rahul", description: "User searched for: \"lanyards\".", timestamp: ago(3), status: "processed" },
    { id: "evt_5", activityId: "act_5", eventType: "product_visited", userId: "usr_rahul", description: "User viewed product: Sublimation Lanyard 16mm.", timestamp: ago(3), status: "processed" },
    { id: "evt_6", activityId: "act_6", eventType: "contact_form_submitted", userId: "usr_rahul", description: "User submitted contact form for Sublimation Lanyard 16mm.", timestamp: ago(3), status: "processed" },
    { id: "evt_7", activityId: "act_7", eventType: "home_visited", userId: "usr_anon1", description: "User visited the home page.", timestamp: ago(2), status: "processed" },
    { id: "evt_8", activityId: "act_8", eventType: "product_visited", userId: "usr_anon1", description: "User viewed product: Acrylic Desk Standee.", timestamp: ago(2), status: "processed" },
    { id: "evt_9", activityId: "act_9", eventType: "cart_abandoned", userId: "usr_anon1", description: "User abandoned cart with Acrylic Desk Standee (50 pcs).", timestamp: ago(2), status: "processed" },
    { id: "evt_10", activityId: "act_10", eventType: "pdf_downloaded", userId: "usr_anita", description: "User downloaded PDF: Ortex_Product_Catalogue_2026.pdf.", timestamp: ago(1), status: "processed" },
  ]
  await repo.bulkCreate("event_logs", EVENTS)

  // ---- AI Messages ----
  const AI_MESSAGES = [
    { id: "aim_1", eventId: "evt_3", userId: "usr_priya", customerName: "Priya Sharma", triggerType: "Quote Request Follow-up", context: "Trigger: Quote Request Follow-up. User activity: User requested a quote for Custom MDF Award Trophy (500 pcs). Customer details: Priya Sharma (+91-9876543210).", generatedMessage: "Hi Priya Sharma, we received your quote request for Custom MDF Award Trophy. Our team is working on your pricing. - Ortex Sales Desk", createdAt: ago(4) },
    { id: "aim_2", eventId: "evt_6", userId: "usr_rahul", customerName: "Rahul Verma", triggerType: "Contact Form Auto-reply", context: "Trigger: Contact Form Auto-reply. User activity: User submitted contact form for Sublimation Lanyard 16mm. Customer details: Rahul Verma (+91-9811122233).", generatedMessage: "Hi Rahul Verma, thanks for contacting us! We received your message: \"1000 sublimation lanyards in brand colours for a conference.\". A representative will contact you soon. - Ortex Industries", createdAt: ago(3) },
    { id: "aim_3", eventId: "evt_9", userId: "usr_anon1", customerName: "Anonymous Buyer", triggerType: "Cart Abandonment Reminder", context: "Trigger: Cart Abandonment Reminder. User activity: User abandoned cart with Acrylic Desk Standee (50 pcs).", generatedMessage: "Hi Customer, we noticed you left some items in your quote cart, including Acrylic Desk Standee. Can we help you finalize your quote? - Ortex Sales", createdAt: ago(2) }
  ]
  await repo.bulkCreate("ai_messages", AI_MESSAGES)

  // ---- WhatsApp Logs ----
  const WA_LOGS = [
    { id: "wal_1", userId: "usr_priya", customerName: "Priya Sharma", phone: "+91-9876543210", templateName: "template_quote_request", messageText: "Hi Priya Sharma, we received your quote request for Custom MDF Award Trophy. Our team is working on your pricing. - Ortex Sales Desk", status: "delivered", retryCount: 0, maxRetries: 3, errorMessage: "", responsePayload: { success: true }, createdAt: ago(4), sentAt: ago(4) },
    { id: "wal_2", userId: "usr_rahul", customerName: "Rahul Verma", phone: "+91-9811122233", templateName: "template_contact_form", messageText: "Hi Rahul Verma, thanks for contacting us! We received your message: \"1000 sublimation lanyards in brand colours for a conference.\". A representative will contact you soon. - Ortex Industries", status: "delivered", retryCount: 0, maxRetries: 3, errorMessage: "", responsePayload: { success: true }, createdAt: ago(3), sentAt: ago(3) },
    { id: "wal_3", userId: "usr_anon1", customerName: "Anonymous Buyer", phone: "+91-9999999999", templateName: "template_cart_abandonment", messageText: "Hi Customer, we noticed you left some items in your quote cart, including Acrylic Desk Standee. Can we help you finalize your quote? - Ortex Sales", status: "failed", retryCount: 3, maxRetries: 3, errorMessage: "API Error: Invalid recipient phone number format.", responsePayload: null, createdAt: ago(2), sentAt: ago(2) }
  ]
  await repo.bulkCreate("whatsapp_logs", WA_LOGS)

  // Advance numbering counters past the seeded documents.
  const settings = await repo.getSettings()
  await repo.saveSettings({
    ...settings,
    numbering: { ...settings.numbering, quotationSeq: 8, invoiceSeq: 6, paymentSeq: 6 },
  })
}
