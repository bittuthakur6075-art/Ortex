#!/usr/bin/env node
/**
 * Build, sign and publish the Android app to the team's phones.
 *
 *   npm version minor                          # first: every release needs a higher version
 *   npm run release:android                    # phones are OFFERED the update
 *   npm run release:android -- --required      # phones must update before they can be used
 *   npm run release:android -- --notes "Anu can now take typed questions."
 *   npm run release:android -- --skip-build    # publish the APK already built
 *
 * What it does:
 *   1. refuses unless release signing is configured. A debug-signed APK cannot
 *      replace the installed app, so every phone would fail with "App not installed".
 *   2. builds android/app/build/outputs/apk/release/app-release.apk for the two
 *      ARM chip types real phones use (the x86 ones are emulators only, and would
 *      double the size past Supabase's 50 MB upload cap on the free plan).
 *   3. refuses a version that is not higher than the one already published.
 *   4. uploads the APK to the public `app-releases` bucket (Admin migration 0030)
 *      and then rewrites android/latest.json, the manifest every phone reads
 *      (src/lib/appUpdate.ts, src/features/update/UpdateGate.tsx).
 *
 * Needs SUPABASE_URL (from .env, as the app) and SUPABASE_SERVICE_ROLE_KEY, set
 * in the shell or in a gitignored .env.release. The service key never goes into
 * the app; only this script uses it.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const BUCKET = "app-releases"
const MANIFEST = "android/latest.json"
const FREE_PLAN_LIMIT = 50 * 1024 * 1024

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function readEnvFile(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return out
}

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ""))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
const compare = (a, b) => {
  const pa = parse(a) ?? [0, 0, 0]
  const pb = parse(b) ?? [0, 0, 0]
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

// ---- 0. inputs --------------------------------------------------------------------

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
if (!parse(version)) fail(`package.json version must be MAJOR.MINOR.PATCH, got "${version}"`)

const env = { ...readEnvFile(join(root, ".env")), ...readEnvFile(join(root, ".env.release")), ...process.env }
const url = (env.SUPABASE_URL || "").replace(/\/$/, "")
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail("SUPABASE_URL is missing from .env")
if (!key) {
  fail(
    "SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
      "  Put it in Ortex.Mobile/.env.release (gitignored) as SUPABASE_SERVICE_ROLE_KEY=...\n" +
      "  It is in the Supabase dashboard under Project Settings > API. Never put it in .env.",
  )
}

// The release notes: --notes, else the summary of the matching release in
// src/constants/whatsNew.ts, so the What's new page and the update prompt agree.
function notesFromWhatsNew() {
  const src = readFileSync(join(root, "src/constants/whatsNew.ts"), "utf8")
  const at = src.indexOf(`version: "${version}"`)
  if (at < 0) return ""
  return /summary:\s*"([^"]*)"/.exec(src.slice(at))?.[1] ?? ""
}
const notes = option("notes") ?? notesFromWhatsNew()

// ---- 1. signing -----------------------------------------------------------------------

const SIGNING = ["ORTEX_STORE_FILE", "ORTEX_STORE_PASSWORD", "ORTEX_KEY_ALIAS", "ORTEX_KEY_PASSWORD"]
const gradleProps = readEnvFile(join(homedir(), ".gradle", "gradle.properties"))
const missing = SIGNING.filter((k) => !gradleProps[k] && !env[k])
if (missing.length) {
  fail(
    `Release signing is not configured (missing ${missing.join(", ")} in ~/.gradle/gradle.properties).\n` +
      "  Without it the APK is signed with the debug key and cannot update the installed app.",
  )
}
// Gradle resolves a relative store path against android/app.
const storeFile = resolve(root, "android/app", gradleProps.ORTEX_STORE_FILE || env.ORTEX_STORE_FILE)
if (!existsSync(storeFile)) {
  fail(
    `The release keystore is not at ${storeFile}.\n` +
      "  Copy ortex-release.keystore there. It must be the SAME key the team's installed app was signed with,\n" +
      "  or Android refuses the update and every phone has to uninstall first.",
  )
}

// ---- 2. build ---------------------------------------------------------------------------

const apkPath = join(root, "android/app/build/outputs/apk/release/app-release.apk")
if (!flag("skip-build")) {
  console.log(`\n▶ Building Ortex Sales ${version} (release, ARM only)…\n`)
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew"
  try {
    execFileSync(gradlew, ["app:assembleRelease", "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"], {
      cwd: join(root, "android"),
      stdio: "inherit",
      shell: process.platform === "win32",
    })
  } catch {
    fail("The Gradle build failed. The output above says why.")
  }
}
if (!existsSync(apkPath)) fail(`No APK at ${apkPath}. Build it first, or drop --skip-build.`)
const size = statSync(apkPath).size
const mb = (size / 1024 / 1024).toFixed(1)
if (size > FREE_PLAN_LIMIT) {
  console.warn(
    `\n! The APK is ${mb} MB. Supabase's free plan refuses uploads over 50 MB;` +
      " raise the project's upload limit (Storage > Settings) if the upload below fails.\n",
  )
}

// ---- 3. compare with what is published ------------------------------------------

const storage = `${url}/storage/v1/object`
const auth = { Authorization: `Bearer ${key}`, apikey: key }

let current = null
try {
  const res = await fetch(`${storage}/public/${BUCKET}/${MANIFEST}?t=${Date.now()}`)
  if (res.ok) current = await res.json()
} catch {
  // Nothing published yet, or no signal; the upload below will say which.
}
if (current?.version && compare(version, current.version) <= 0 && !flag("republish")) {
  fail(
    `Version ${version} is not newer than the published ${current.version}.\n` +
      "  Run `npm version minor` (or patch) first, so phones see it as an update.\n" +
      "  To upload the same version again on purpose, add --republish.",
  )
}

const required = flag("required")
const minVersion = required ? version : current?.minVersion || "0.0.0"

// ---- 4. upload ------------------------------------------------------------------------

async function upload(path, body, contentType, cacheControl) {
  const res = await fetch(`${storage}/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": contentType, "x-upsert": "true", "cache-control": cacheControl },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    if (/bucket not found/i.test(text)) {
      fail("The app-releases bucket does not exist. Push Admin migration 0030 first (npm run sb:db:push in Ortex.Admin).")
    }
    fail(`Upload of ${path} failed (${res.status}): ${text}`)
  }
}

const apkKey = `android/ortex-sales-${version}.apk`
console.log(`\n▶ Uploading ${apkKey} (${mb} MB)…`)
await upload(apkKey, readFileSync(apkPath), "application/vnd.android.package-archive", "max-age=31536000")

// The manifest goes LAST: a phone must never be pointed at an APK that is not
// there yet.
const manifest = { version, minVersion, apk: apkKey, size, notes, publishedAt: new Date().toISOString() }
console.log("▶ Publishing the manifest…")
await upload(MANIFEST, JSON.stringify(manifest, null, 2), "application/json", "no-cache")

console.log(`
✔ Ortex Sales ${version} is published.
  ${required ? `REQUIRED: phones below ${version} now show only the update screen.` : `Offered: phones below ${version} are asked once a day. Oldest allowed stays ${minVersion}.`}
  Notes: ${notes || "(none)"}
  APK:   ${url}/storage/v1/object/public/${BUCKET}/${apkKey}
`)
