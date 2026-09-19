import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Application from "expo-application"
import React from "react"
import { AppState, Platform, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { APP_VERSION } from "@/constants/app"
import { formatBytes, updateStatus, type ReleaseManifest, type UpdateStatus } from "@/domain/appVersion"
import {
  clearDownloadedApks,
  downloadAndInstall,
  loadManifest,
  openInstallPermission,
} from "@/lib/appUpdate"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { Button, Dialog, Icon, ProgressBar } from "@/ui"

/**
 * Keeps every team phone on a build the office still supports.
 *
 * Wraps the whole app, sign-in screen included. On launch and whenever the app
 * comes back to the foreground it reads the release manifest (lib/appUpdate.ts)
 * and, through domain/appVersion.ts:
 *
 *   · REQUIRED  the app is replaced by the update screen. No other screen can be
 *               reached until the new build is installed; the only way through
 *               is Update.
 *   · OPTIONAL  the app works as normal and offers the update in a dialog, at
 *               most once a day per version. "Update" opens the same screen with
 *               a Not now.
 *
 * Android only: iOS has no side-loaded APK and nothing to install.
 */

const RECHECK_MS = 2 * 60 * 1000

/**
 * The version Android says is INSTALLED (versionName, which build.gradle takes
 * from package.json), not the one inlined into the JavaScript bundle. Gradle
 * reuses the previous bundle when only package.json changes, so a fresh APK can
 * carry an old APP_VERSION in its JS; comparing that would ask a phone that has
 * just updated to update again, for ever. Found in the end-to-end test.
 */
const INSTALLED_VERSION = Application.nativeApplicationVersion || APP_VERSION
const SNOOZE_KEY = "@ortex/update-snoozed"
const SNOOZE_MS = 24 * 60 * 60 * 1000

export default function UpdateGate({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = React.useState<ReleaseManifest | null>(null)
  const [status, setStatus] = React.useState<UpdateStatus>("none")
  const [offered, setOffered] = React.useState(false)
  const [screenOpen, setScreenOpen] = React.useState(false)
  const lastCheck = React.useRef(0)

  const check = React.useCallback(async () => {
    lastCheck.current = Date.now()
    const m = await loadManifest()
    const next = updateStatus(INSTALLED_VERSION, m)
    setManifest(m)
    setStatus(next)
    if (next === "none") void clearDownloadedApks()
    if (next === "optional" && m) {
      const raw = await AsyncStorage.getItem(SNOOZE_KEY).catch(() => null)
      const snooze = raw ? (JSON.parse(raw) as { version: string; at: number }) : null
      const snoozed = snooze?.version === m.version && Date.now() - snooze.at < SNOOZE_MS
      if (!snoozed) setOffered(true)
    }
  }, [])

  React.useEffect(() => {
    if (Platform.OS !== "android") return
    void check()
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastCheck.current > RECHECK_MS) void check()
    })
    return () => sub.remove()
  }, [check])

  const snooze = () => {
    setOffered(false)
    setScreenOpen(false)
    if (manifest) {
      void AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify({ version: manifest.version, at: Date.now() })).catch(() => {})
    }
  }

  if (status === "required" && manifest) return <UpdateScreen manifest={manifest} required />
  if (screenOpen && manifest) return <UpdateScreen manifest={manifest} onLater={snooze} />

  return (
    <>
      {children}
      <Dialog
        visible={offered && status === "optional" && !!manifest}
        onClose={snooze}
        title={`Version ${manifest?.version ?? ""} is ready`}
        message={manifest?.notes || "A newer version of Ortex Sales is available. Updating takes about a minute and keeps you signed in."}
        actions={[
          { label: "Later", onPress: snooze },
          {
            label: "Update",
            onPress: () => {
              setOffered(false)
              setScreenOpen(true)
            },
          },
        ]}
      />
    </>
  )
}

type Phase = "idle" | "downloading" | "installing" | "error"

function UpdateScreen({
  manifest,
  required = false,
  onLater,
}: {
  manifest: ReleaseManifest
  required?: boolean
  onLater?: () => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState("")

  const start = async () => {
    feedback.tap()
    setError("")
    setProgress(0)
    setPhase("downloading")
    try {
      await downloadAndInstall(manifest, setProgress)
      // The installer is open (or was closed without installing). If it
      // installs, Android restarts the app on the new build and this screen is
      // never seen again.
      setPhase("installing")
    } catch (e) {
      feedback.error()
      setError((e as Error)?.message || "The update could not be started.")
      setPhase("error")
    }
  }

  const size = formatBytes(manifest.size)

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: t.background, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: t.primary10 }]}>
          <Icon name="refresh" size={30} color={t.primary} />
        </View>
        <Text style={[textVariants.title, styles.center, { color: t.text }]}>
          {required ? "Update required" : "Update available"}
        </Text>
        <Text style={[textVariants.body, styles.center, { color: t.textSecondary }]}>
          {required
            ? `This version (${INSTALLED_VERSION}) can no longer be used. Install version ${manifest.version} to carry on. You stay signed in and nothing is lost.`
            : `Version ${manifest.version} is ready. You are on ${INSTALLED_VERSION}. You stay signed in and nothing is lost.`}
        </Text>

        {!!manifest.notes && (
          <View style={[styles.notes, { backgroundColor: t.surfaceInset }]}>
            <Text style={[textVariants.captionStrong, { color: t.textTertiary }]}>WHAT CHANGED</Text>
            <Text style={[textVariants.small, { color: t.text }]}>{manifest.notes}</Text>
          </View>
        )}

        {phase === "downloading" && (
          <View style={styles.progress}>
            <ProgressBar progress={progress} />
            <Text style={[textVariants.caption, styles.center, { color: t.textTertiary }]}>
              Downloading {Math.round(progress * 100)}%{size ? ` of ${size}` : ""}
            </Text>
          </View>
        )}

        {phase === "installing" && (
          <Text style={[textVariants.small, styles.center, { color: t.textSecondary }]}>
            Tap Install on the next screen. If Android says installs from Ortex are blocked, tap
            Settings there (or the button below), allow it, then come back and tap Update again.
          </Text>
        )}

        {!!error && <Text style={[textVariants.small, styles.center, { color: t.dangerText }]}>{error}</Text>}
      </View>

      <View style={styles.actions}>
        <Button
          label={phase === "installing" || phase === "error" ? "Update again" : size ? `Update now (${size})` : "Update now"}
          size="lg"
          loading={phase === "downloading"}
          disabled={phase === "downloading"}
          onPress={() => void start()}
          style={styles.full}
        />
        {phase === "installing" && (
          <Button
            label="Allow installs from Ortex"
            variant="ghost"
            onPress={() => void openInstallPermission().catch(() => {})}
            style={styles.full}
          />
        )}
        {!required && phase !== "downloading" && (
          <Button label="Not now" variant="ghost" onPress={onLater} style={styles.full} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: gutter, justifyContent: "space-between" },
  body: { alignItems: "center", gap: spacing.md, paddingTop: spacing.xxl },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  notes: { alignSelf: "stretch", borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  progress: { alignSelf: "stretch", gap: spacing.sm },
  actions: { gap: spacing.sm },
  // Button sets alignSelf: flex-start on itself; stretch it across the foot.
  full: { alignSelf: "stretch" },
})
