// What the bot remembers between runs (state.json, gitignored): which digests
// went out, when alerts were switched on, which alerts were already sent, what
// is being held for quiet hours, and whether alerts are muted.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs"
import path from "node:path"
import { ROOT } from "./config.js"

const FILE = path.join(ROOT, "state.json")

export function loadState() {
  if (!existsSync(FILE)) return {}
  try {
    return JSON.parse(readFileSync(FILE, "utf8"))
  } catch {
    return {}
  }
}

// Written to a temp file and renamed, so a crash mid-write cannot leave a
// half-written file that forgets every alert already sent.
export function saveState(state) {
  writeFileSync(`${FILE}.tmp`, JSON.stringify(state, null, 2))
  renameSync(`${FILE}.tmp`, FILE)
}
