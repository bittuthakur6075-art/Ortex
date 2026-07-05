// Sync orchestrator. Order matters: masters (customers, products) before the
// vouchers (invoices, payments) that reference them. In --dry-run mode the XML
// is written to ./out/ for inspection instead of being posted to Tally.

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { ledgerXml, stockItemXml, salesVoucherXml, receiptVoucherXml } from "./tallyXml.js"
import { postToTally } from "./tallyClient.js"

// Each pipeline: which collection, how to build XML, and a label for logs.
const PIPELINES = [
  { key: "customers", collection: "customers", build: ledgerXml, label: (d) => d.company || d.name },
  { key: "products", collection: "products", build: stockItemXml, label: (d) => d.name },
  { key: "invoices", collection: "invoices", build: salesVoucherXml, label: (d) => d.number, filter: (d) => d.status !== "draft" },
  { key: "payments", collection: "payments", build: receiptVoucherXml, label: (d) => d.reference || d.invoiceNumber || d.id, filter: (d) => (d.type ?? "inflow") === "inflow" },
]

export async function runSync(cfg, source, { dryRun = false, log = console.log } = {}) {
  const summary = { pushed: 0, skipped: 0, failed: 0 }
  if (dryRun) mkdirSync(resolve(process.cwd(), "out"), { recursive: true })

  for (const p of PIPELINES) {
    if (cfg.sync[p.key] === false) continue
    let rows
    try {
      rows = await source.unsynced(p.collection)
    } catch (e) {
      log(`✗ ${p.key}: ${e.message}`)
      continue
    }
    for (const row of rows) {
      const doc = row.doc || {}
      if (p.filter && !p.filter(doc)) {
        summary.skipped++
        continue
      }
      const xml = p.build(doc, cfg)

      if (dryRun) {
        const file = resolve(process.cwd(), "out", `${p.key}-${row.id}.xml`)
        writeFileSync(file, xml, "utf8")
        log(`  ~ ${p.key}: ${p.label(doc)} → ${file}`)
        summary.pushed++
        continue
      }

      const result = await postToTally(cfg.tally.url, xml)
      result.voucherRef = p.label(doc)
      try {
        await source.writeBack(p.collection, row.id, doc, result)
      } catch (e) {
        log(`  ! writeback failed for ${p.key}/${row.id}: ${e.message}`)
      }
      if (result.ok) {
        log(`  ✓ ${p.key}: ${p.label(doc)}`)
        summary.pushed++
      } else {
        log(`  ✗ ${p.key}: ${p.label(doc)} — ${result.error}`)
        summary.failed++
      }
    }
  }

  log(`Sync done — pushed ${summary.pushed}, skipped ${summary.skipped}, failed ${summary.failed}${dryRun ? " (dry run)" : ""}`)
  return summary
}
