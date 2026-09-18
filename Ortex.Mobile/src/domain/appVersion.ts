/**
 * The update rule for APK installs, kept pure so it is tested
 * (test/appVersion.test.mjs).
 *
 * The team installs the app from an APK, not from a store, so nothing updates it
 * for them. `scripts/release-android.mjs` publishes each build and a small JSON
 * manifest to the public `app-releases` bucket (Admin migration 0030); the app
 * reads that manifest and this decides what to do with it:
 *
 *   · "required"  the installed version is below `minVersion`. The app is
 *                 replaced by the update screen until it is updated.
 *   · "optional"  a newer build exists but this one is still allowed. The rep is
 *                 offered it once per version and can say Later.
 *   · "none"      up to date, or the manifest is missing or unreadable.
 *
 * A bad manifest never locks anybody out: anything unparseable reads "none".
 */

export type ReleaseManifest = {
  /** The newest published build, "1.3.0". */
  version: string
  /** Oldest build still allowed to run. Below it, updating is required. */
  minVersion: string
  /** Path of the APK inside the `app-releases` bucket. */
  apk: string
  /** Bytes, shown on the update screen. */
  size?: number
  /** One or two plain sentences on what changed. */
  notes?: string
  publishedAt?: string
}

export type UpdateStatus = "required" | "optional" | "none"

/** "1.2.0" → [1, 2, 0]. Anything else → null. Leading "v" allowed. */
export function parseVersion(v: unknown): [number, number, number] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(v ?? "").trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}

/** Negative when a < b, 0 when equal, positive when a > b. Unparseable → 0. */
export function compareVersions(a: unknown, b: unknown): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** A manifest the app can act on, or null. */
export function readManifest(raw: unknown): ReleaseManifest | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (!parseVersion(r.version) || typeof r.apk !== "string" || !r.apk) return null
  // A missing or broken minVersion means "nothing is forced".
  const minVersion = parseVersion(r.minVersion) ? String(r.minVersion) : "0.0.0"
  return {
    version: String(r.version),
    minVersion,
    apk: r.apk,
    size: typeof r.size === "number" ? r.size : undefined,
    notes: typeof r.notes === "string" ? r.notes : undefined,
    publishedAt: typeof r.publishedAt === "string" ? r.publishedAt : undefined,
  }
}

export function updateStatus(installed: string, manifest: ReleaseManifest | null): UpdateStatus {
  if (!manifest || !parseVersion(installed)) return "none"
  if (compareVersions(installed, manifest.minVersion) < 0) return "required"
  if (compareVersions(installed, manifest.version) < 0) return "optional"
  return "none"
}

/** "42.3 MB", for the update screen. */
export function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return ""
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
