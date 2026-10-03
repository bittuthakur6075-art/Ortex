// Sync orchestrator. Order matters: masters (customers, products) before the
// vouchers (invoices, payments) that reference them. In --dry-run mode the XML
// is written to ./out/ for inspection instead of being posted to Tally.

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { ledgerXml, stockItemXml, salesVoucherXml, receiptVoucherXml, paymentVoucherXml } from "./tallyXml.js"
import { postToTally } from "./tallyClient.js"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Persist the sync result, retrying transient failures. The dangerous case is a
// voucher that Tally accepted but whose "synced" flag we then failed to save:
// next pass re-posts it. Every voucher carries a REMOTEID so Tally should match
// the one it already has, and retrying shrinks the window further; if it still
// fails we shout with the record id so the operator can check Tally.
async function writeBackWithRetry(source, collection, row, result, log, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await source.writeBack(collection, row, result)
      return true
    } catch (e) {
      if (i === attempts) {
        if (result.ok) {
          log(`  ‼ CRITICAL: ${collection}/${row.id} was POSTED to Tally but its synced flag could not be saved (${e.message}). It will be re-posted next pass: check Tally for a duplicate, or set doc.tally.status="synced" manually.`)
        } else {
          log(`  ! writeback failed for ${collection}/${row.id}: ${e.message}`)
        }
        return false
      }
      await sleep(500 * i)
    }
  }
}

// Each pipeline: which collection, how to build XML, and a label for logs.
// Payments holds both money in (Receipt voucher, switch sync.payments) and
// payouts (Payment voucher, switch sync.payouts).
const PIPELINES = [
  { keys: ["customers"], collection: "customers", build: ledgerXml, label: (d) => d.company || d.name },
  { keys: ["products"], collection: "products", build: stockItemXml, label: (d) => d.name },
  { keys: ["invoices"], collection: "invoices", build: salesVoucherXml, label: (d) => d.number, filter: (d) => d.status !== "draft" && d.status !== "cancelled" },
  {
    keys: ["payments", "payouts"],
    collection: "payments",
    build: (d, cfg) => ((d.type ?? "inflow") === "payout" ? paymentVoucherXml : receiptVoucherXml)(d, cfg),
    label: (d) => d.number || d.reference || d.invoiceNumber || d.id,
    filter: (d, cfg) => {
      const type = d.type ?? "inflow"
      return (type === "inflow" && cfg.sync.payments !== false) || (type === "payout" && cfg.sync.payouts !== false)
    },
  },
]

// A row that failed recently waits sync.retryAfterMinutes before the next try,
// so a permanently bad record is not re-posted (and re-logged) every pass.
const backingOff = (doc, cfg, now) =>
  doc.tally?.status === "error" && now - Date.parse(doc.tally.triedAt || 0) < (cfg.sync.retryAfterMinutes ?? 60) * 60000

export async function runSync(cfg, source, { dryRun = false, log = console.log, post = postToTally } = {}) {
  const summary = { pushed: 0, skipped: 0, failed: 0, waiting: 0 }
  const now = Date.now()
  if (dryRun) mkdirSync(resolve(process.cwd(), "out"), { recursive: true })

  for (const p of PIPELINES) {
    if (p.keys.every((k) => cfg.sync[k] === false)) continue
    let rows
    try {
      rows = await source.unsynced(p.collection)
    } catch (e) {
      log(`✗ ${p.collection}: ${e.message}`)
      continue
    }
    for (const row of rows) {
      const doc = row.doc || {}
      if (p.filter && !p.filter(doc, cfg)) {
        summary.skipped++
        continue
      }
      if (!dryRun && backingOff(doc, cfg, now)) {
        summary.waiting++
        continue
      }

      // A builder refuses a record it cannot book correctly (no party, party =
      // cash account, no payout ledger): mark it an error, never crash the pass.
      let xml, result
      try {
        xml = p.build({ ...doc, id: row.id }, cfg)
      } catch (e) {
        result = { ok: false, error: e.message }
      }

      if (dryRun) {
        if (result) {
          log(`  ✗ ${p.collection}: ${p.label(doc)}: ${result.error}`)
          summary.failed++
          continue
        }
        const file = resolve(process.cwd(), "out", `${p.collection}-${row.id}.xml`)
        writeFileSync(file, xml, "utf8")
        log(`  ~ ${p.collection}: ${p.label(doc)} → ${file}`)
        summary.pushed++
        continue
      }

      if (!result) {
        result = await post(cfg.tally.url, xml, { timeoutMs: cfg.tally.timeoutMs })
        result.voucherRef = p.label(doc)
      }
      await writeBackWithRetry(source, p.collection, row, result, log)
      if (result.ok) {
        log(`  ✓ ${p.collection}: ${p.label(doc)}`)
        summary.pushed++
      } else {
        log(`  ✗ ${p.collection}: ${p.label(doc)}: ${result.error}`)
        summary.failed++
      }
    }
  }

  const wait = summary.waiting ? `, waiting ${summary.waiting} (failed within the last ${cfg.sync.retryAfterMinutes ?? 60} min)` : ""
  log(`Sync done: pushed ${summary.pushed}, skipped ${summary.skipped}, failed ${summary.failed}${wait}${dryRun ? " (dry run)" : ""}`)
  return summary
}
