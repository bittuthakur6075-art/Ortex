// The APK update rule (domain/appVersion.ts). A mistake here either locks the
// whole team out of the app or never asks anyone to update, so both edges are
// pinned down.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { compareVersions, formatBytes, parseVersion, readManifest, updateStatus } =
  await loadTs("domain/appVersion.ts")

const manifest = (over = {}) => readManifest({ version: "1.3.0", minVersion: "1.2.0", apk: "android/a.apk", ...over })

test("versions compare numerically, not as text", () => {
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0)
  assert.ok(compareVersions("1.2.0", "1.2.1") < 0)
  assert.equal(compareVersions("1.2", "1.2.0"), 0)
  assert.equal(compareVersions("v2.0.0", "2.0.0"), 0)
  assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3])
  assert.equal(parseVersion("latest"), null)
})

test("below the minimum, the update is required", () => {
  assert.equal(updateStatus("1.1.0", manifest()), "required")
})

test("allowed but behind, the update is offered", () => {
  assert.equal(updateStatus("1.2.0", manifest()), "optional")
  assert.equal(updateStatus("1.2.5", manifest()), "optional")
})

test("on or past the newest build, nothing happens", () => {
  assert.equal(updateStatus("1.3.0", manifest()), "none")
  // A phone with a build newer than the manifest (a test install) is left alone.
  assert.equal(updateStatus("1.4.0", manifest({ minVersion: "1.3.0" })), "none")
})

test("a missing or broken manifest never locks anybody out", () => {
  assert.equal(updateStatus("1.0.0", null), "none")
  assert.equal(readManifest(null), null)
  assert.equal(readManifest({ version: "soon", apk: "x.apk" }), null)
  assert.equal(readManifest({ version: "1.3.0" }), null)
  // A broken minVersion forces nothing; the newer build is still offered.
  const m = readManifest({ version: "1.3.0", minVersion: "latest", apk: "a.apk" })
  assert.equal(m.minVersion, "0.0.0")
  assert.equal(updateStatus("1.0.0", m), "optional")
})

test("sizes read in KB and MB", () => {
  assert.equal(formatBytes(44_356_812), "42.3 MB")
  assert.equal(formatBytes(2048), "2 KB")
  assert.equal(formatBytes(undefined), "")
})
