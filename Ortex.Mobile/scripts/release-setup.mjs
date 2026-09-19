#!/usr/bin/env node
/**
 * One-time setup for publishing the Android app from this PC.
 *
 *   npm run release:setup
 *
 * 1. THE SIGNING KEY. Creates android/app/ortex-release.keystore if it is not
 *    there, using the four ORTEX_* values already in ~/.gradle/gradle.properties,
 *    and copies it to Documents\Ortex-signing. Every future release must be signed
 *    with this same key, or phones refuse the update. KEEP THE BACKUP SOMEWHERE
 *    SAFE (a password manager or company drive), not only on this PC: the last key
 *    was lost when the repo folder was re-cloned on 2026-09-18.
 *
 * 2. THE SERVICE KEY. Writes SUPABASE_SERVICE_ROLE_KEY into the gitignored
 *    .env.release (read only by scripts/release-android.mjs), fetched with the
 *    logged-in Supabase CLI. It is never printed.
 *
 * Safe to run again: anything already in place is left alone.
 */

import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function readProps(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return out
}

// ---- 1. signing key -------------------------------------------------------------

const props = readProps(join(homedir(), ".gradle", "gradle.properties"))
const need = ["ORTEX_STORE_FILE", "ORTEX_STORE_PASSWORD", "ORTEX_KEY_ALIAS", "ORTEX_KEY_PASSWORD"]
const missing = need.filter((k) => !props[k])
if (missing.length) fail(`~/.gradle/gradle.properties is missing ${missing.join(", ")}.`)

const storeFile = resolve(root, "android/app", props.ORTEX_STORE_FILE)

function keytool() {
  const candidates = [
    process.env.JAVA_HOME && join(process.env.JAVA_HOME, "bin", "keytool.exe"),
    process.env.JAVA_HOME && join(process.env.JAVA_HOME, "bin", "keytool"),
    "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe",
    "C:\\Android\\jdk\\bin\\keytool.exe",
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) || "keytool"
}

function fingerprint() {
  const out = execFileSync(keytool(), ["-list", "-v", "-keystore", storeFile, "-storepass", props.ORTEX_STORE_PASSWORD], {
    encoding: "utf8",
  })
  return /SHA256:\s*([0-9A-F:]+)/.exec(out)?.[1] ?? "(unknown)"
}

if (existsSync(storeFile)) {
  console.log(`✔ Signing key already present: ${storeFile}`)
} else {
  console.log("▶ Creating the release signing key…")
  execFileSync(
    keytool(),
    [
      "-genkeypair", "-storetype", "PKCS12", "-keystore", storeFile, "-alias", props.ORTEX_KEY_ALIAS,
      "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
      "-storepass", props.ORTEX_STORE_PASSWORD, "-keypass", props.ORTEX_KEY_PASSWORD,
      "-dname", "CN=Ortex Industries, OU=Field Sales, O=Ortex Industries, L=New Delhi, ST=Delhi, C=IN",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
  console.log(`✔ Created ${storeFile}`)
}

const backupDir = join(homedir(), "Documents", "Ortex-signing")
mkdirSync(backupDir, { recursive: true })
const backup = join(backupDir, "ortex-release.keystore")
if (!existsSync(backup)) copyFileSync(storeFile, backup)
console.log(`✔ Backup copy: ${backup}`)
console.log(`  Key fingerprint (SHA-256): ${fingerprint()}`)
console.log("  Put that backup, and the ORTEX_* lines from ~/.gradle/gradle.properties, somewhere safe off this PC.")

// ---- 2. service key ----------------------------------------------------------------

const envRelease = join(root, ".env.release")
if (readProps(envRelease).SUPABASE_SERVICE_ROLE_KEY) {
  console.log("✔ .env.release already has the service key")
} else {
  const url = readProps(join(root, ".env")).SUPABASE_URL || ""
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1]
  if (!ref) fail("Could not read the project ref from SUPABASE_URL in .env")
  console.log(`▶ Fetching the service key for project ${ref}…`)
  let keys
  try {
    const out = execFileSync("npx", ["supabase", "projects", "api-keys", "--project-ref", ref, "-o", "json"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "ignore"],
    })
    keys = JSON.parse(out.slice(out.indexOf("[")))
  } catch {
    fail("The Supabase CLI could not list the project's keys. Run `npx supabase login` first.")
  }
  const service = keys.find((k) => k.name === "service_role" || k.id === "service_role")?.api_key
  if (!service) fail("No service_role key came back from the Supabase CLI.")
  writeFileSync(envRelease, `SUPABASE_SERVICE_ROLE_KEY=${service}\n`)
  console.log(`✔ Wrote ${envRelease} (gitignored, never commit it)`)
}

console.log("\nReady. Publish with: npm run release:android\n")
