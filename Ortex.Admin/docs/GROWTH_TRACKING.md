# Growth Tracking & Admin/ERP Metrics — Ortex Industries

**Purpose:** Define what an internal admin/ERP panel for Ortex Industries (B2B manufacturer of customized MDF/acrylic items, lanyards, ID-card accessories, badges, examination boards, corporate gifts, and OEM/white-label production) should **track, measure, and act on to drive business growth**. This is a reference spec for the quote-to-cash lifecycle: **Enquiry → Quotation → Acceptance/Order → GST Invoice → Payment (and Payout)**.

Scope note: Ortex's public site is a client-side React SPA with no backend (leads persist to `localStorage`). This document distinguishes what a **client-side admin can compute today** from what needs a **backend/integration** later.

---

## 1. North-Star & Funnel Metrics (Quote-to-Cash)

The business is fundamentally a **quote-to-cash funnel**. Every lead flows through five stages, and each stage has a leak. Track the whole funnel, not just the ends.

```
ENQUIRY  →  QUOTATION  →  ACCEPTANCE/ORDER  →  INVOICE  →  PAYMENT
 (lead)     (RFQ sent)     (won deal)          (GST bill)  (cash in)
```

### North-Star metric

**Net Collected Revenue (paid, GST-exclusive)** over a period — i.e. money actually banked, not merely invoiced. For a no-credit-line SMB manufacturer, *cash collected* is the truest growth signal because it internalises win rate, order value, AND collection efficiency in one number.

Secondary north-star: **Gross Margin ₹** (collected revenue − direct material/production cost), because volume without margin is not growth for a customized-manufacturing shop where material and setup costs dominate.

### Stage-by-stage KPIs and formulas

| Stage | KPI | Formula | Why it matters |
|---|---|---|---|
| Enquiry | **Enquiry volume** | Count of new enquiries in period | Top-of-funnel demand; leading indicator of future revenue |
| Enquiry | **Qualified-enquiry rate** | Qualified enquiries ÷ total enquiries | Filters spam/tyre-kickers; measures lead quality |
| Enquiry→Quote | **Quotation rate** | Quotations sent ÷ enquiries received | How fast/often the team responds with a price |
| Quote | **Average quote value (AQV)** | Σ quote values ÷ number of quotes | Deal-size trend; input to revenue forecast |
| Quote→Order | **Quotation conversion / Win rate** | Quotations accepted ÷ quotations sent | The single biggest lever on revenue |
| Quote→Order | **Quote-to-order time (sales cycle)** | Avg(order date − enquiry date) | Speed = cash velocity; long cycles signal bottlenecks |
| Order | **Average Order Value (AOV)** | Total order value ÷ number of orders | Revenue-per-deal; drives CLV |
| Order→Invoice | **Order-to-invoice time** | Avg(invoice date − order date) | Delay here delays cash; invoice fast |
| Invoice | **Revenue (invoiced)** | Σ taxable value of invoices in period | Booked business |
| Invoice | **Gross margin %** | (Revenue − direct cost) ÷ Revenue × 100 | Profitability of the mix |
| Invoice→Payment | **Collection rate** | Amount collected ÷ amount invoiced | Working-capital health |
| Invoice→Payment | **DSO (Days Sales Outstanding)** | (Accounts receivable ÷ total credit sales) × days | How long cash is stuck; lower is better |
| Payment | **Outstanding receivables** | Σ (invoiced − paid) for open invoices | Cash locked in the market |
| Retention | **Repeat-customer rate** | Customers with ≥2 orders ÷ total customers | Cheapest growth; retention beats acquisition |
| Retention | **Customer Lifetime Value (CLV)** | AOV × purchase frequency × customer lifespan (yrs) | How much you can spend to acquire |

### Funnel conversion — the compounding leak

