#!/usr/bin/env node
// Ortex → Tally connector CLI.
//
//   node src/index.js --dry-run --once   # generate XML into ./out, no Tally
//   node src/index.js --once             # one sync pass into Tally
//   node src/index.js                    # loop every sync.intervalSeconds

import { loadConfig } from "./config.js"
import { makeSource } from "./source.js"
import { runSync } from "./sync.js"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const once = args.has("--once") || dryRun

async function main() {
  const cfg = loadConfig()
  const source = makeSource(cfg)

  const pass = () => runSync(cfg, source, { dryRun }).catch((e) => console.error("Sync error:", e.message))

  await pass()
  if (once) return

  const ms = Math.max(30, cfg.sync.intervalSeconds || 300) * 1000
  console.log(`Polling every ${ms / 1000}s — Ctrl+C to stop.`)

  // Self-chaining timer instead of setInterval: the next pass is scheduled only
  // AFTER the current one finishes. A fixed setInterval would fire a second pass
  // while a slow one is still mid-flight, and both would read the same
  // still-unsynced rows and double-post them to Tally.
  const loop = async () => {
    await pass()
    setTimeout(loop, ms)
  }
  setTimeout(loop, ms)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
