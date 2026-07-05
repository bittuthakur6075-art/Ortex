# Ortex → Tally Connector

Pushes **customers, products, invoices and payments** from the Ortex Admin
database (Supabase) into **TallyPrime** as ledgers, stock items, sales vouchers
and receipt vouchers.

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
- `tally.url` — usually `http://localhost:9000`
- `tally.company` — the **exact** company name as it appears in Tally
- `supabase.serviceKey` — your project's **service_role** key (Supabase → Settings → API). This runs only on your machine; never commit it (it's gitignored).
- `ledgers.*` — the **exact names** of your Tally ledgers: `Sales`, `Output CGST/SGST/IGST`, `Round Off`, the `Sundry Debtors` group, a stock group, and the default receipt account (`Cash`/your bank).

## 3. Run

```bash
npm run dry-run   # generate XML into ./out/ WITHOUT touching Tally — inspect first
npm run once      # one sync pass into Tally
npm start         # keep running, sync every sync.intervalSeconds (default 5 min)
```

Always start with `dry-run` and open the files in `./out/` to confirm the XML
matches your Tally masters before posting for real.

## How balancing works

Each sales voucher debits the party (customer) and credits `Sales` + GST
(+ round-off). The party debit is computed as the exact sum of the credit lines,
so every voucher balances — Tally rejects unbalanced vouchers. Verify offline
with `npm run fixture` (prints sample XML + a balance check).

## Idempotency & re-sync

After a successful post, the connector sets `doc.tally = { status: "synced", … }`
on the record. Only records without `status: "synced"` are picked up. To re-push
a record (e.g. after fixing a ledger name), clear its `doc.tally` in the admin
or database.

## Notes / limits (v1)

- Vouchers are **accounting** invoices (ledger + GST). Inventory allocation
  (stock item movement inside the sales voucher) is a planned enhancement.
- Ledger/stock masters use `ACTION="Create"`; Tally ignores duplicates by name.
  A customer/product must exist as a master before its voucher references it —
  the sync order (masters → vouchers) handles this in one pass.
- GST voucher structure must be validated against **your** Tally company's tax
  setup; ledger names in `config.json` must match exactly.
