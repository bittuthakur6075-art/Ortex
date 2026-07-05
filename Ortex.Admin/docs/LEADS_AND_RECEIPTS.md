# Leads & Receipts — Reference & Design Guide for Ortex Industries

*Two operational upgrades for the Ortex admin console: (A) compliant payment receipts under Indian GST, and (B) a B2B lead-management / CRM layer sitting in front of the existing Enquiries → Quotations → Invoices → Payments flow. India-context throughout. Not legal/tax advice — confirm specifics with your CA.*

---

## PART A — Payment Receipts (India)

Ortex takes **50% advances** and issues **GST invoices**. That means three distinct documents can flow out of a single order, and they are *not* interchangeable:

| Document | When issued | Legal basis | GST shown? |
|---|---|---|---|
| **Receipt Voucher** | On receiving an **advance**, *before* supply | Sec 31(3)(d), Rule 50 | Yes (on services; usually not on goods — see below) |
| **Tax Invoice** | On/around actual supply of goods/services | Sec 31, Rule 46 | Yes |
| **Money / Payment Receipt** | Acknowledging a payment *against an issued invoice* | Business practice (not a GST doc) | Optional (already in the invoice) |
| **Refund Voucher** | When an advance is refunded and no supply happens | Sec 31(3)(e), Rule 51 | Reverses the tax charged on the receipt voucher |

### 1. Money receipt / payment acknowledgement (the plain receipt)

