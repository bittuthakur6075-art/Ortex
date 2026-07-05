# Ortex Admin Console — Product Requirements (v1)

## 1. Product summary

A back-office operations console for **Ortex Industries** (B2B manufacturer of customized products). It manages the full **quote-to-cash** lifecycle — Enquiries → Products → Quotations → GST Invoices → Payments/Payouts — and surfaces a **growth dashboard** of the metrics that matter (win rate, cash collected, receivables aging, funnel, margin by category).

It is a **standalone application** (`Ortex.Admin/`), separate from the marketing site, so it can evolve on its own release cadence. It is **client-side and API-ready**: today all data lives in the browser behind a repository interface; moving to a real backend is a one-file swap.

## 2. Goals & non-goals

**Goals**
- Give the sales/ops team one place to run the quote-to-cash pipeline.
- Produce GST-compliant quotations and tax invoices (CGST/SGST vs IGST, HSN, numbering, amount-in-words, print/PDF).
- Track the growth KPIs from `GROWTH_TRACKING.md` so the team knows *what to do today* (chase aging quotes, collect overdue invoices).
- Keep a clean migration path to a backend (Zoho Books / Tally / Razorpay) without a UI rewrite.

**Non-goals (v1)**
- Real online payment collection / automated vendor payouts (needs a backend + gateway — recorded manually here).
- GST e-invoicing IRN/QR generation (only mandatory above ₹5 cr AATO; needs GSP/ASP integration).
- Multi-user auth, roles, and audit trails (single shared passphrase for now).
- Production/inventory/BOM management.

## 3. Personas
- **Owner / manager** — watches the growth dashboard; cares about cash, win rate, receivables, margin.
- **Sales executive** — works enquiries, builds quotations, follows up on aging quotes, converts to invoices.
- **Accounts** — issues invoices, records payments, tracks overdue and payouts.

## 4. Modules

| Module | Purpose | Key capabilities |
|---|---|---|
| **Dashboard** | Growth at a glance | 12 ranked widgets: cash collected, win rate, outstanding+DSO, revenue+margin, revenue-vs-collections trend, funnel, quote aging, AR aging, category revenue, lead sources, top customers, reasons-lost, key KPIs; period switch (MTD/QTD/YTD/30d). |
| **Enquiries** | Lead pipeline | Capture/edit leads, source tagging, status lifecycle (new→…→won/lost), star, notes, quick contact (email/call/WhatsApp), **convert to quotation**, CSV export. |
| **Products** | Master data | CRUD for products: SKU, category, HSN, unit, base & cost price (margin), MOQ, GST rate, lead time, status. Feeds quote/invoice line auto-fill. CSV export. |
| **Quotations** | Customer quotes | Line-item editor pulling from product master, per-line + whole-doc discount, live GST split, validity, terms, status lifecycle, **loss-reason capture**, printable document, **convert to invoice**. |
| **Invoices** | GST tax invoices | Generated from quotes or created directly, due dates, **derived status** (paid/partial/overdue auto), **record payment**, payment history, balance, printable GST invoice. |
| **Payments** | Cash ledger | Customer receipts (linked to invoices) + vendor payouts, methods, references, received/paid/net summary, CSV export. |
| **Settings** | Configuration | Company profile (invoice header, GSTIN, bank), tax defaults, document numbering prefixes, quotation terms, password, data (seed/clear), storage overview. |

## 5. Key business rules
- **GST split** — intra-state (buyer state == company state) → CGST+SGST (each half rate); inter-state → IGST. Driven by state codes.
- **Volume discount tiers** mirror the public quote calculator (10% ≥300, 20% ≥1000, 30% ≥5000 units) for consistency.
- **Document numbering** — `PREFIX-<FY>-<0001>`, sequential per Indian financial year (Apr–Mar), gap-free.
- **Invoice status is derived** from payments + due date (paid/partial/overdue) rather than only stored, so it stays live.
- **Revenue/margin are GST-exclusive** (taxable value); tax is tracked separately.
- Money is rounded to 2 dp at every step (`round2`) to avoid float drift; documents round the grand total with a round-off line.

## 6. Architecture
- **Standalone Vite + React 19 app**, Tailwind v4, React Router 7, Lucide, Sonner. Brand tokens shared with the marketing site.
- **Repository pattern** (`data/repository.js`) — all I/O is async and behind one interface. `localStore` (browser) today; implement `apiStore` with the same surface to go live. See `README.md`.
- **Domain layer** (`data/domain.js`) — cross-entity operations (numbering, quote→invoice, payment reconciliation, GST).
- **Analytics** (`data/analytics.js`) — pure functions computing every dashboard metric.
- **Reactive hooks** (`data/hooks.js`) — components re-render on any store change (this tab or another).

## 7. Data model (collections)
- `products` — master data.
- `enquiries` — leads with embedded customer, source, status, notes.
- `quotations` — customer + line items + totals snapshot + status + validity + lostReason.
- `invoices` — customer + line items + totals + dueDate + derived status + amountPaid; may link a quotation.
- `payments` — inflow/payout ledger; inflows link to an invoice.
- `settings` — singleton company/tax/numbering/quotation config.

## 8. Success metrics (for the tool itself)
- Time from enquiry to sent quotation ↓.
- % of aging quotes actioned within SLA ↑.
- Overdue receivables ↓ / DSO ↓.
- Quote win rate visible and trending ↑.

## 9. Roadmap (post-v1)
1. **Backend** — `apiStore` + Node/DB; multi-user auth + roles.
2. **Payments** — Razorpay collection links; RazorpayX payouts + reconciliation webhooks.
3. **E-invoicing** — GST IRP (IRN + QR) via GSP once turnover crosses ₹5 cr.
4. **Website intake** — push site contact/quote-calculator leads straight into `enquiries` (shared origin or API).
5. **Sales reps & follow-up SLA** — owner assignment, cadence reminders, rep leaderboards.
6. **Accounting sync** — export to Zoho Books / Tally.
