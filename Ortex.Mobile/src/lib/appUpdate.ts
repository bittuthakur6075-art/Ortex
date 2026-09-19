import AsyncStorage from "@react-native-async-storage/async-storage"
import { SUPABASE_URL, UPDATE_BASE_URL } from "@env"
import * as FileSystem from "expo-file-system/legacy"
import * as IntentLauncher from "expo-intent-launcher"

import { readManifest, type ReleaseManifest } from "@/domain/appVersion"

/**
 * Reading the release manifest and handing a new APK to Android's installer.
 *
 * WHAT ANDROID ALLOWS: an app installed from an APK cannot update itself
 * silently. It can download the new APK and open the system installer on it;
 * the person holding the phone taps Install (and, the very first time, allows
 * "Install unknown apps" for Ortex). That is what this does. The rule for WHEN
 * is domain/appVersion.ts; the screen is features/update/UpdateGate.tsx.
 *
 * Needs REQUEST_INSTALL_PACKAGES in AndroidManifest.xml. The content URI comes
 * from expo-file-system's own FileProvider, which already exposes the cache
 * directory the APK is downloaded into.
 */

// UPDATE_BASE_URL is for an end-to-end test against a local server; a real
// release leaves it unset and reads the public `app-releases` bucket.
const BUCKET_URL = UPDATE_BASE_URL || `${SUPABASE_URL}/storage/v1/object/public/app-releases`
export const MANIFEST_PATH = "android/latest.json"
const CACHE_KEY = "@ortex/release-manifest"
const APK_MIME = "application/vnd.android.package-archive"
const FLAG_GRANT_READ_URI_PERMISSION = 1
const FETCH_TIMEOUT_MS = 10_000
export const APPLICATION_ID = "com.ortexmobile"

/**
 * The manifest, fresh when there is signal. The last one read is kept, so a
 * phone that was told an update is required cannot dodge it by starting the app
 * in flight mode. A phone that has never read one simply carries on.
 */
export async function loadManifest(): Promise<ReleaseManifest | null> {
  if (!UPDATE_BASE_URL && !SUPABASE_URL) return null
  // A dropped connection does not fail, it HANGS, for minutes, and the app ran
  // unblocked the whole time (seen in the end-to-end test with the server
  // gone). Give up after 10s and fall back to the saved copy.
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS)
  try {
    // The query string defeats the storage CDN's cache, so a release is seen
    // within seconds rather than when the edge copy expires.
    // Raced against a timer as well as aborted: on the test phone the abort
    // alone never settled a connect that the network had silently dropped.
    const res = await Promise.race([
      fetch(`${BUCKET_URL}/${MANIFEST_PATH}?t=${Date.now()}`, {
        headers: { "Cache-Control": "no-cache" },
        signal: abort.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out")), FETCH_TIMEOUT_MS + 500),
      ),
    ])
    if (res.status === 404 || res.status === 400) {
      // Nothing published yet: forget any old instruction.
      await AsyncStorage.removeItem(CACHE_KEY).catch(() => {})
      return null
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const manifest = readManifest(await res.json())
    if (manifest) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(manifest)).catch(() => {})
    return manifest
  } catch {
    return loadCachedManifest()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The last manifest this phone read, instantly and with no network. The gate
 * applies it before asking the server, so a required update blocks from the
 * first frame even when the connection is slow, dead or hanging.
 */
export async function loadCachedManifest(): Promise<ReleaseManifest | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY)
    return cached ? readManifest(JSON.parse(cached)) : null
  } catch {
    return null
  }
}

/**
 * Download the APK (reusing a complete earlier download of the same version)
 * and open the system installer on it. `onProgress` gets 0..1.
 */
export async function downloadAndInstall(
  manifest: ReleaseManifest,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const target = `${FileSystem.cacheDirectory}ortex-sales-${manifest.version}.apk`

  const existing = await FileSystem.getInfoAsync(target)
  const complete = existing.exists && (!manifest.size || existing.size === manifest.size)
  if (!complete) {
    if (existing.exists) await FileSystem.deleteAsync(target, { idempotent: true })
    const task = FileSystem.createDownloadResumable(
      `${BUCKET_URL}/${manifest.apk}`,
      target,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : manifest.size ?? 0
        if (total > 0) onProgress(totalBytesWritten / total)
      },
    )
    const result = await task.downloadAsync()
    if (!result || result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(target, { idempotent: true })
      throw new Error("The download did not finish. Check the connection and try again.")
    }
  }
  onProgress(1)

  const uri = await FileSystem.getContentUriAsync(target)
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: uri,
    type: APK_MIME,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  })
}

/** Android's "Install unknown apps" switch for Ortex, for when it is off. */
export async function openInstallPermission(): Promise<void> {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${APPLICATION_ID}`,
  })
}

/** Old downloads, once the new build is running. Best effort. */
export async function clearDownloadedApks(): Promise<void> {
  try {
    const dir = FileSystem.cacheDirectory
    if (!dir) return
    for (const name of await FileSystem.readDirectoryAsync(dir)) {
      if (/^ortex-sales-.*\.apk$/.test(name)) await FileSystem.deleteAsync(dir + name, { idempotent: true })
    }
  } catch {
    // A leftover file in the cache is harmless; Android clears it when space is short.
  }
}