A "money receipt" is a **non-statutory acknowledgement** that a payment was received against an already-issued invoice. It builds trust, closes the paper trail, and is what most customers expect after paying a balance. A professional one contains ([Bajaj Finserv](https://www.bajajfinserv.in/receipt-format), [SleekBill](https://sleekbill.in/payment-receipt/), [Vyapar](https://vyaparapp.in/receipt-format/z/money)):

- **Business header** — Ortex name, address, contact, **GSTIN**, logo.
- **Receipt number** — unique, sequential (see §3).
- **Date** of receipt.
- **Received from** — customer name (and firm).
- **Amount in figures AND in words** — e.g. `₹59,000 (Rupees Fifty-Nine Thousand only)`. Words prevent tampering and are standard Indian practice.
- **Against which invoice / order** — invoice no. and date the payment settles (or "advance against Order #…").
- **Payment mode & reference** — Cash / Cheque No. / UPI txn ID / NEFT-RTGS UTR / card.
- **Amount allocation** — this payment vs. **balance remaining** on the invoice/order.
- **"Received with thanks"** courtesy line.
- **Received by / authorised signatory** — signature or business stamp.

One-line body: *"RECEIVED with thanks from **[customer]** a sum of **₹[figures] (Rupees [words] only)** vide **[mode/ref]** being **[full / part] payment** against **Invoice #[no] dated [date]**. Balance outstanding: **₹[amount]**."*

### 2. GST Receipt Voucher — the one Ortex actually needs for advances

Under **Section 31(3)(d) of the CGST Act**, a registered person who **receives an advance before supply MUST issue a receipt voucher** for that advance ([CBIC Sec 31](https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/acts/2017_CGST_act/active/chapter7/section31_v1.00.html), [Taxwink](https://www.taxwink.com/blog/receipt-voucher-gst)) — mandatory **even if the advance and the supply happen in the same month**.

**Mandatory fields — Rule 50, CGST Rules** ([GSTZen Rule 50](https://gstzen.in/a/receipt-voucher-cgst-rule-50.html), [CompaniesInn](https://www.companiesinn.com/articles/receipt-vouchers-gst-compliance)):

1. Name, address & **GSTIN of the supplier** (Ortex).
2. **Consecutive serial number** ≤ 16 characters, unique per financial year.
3. **Date** of issue.
4. Name, address & **GSTIN/UIN of the recipient**, if registered.
5. **Description** of goods or services.
6. **Amount of advance** received.
7. **Rate of tax** (CGST, SGST, IGST, cess).
8. **Amount of tax charged** on the advance.
9. **Place of supply** (with State + code) for inter-State supply.
10. Whether tax is payable on **reverse charge**.
11. **Signature / digital signature** of supplier.

Safety-valves when unknown at advance time: if **tax rate isn't determinable**, charge **18%**; if **nature of supply isn't determinable**, treat as **inter-State** ([Taxwink](https://www.taxwink.com/blog/receipt-voucher-gst)).

**Advance-payment GST — goods vs services (the crucial carve-out):**

- **Goods:** Vide **Notification 66/2017 – Central Tax (15 Nov 2017)**, suppliers of goods (except composition) are **exempt from GST on advances**; time of supply = date of invoice ([IndiaFilings](https://www.indiafilings.com/learn/advance-received-under-gst), [ClearTax](https://cleartax.in/s/advance-received-under-gst)). **Ortex, supplying goods, does NOT pay GST on the 50% advance** — full GST is charged on the tax invoice.
- **Services:** No exemption — **GST IS payable on receipt of advance** for services ([GST Doctor](https://gstdoctor.com/articles/gst-on-advances-received-for-services-l1m8mess)). Any service component (design/tooling/installation billed as a service) can attract GST on the advance.
- **Practical rule:** issue a **receipt voucher for every advance**; compute/pay GST only on the service-classified portion. Goods advances carry the voucher but tax crystallises at invoice.

**Refund Voucher (Sec 31(3)(e), Rule 51):** if the advance is returned and **no invoice was issued**, issue a refund voucher citing the **original receipt voucher no. & date** and reversing any tax paid. If an invoice was already issued, use a **credit note** instead.

### 3. Receipt numbering & best practices

- **Sequential & unique per financial year** (Apr–Mar), ≤16 chars. Distinct prefixed series so types never collide: `RV/25-26/0001` (receipt voucher), `RF/25-26/0001` (refund), `PR/25-26/0001` (money receipt); reset on **1 April**.
- **No gaps, no back-dating** — auto-increment; never hand-edit.
- **Link every receipt to its parent** — receipt → invoice/order; refund → original receipt voucher.
- **Partial vs full** — multiple receipts per invoice; store *amount received*, *cumulative*, *balance*. Mark invoice **Paid** only when cumulative = total, else **Partially Paid**.
- **Advance vs balance** — the 50% advance → **receipt voucher**; the post-invoice balance → **money receipt** allocated to the invoice.

---

## PART B — Lead Management / CRM for B2B (growth)

An **enquiry** is a raw inbound signal; a **lead/opportunity** is an enquiry a human has qualified and is actively working toward an order. B2B teams separate the two to prioritise effort ([MarketingProfs](https://www.marketingprofs.com/articles/2024/51066/b2b-sales-pipeline-guide-lead-management)). For made-to-order manufacturing, the working/chasing/forecasting layer between enquiry and quotation is where most revenue is won or lost.

### 1. Lifecycle & stages
**New → Contacted → Qualified → Quoted → Negotiation → Won / Lost**, with a **mandatory lost-reason** on Lost (price, lead time, MOQ, no budget, went silent, competitor).

### 2. Lead scoring (fit + engagement, 0–100)
Grade **fit** (order value/quantity vs MOQ, source quality, repeat customer) and score **engagement** (responsiveness, recency, buying signals — sample/quote requested, deadline shared) ([Instantly.ai](https://instantly.ai/blog/how-crm-scores-b2b-leads/), [ZoomInfo](https://pipeline.zoominfo.com/marketing/lead-scoring)). Add **score decay** so silent leads cool off; a practical **hot threshold ≈ 60+**. Keep it a transparent weighted sum.

### 3. Follow-up cadence & SLA (where deals are lost)
Speed to first response is the highest-leverage lever — responding within **5 minutes** ≈ **100× more likely to connect** ([Chili Piper](https://www.chilipiper.com/article/speed-to-lead-statistics)). Most deals die from **no follow-up**: ~48% of reps never follow up once ([Cirrus Insight](https://www.cirrusinsight.com/blog/sales-follow-up-statistics)). Optimal cadence ≈ **6–8 multi-channel touches over 14–21 days**.

| Touch | Timing | Channel | Purpose |
|---|---|---|---|
| First response | ≤ 1 hour | Call / WhatsApp | Acknowledge, capture requirement |
| 2 | 24h | WhatsApp + email | Send quote / sample options |
| 3 | Day 3 | Call | Specs, objections |
| 4 | Day 7 | WhatsApp | Nudge + value |
| 5 | Day 14 | Call/email | Revised offer / MOQ flexibility |
| 6 | Day 21 | WhatsApp | Final check → else mark Lost |

Operationalise with a **`nextFollowUp` date** on every open lead, an **overdue/aging** flag, and a daily **"follow-ups due / overdue"** worklist. A lead with no scheduled next action is a process bug.

### 4. Weighted pipeline value & forecasting
**Weighted pipeline = Σ (estimated value × stage win-probability)** ([Forecastio](https://forecastio.ai/blog/weighted-pipeline)). Example probabilities:

| Stage | Win probability |
|---|---|
| New | 5% |
| Contacted | 15% |
| Qualified | 30% |
| Quoted | 50% |
| Negotiation | 75% |
| Won | 100% |
| Lost | 0% |

A ₹4,00,000 lead at Quoted (50%) contributes ₹2,00,000; a ₹1,00,000 lead at Negotiation (75%) contributes ₹75,000 → weighted ₹2,75,000 vs raw ₹5,00,000.

### 5. Activity logging
A chronological timeline per lead: **type** (call/WhatsApp/email/meeting/sample-sent/quote-sent/note), **direction**, **timestamp + owner**, **outcome/summary**, attachments; auto-set the next follow-up from the agreed next step ([Highspot](https://www.highspot.com/blog/lead-management/)).

### 6. Metrics
Lead velocity, conversion by stage, first-response time (% within SLA), follow-ups due/overdue, weighted pipeline value, win rate & average deal size, source ROI, lost-reason distribution.

### 7. Lead record — field spec
`enquiryId, customer{...}, source, productInterest, quantityEstimate, estimatedValue, stage, winProbability (auto), score (0–100), owner, nextFollowUp, lastActivityAt, lostReason, linkedQuotationId, activities[], notes`.

**Dashboard widgets:** (1) Follow-ups due today / overdue; (2) Weighted pipeline value + by stage; (3) First-response / stage conversion funnel; (4) Lead velocity; (5) Source ROI; (6) Won → order → advance bridge to the receipt-voucher/invoicing flow.

---

*Sources linked inline. Verify GST specifics (especially goods-vs-services advance treatment) with a qualified CA before configuring the console.*
