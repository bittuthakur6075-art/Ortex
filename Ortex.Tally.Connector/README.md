# Ortex → Tally Connector

Pushes **customers, products, invoices, payments and payouts** from the Ortex
Admin database (Supabase) into **TallyPrime** as ledgers, stock items, sales
vouchers, receipt vouchers and payment vouchers.

Because TallyPrime only listens on `localhost`, this connector must run on the
**Windows PC where Tally is installed** (or one on the same LAN that can reach
Tally's XML port). It reads records from Supabase, converts them to Tally XML,
POSTs them to Tally, and writes the result back onto each record
(`doc.tally.status`) so nothing double-posts and the admin panel can show sync
status.

## 1. Enable Tally's XML gateway (one time)

In TallyPrime: `F1 (Help) → Settings → Connectivity → Client/Server configuration`
- **TallyPrime acts as**: `Server`
- **Port**: `9000`

Keep the company open while syncing.

## 2. Configure

```bash
cd Ortex.Tally.Connector
npm install
cp config.example.json config.json      # then edit config.json
```

Fill `config.json`:
- `tally.url`: usually `http://localhost:9000`
- `tally.company`: the **exact** company name as it appears in Tally
- `supabase.serviceKey`: your project's **service_role** key (Supabase → Settings → API). This runs only on your machine; never commit it (it's gitignored).
- `ledgers.*`: the **exact names** of your Tally ledgers: `Sales`, `Output CGST/SGST/IGST`, `Round Off`, the `Sundry Debtors` group, a stock group, and the default receipt account (`Cash`/your bank).
- `ledgers.payoutAccount`: the cash/bank ledger payouts are paid from (defaults to `receiptAccount`).
- `ledgers.payoutDefault`: the expense ledger a payout is debited to when its party is not in `partyMap`. Leave it out and unmapped payouts are refused (marked error) instead of guessed.
- `ledgers.partyMap`: `{ "<party as typed in the console>": "<Tally ledger>" }`. Receipts use the linked customer's company/name (or the typed party) as the ledger unless mapped here; payouts are debited only to a mapped ledger or `payoutDefault`.
- `sync.payouts`: export payouts as Payment vouchers (default `false`: switch it on only once `payoutDefault` / `partyMap` are set and past payouts are already in Tally, or every historical payout is posted). `sync.payments` covers money received.
- `sync.retryAfterMinutes`: a record Tally rejected is retried after this many minutes, not every pass (default `60`).

## 3. Run

```bash
npm run dry-run   # generate XML into ./out/ WITHOUT touching Tally, inspect first
npm run once      # one sync pass into Tally
npm start         # keep running, sync every sync.intervalSeconds (default 5 min)
```

Always start with `dry-run` and open the files in `./out/` to confirm the XML
matches your Tally masters before posting for real.

## How balancing works

Each sales voucher debits the party (customer) and credits `Sales` + GST
(+ round-off). The party debit is computed as the exact sum of the credit lines,
so every voucher balances, Tally rejects unbalanced vouchers. Verify offline
with `npm run fixture` (prints sample XML + a balance check).

## Idempotency & re-sync

After a successful post, the connector sets `doc.tally = { status: "synced", … }`
on the record. Only records without `status: "synced"` are picked up. To re-push
a record (e.g. after fixing a ledger name), clear its `doc.tally` in the admin
or database.

The write touches only `doc.tally`, through the `tally_mark` database function
(migration 0066), so a record edited while Tally was posting (an invoice marked
paid) keeps that edit. On a database without 0066 it falls back to an update
guarded by `updated_at`, re-reading the record if it changed.

Every voucher carries `VOUCHERNUMBER` (the console's number) and a stable
`REMOTEID` (`ortex-invoice-<id>`, `ortex-payment-<id>`), so a re-post of a
voucher Tally already has should not create a second one.

Receipts settle bills: a receipt linked to an invoice is an `Agst Ref` allocation
against that invoice's `New Ref`; an unlinked receipt is `On Account` (an
advance to adjust in Tally). A receipt with no party, or whose party is the
receipt account itself, is refused and shown as a Tally error in the console.

## Notes / limits (v1)

- Vouchers are **accounting** invoices (ledger + GST). Inventory allocation
  (stock item movement inside the sales voucher) is a planned enhancement.
- Ledger/stock masters use `ACTION="Create"`; Tally ignores duplicates by name.
  A customer/product must exist as a master before its voucher references it,
  the sync order (masters → vouchers) handles this in one pass.
- GST voucher structure must be validated against **your** Tally company's tax
  setup; ledger names in `config.json` must match exactly.
