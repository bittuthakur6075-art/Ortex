// Device labels on Login sessions: the phone and the console must agree.
//   Ortex.Admin/src/lib/sessions.js  (source of truth)
//   Ortex.Mobile/src/domain/sessions.ts  (the port)

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/sessions.js"))
const mobile = await loadTs("domain/sessions.ts")

const AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/129.0 Mobile/15E148 Safari/604.1",
  "okhttp/4.12.0",
  "Ortex/12 CFNetwork/1494.0.7 Darwin/23.4.0",
  "curl/8.4",
  "",
  null,
]

test("phone and console describe devices identically", () => {
  for (const ua of AGENTS) assert.deepEqual(mobile.describeDevice(ua), admin.describeDevice(ua), String(ua))
})

test("the phone app is named", () => {
  assert.equal(mobile.describeDevice("okhttp/4.12.0").label, "Ortex app on Android")
})