The overall enquiry-to-cash conversion is the **product** of every stage rate, so small leaks multiply. A manufacturer may get a healthy quote-request rate but convert only ~15% of quotes to orders, yielding an effective purchase-conversion well under 1% ([Zeliq — B2B conversion by industry](https://www.zeliq.com/blog/b2b-conversion-rates-by-industry)). Track each multiplier separately so you know *which* stage to fix.

**Benchmarks (directional targets, not gospel):**
- Average B2B win rate ≈ **21%** across all opportunities; larger/complex deals often **~15%** ([Salesmotion — Sales Win Rate Benchmarks 2026](https://salesmotion.io/blog/sales-win-rate-benchmarks-2026)).
- Manufacturing/industrial site conversion typically **2–3%**, with 3–5% a stretch goal ([Zeliq](https://www.zeliq.com/blog/b2b-conversion-rates-by-industry)).
- **Decide upfront whether "no-decision" quotes count** as losses — excluding them can inflate win rate by 10–15 points ([Salesmotion](https://salesmotion.io/blog/sales-win-rate-benchmarks-2026)). Ortex should count aged/dead quotes as losses for an honest number.

### CLV formulas (pick one, be consistent)

- **Simple:** `CLV = AOV × Purchase Frequency (orders/yr) × Customer Lifespan (yrs)`
- **Margin-aware:** `CLV = (AOV × Frequency × Lifespan × Gross-margin %) − (Acquisition + Retention Cost)`
- **B2B discounted (retention-based):** `CLV = Gross contribution × [ retention ÷ (1 + discount − retention) ]`

Sources: [HubSpot — how to calculate CLV](https://blog.hubspot.com/service/how-to-calculate-customer-lifetime-value), [Altitude Marketing — B2B CLV](https://altitudemarketing.com/blog/b2b-customer-lifetime-value/).

---

## 2. Sales & CRM Tracking

### Lead sources
Tag every enquiry with a **source** and compute conversion + revenue per source, so spend follows what wins: website form, quote calculator, WhatsApp, phone, referral, marketplace (IndiaMART/TradeIndia), exhibition, cold outreach, Google/paid. Metric: **conversion rate by source** and **revenue per source**.

### Pipeline stages
`New → Qualified → Quotation sent → Negotiation → Verbally won → Order confirmed → In production → Dispatched → Invoiced → Paid → Lost`. Track per stage: count, total ₹ value, average age in stage, stage-to-stage conversion.

### Sales-rep performance
Per rep: enquiries handled, quotes sent, **win rate**, average deal size, response time, revenue and margin closed, receivables outstanding. Weight by margin, not top-line.

### Follow-up cadence
Most B2B quotes die from **no follow-up**, not price. Track **first-response time**, **touches per quote**, **days since last contact**, and a follow-up SLA (24h → day 3 → 7 → 14) with overdue flags.

### Aging of open quotations
Bucket open quotes by age: **0–7 / 8–15 / 16–30 / 30+ days**. Quotes older than their validity window are effectively dead — auto-flag "chase or close." *(Implemented on the Ortex dashboard.)*

### Reasons-lost analysis
Capture a mandatory **loss reason** on every lost quote: price too high, competitor won, budget/postponed, MOQ too high, lead time too long, no response, spec mismatch, quality concern. If "price"/"MOQ" dominate → fix pricing/packaging; if "no response" → fix follow-up. *(Implemented.)*

---

## 3. Financial & Operations KPIs

| KPI | Formula / definition | Growth signal |
|---|---|---|
| **Revenue trend** | Invoiced revenue by month, YoY & MoM growth % | Momentum |
| **AOV trend** | Revenue ÷ orders, over time | Up-sell / mix improvement |
| **Product-category profitability** | Per category: revenue, direct cost, gross margin ₹ and % | Where to push vs. prune |
| **MOQ analysis** | Order quantities vs. defined MOQ per product | Selling below profitable volume? |
| **Discount leakage** | (standard − actual invoiced) ÷ standard revenue | Silent margin erosion |
| **Payment collection efficiency** | Collected ÷ invoiced in period | Working-capital health |
| **Overdue invoices / AR aging** | Unpaid buckets: current / 1–30 / 31–60 / 60+ | Bad-debt & cash-crunch warning |
| **DSO** | (AR ÷ credit sales) × days | Cash-conversion speed |
| **Cash flow (in vs out)** | Collections − (material + payouts + opex) | Solvency |
| **Advance / token collection rate** | Orders with advance ÷ total | For custom manufacturing, advances de-risk cash |
| **Repeat vs. new revenue split** | Returning-customer revenue ÷ total | Retention-led growth |

**Custom-manufacturing note:** every order is bespoke, so **margin must be computed per order from actual material cost** (fed via each product's `costPrice`), not a flat percentage.

---

## 4. India-Specific Invoicing & Payments

### 4.1 GST tax invoice — mandatory fields (Rule 46, CGST Rules)
Supplier name/address/**GSTIN**; **invoice number** (consecutive, unique per FY, ≤16 chars, only letters/digits/`-`/`/`); invoice date; recipient name/address/**GSTIN**; **HSN** per line; description; **quantity & unit**; **taxable value**; **GST rate & amount** split **CGST+SGST** *or* **IGST**; **total value**; **place of supply** + state code; reverse-charge flag if applicable; **signature**. ([Tally](https://tallysolutions.com/gst/gst-invoice-format-mandatory-fields-rules-and-examples-for-businesses/), [ClearTax](https://cleartax.in/s/gst-invoice))

### 4.2 GSTIN & HSN
**GSTIN** — 15-char state-wise PAN-based ID; capture the buyer's too (needed for their Input Tax Credit — a real B2B selling point). **HSN digits by turnover:** ≤ ₹5 cr → **4-digit**; > ₹5 cr → **6-digit** ([Tally](https://tallysolutions.com/gst/gst-invoice/)).

### 4.3 CGST/SGST vs IGST — intra- vs inter-state
**Place of Supply** (not shipping address) decides the split: intra-state → **CGST + SGST** (each half the rate); inter-state → **IGST** (full rate). Ortex compares buyer state code to its own registered state — a **pure client-side calculation**. *(Implemented in `lib/pricing.js` + `domain.isInterState`.)*

### 4.4 Typical GST rates & HSN for Ortex's categories
*Indicative — verify each SKU with a CA / the CBIC schedule.* Acrylic articles (HSN 3920/3926) **18%**; MDF/wooden boards (4410/4411) commonly **18%**; plastic boards/articles (3926) **18%**; lanyards (5806/6307/3926, composition-dependent) **12–18%**; ID/badge accessories (3926/8306) **18%**; printed gifts (4911/9608 etc.) **12–18%**; OEM job-work/printing service (9988/9989) **12–18%**. Sources: [Enterslice](https://enterslice.com/learning/hsn-code/search/acrylic/), [Vakilsearch](https://vakilsearch.com/hsn-code/search/corporate-gifting), [Dripcapital](https://www.dripcapital.com/hsn-code/search/lanyard), [Graphics Pulse](https://www.graphicspulse.in/gst-rates-for-printing/). **Store HSN + GST rate per product** so invoices auto-fill. *(Implemented.)*

### 4.5 Invoice numbering
Sequential, gap-free, unique **per FY (Apr–Mar)**, ≤16 chars. Scheme used here: `PREFIX-2526-0001`. Never reuse/skip numbers ([Kanakkupillai](https://www.kanakkupillai.com/learn/gst-invoice-format-rules-and-time-limits/)). *(Implemented in `lib/id.js`.)*

### 4.6 E-invoicing threshold (IRN)
Mandatory **e-invoicing (IRP/IRN + QR) at AATO > ₹5 crore**; once crossed it stays applicable permanently ([Tally](https://tallysolutions.com/gst/e-invoicing-limit-india/), [GimBooks](https://www.gimbooks.com/blog/e-invoice-applicability-limit-in-2025-latest-rules-threshold-who-must-comply/)). ≥ ₹10 cr must report to IRP within 30 days (from 1 Apr 2025). Below ₹5 cr, ordinary GST invoices suffice (client-side is fine). Above it, e-invoicing **needs backend integration** with the GST IRP via a GSP/ASP. *Design already reserves room for `irn`/`ackNo`/`qr` fields.*

### 4.7 Payments & payouts (India B2B)
**Payments** = collect from customers; **Payouts** = pay vendors/job-workers/refunds. Collect via **Razorpay/Cashfree/PayU** (cards, UPI, netbanking, NEFT/RTGS, payment links — ideal for advance/token collection). Vendor **payouts via RazorpayX** auto-pick IMPS/NEFT/RTGS/UPI ([RazorpayX](https://razorpay.com/x/), [productgrowth.in](https://productgrowth.in/tools/payments/razorpay-x/)). **Razorpay Route** splits an incoming payment across linked accounts (useful for OEM/reseller cuts) ([Route](https://razorpay.com/route/)). **All processing needs a backend** (keys never client-side) — the admin *records* payments/payouts manually and reconciles. *(Manual ledger implemented in the Payments module.)*

---

## 5. Recommended Tooling / Stack (phased)

| Need | Tools | Metrics | Client or backend? |
|---|---|---|---|
| Web/product analytics | **GA4**, **PostHog** | Traffic, form conversion, source attribution | Client script |
| CRM / pipeline | **Zoho CRM**, **HubSpot** | Leads, pipeline, rep perf, cadence, reasons-lost | SaaS backend |
| Accounting + GST/e-invoice | **Tally Prime**, **Zoho Books** | GST invoices, IRN, AR aging, DSO, P&L | Backend/desktop |
| Payments & payouts | **Razorpay / RazorpayX**, Cashfree, PayU | Collections, links, payouts, split | Backend + webhooks |
| Dashboards / BI | **Zoho Analytics**, **Looker Studio**, **Metabase** | Cross-source roll-ups | Backend for live |

**Computable client-side today** (this admin does it): enquiry volume, quote count, AQV, win rate, quote-to-order time, AOV, revenue, category mix + margin, discount %, reasons-lost, quote aging, AR aging, DSO, repeat rate, GST split, invoice numbering.

**Needs a backend/integration:** real payment collection & payouts (Razorpay/RazorpayX + webhooks); e-invoicing IRN/QR (> ₹5 cr); durable multi-user/cross-device data; attribution stitching across GA4/CRM/accounting.

**Migration note:** the data records (enquiry, quote, invoice, payment) are shaped to map cleanly onto Zoho Books / Tally objects, so the eventual backend cut-over is a data import, not a rebuild.

---

## 6. Prioritized "Growth Dashboard" Spec (first 8–12 widgets)

Ranked by impact-per-effort. Each: **why → formula → data source**. *(All 12 are implemented on the Ortex dashboard.)*

| # | Widget | Why | Formula | Source |
|---|---|---|---|---|
| **1** | **Cash collected (period)** | North-star; real money banked | Σ inflow payments in period | payments |
| **2** | **Quotation win rate** | Biggest lever on revenue | accepted ÷ decided × 100 | quotations |
| **3** | **Open quotes by aging** | Aged quotes = lost cash; daily action | bucket open quotes by age | quotations |
| **4** | **Sales funnel** | Shows *where* the leak is | stage counts + conversion % | all |
| **5** | **Receivables + AR aging** | Cash locked; bad-debt warning | Σ(invoiced − paid) by overdue days | invoices + payments |
| **6** | **DSO** | Speed of turning sales to cash | (AR ÷ credit sales) × days | invoices + payments |
| **7** | **Revenue by category + margin** | What to push vs prune | per cat: revenue, cost, margin % | invoices + products |
| **8** | **AOV trend** | Deal-size growth | order value ÷ orders | quotations |
| **9** | **Lead source + conversion** | Directs marketing spend | per source: enquiries, won, conv % | enquiries |
| **10** | **Repeat rate & top customers** | Retention = cheapest growth | ≥2-order customers ÷ total | invoices |
| **11** | **Reasons-lost breakdown** | Turns losses into a fixable list | count lost quotes by reason | quotations |
| **12** | **Quote-to-order cycle time** | Faster cycle = faster cash | avg(order − enquiry date) | enquiries + quotations |

**Design guidance:** widgets **1–4 above the fold** (cash, win rate, aging quotes to chase, funnel) answer "how are we doing and what do I do today?" Every ₹ figure is **GST-exclusive (taxable value)**; tax shown separately.

---

## Sources
- [Tally — GST Invoice: Format, Types, Mandatory Fields](https://tallysolutions.com/gst/gst-invoice/) · [Tally — Format & Rules](https://tallysolutions.com/gst/gst-invoice-format-mandatory-fields-rules-and-examples-for-businesses/) · [Tally — E-Invoicing Limit](https://tallysolutions.com/gst/e-invoicing-limit-india/)
- [ClearTax — GST Invoice](https://cleartax.in/s/gst-invoice) · [Kanakkupillai — Rules & Time Limits](https://www.kanakkupillai.com/learn/gst-invoice-format-rules-and-time-limits/) · [GimBooks — E-Invoice Limit 2025-26](https://www.gimbooks.com/blog/e-invoice-applicability-limit-in-2025-latest-rules-threshold-who-must-comply/)
- [Enterslice — Acrylic HSN](https://enterslice.com/learning/hsn-code/search/acrylic/) · [Vakilsearch — Gifting HSN](https://vakilsearch.com/hsn-code/search/corporate-gifting) · [Dripcapital — Lanyard HSN](https://www.dripcapital.com/hsn-code/search/lanyard) · [Graphics Pulse — Printing GST](https://www.graphicspulse.in/gst-rates-for-printing/)
- [Razorpay Route](https://razorpay.com/route/) · [RazorpayX](https://razorpay.com/x/) · [productgrowth.in — RazorpayX Payouts](https://productgrowth.in/tools/payments/razorpay-x/)
- [Zeliq — B2B Conversion Rates](https://www.zeliq.com/blog/b2b-conversion-rates-by-industry) · [Salesmotion — Win Rate Benchmarks 2026](https://salesmotion.io/blog/sales-win-rate-benchmarks-2026)
- [HubSpot — CLV](https://blog.hubspot.com/service/how-to-calculate-customer-lifetime-value) · [Altitude — B2B CLV](https://altitudemarketing.com/blog/b2b-customer-lifetime-value/) · [Alguna — Quote-to-Cash KPIs](https://blog.alguna.com/quote-to-cash-metrics/)
