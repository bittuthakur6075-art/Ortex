import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"

import { formatDateTime } from "@/domain/format"
import type { VoiceCall } from "@/domain/voice"
import { voiceRecordingUrl } from "@/lib/voiceRecordings"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { Icon, Panel } from "@/ui"

/**
 * PORT OF Ortex.Admin/src/pages/voice-leads/CallRecordings.jsx.
 *
 * The website records each call with Anu and files it at `doc.call.recording`
 * on every lead row that call produced (Ortex.Web live-orty/recording.js). A
 * folded call can hold more than one website call when the same person rang
 * back inside the fold window, so every DISTINCT recording is listed, newest
 * first — the same rule the console follows.
 *
 * Why it belongs on a phone at all: the rep about to return this call is in the
 * field, not at the console. Anu's written summary is a paraphrase; the tape is
 * what the customer actually said, including the tone that decides whether this
 * is a price shopper or an order.
 *
 * The object is private (migration 0025: anon insert, staff read), so playback
 * goes through a one-hour signed URL minted per path. A missing object — the
 * caller closed the tab before the upload finished — is a sentence, not an
 * error: it is a normal outcome of a real call.
 */
function recordingsOf(call: VoiceCall): { path: string; at: string }[] {
  const seen = new Map<string, string>()
  for (const r of call.rows || []) {
    const path = r.call?.recording
    if (path && !seen.has(path)) seen.set(path, r.createdAt as string)
  }
  return [...seen.entries()].map(([path, at]) => ({ path, at }))
}

/** Anu's read-back, taken from the NEWEST row — the picture as the call ended. */
function readBackOf(call: VoiceCall): boolean | null {
  for (const r of call.rows || []) {
    if (r.call && typeof r.call.confirmed === "boolean") return r.call.confirmed
  }
  return null
}

export default function CallRecordings({ call }: { call: VoiceCall }) {
  const t = useTheme()
  const list = React.useMemo(() => recordingsOf(call), [call])
  const readBack = readBackOf(call)
  if (!list.length && readBack === null) return null

  return (
    <Panel
      title={list.length > 1 ? `Recordings (${list.length})` : "Recording"}
      padded
    >
      {readBack !== null && <ReadBack confirmed={readBack} />}
      {list.map((r, i) => (
        <View key={r.path} style={{ marginTop: i === 0 && readBack === null ? 0 : spacing.sm }}>
          <Player path={r.path} at={list.length > 1 ? r.at : null} />
        </View>
      ))}
      {!list.length && (
        <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: spacing.sm }]}>
          No recording was saved for this call.
        </Text>
      )}
    </Panel>
  )
}

function ReadBack({ confirmed }: { confirmed: boolean }) {
  const t = useTheme()
  const tint = confirmed ? t.successBg : t.warningBg
  const ink = confirmed ? t.successText : t.warningText
  return (
    <View style={[styles.readBack, { backgroundColor: tint }]}>
      <Icon name={confirmed ? "tick" : "warning"} size={16} color={ink} />
      <Text style={[textVariants.caption, { color: ink, flex: 1 }]}>
        {confirmed
          ? "Anu read the details back and the caller agreed."
          : "Anu never got the details read back. Confirm everything on the call."}
      </Text>
    </View>
  )
}

/** mm:ss, because a call is minutes long and an hour clock would be noise. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function Player({ path, at }: { path: string; at: string | null }) {
  const t = useTheme()
  // Keyed by path so a stale answer for a previous call never plays here.
  const [result, setResult] = React.useState<{ path: string | null; url: string | null }>({
    path: null,
    url: null,
  })

  React.useEffect(() => {
    let alive = true
    setResult({ path: null, url: null })
    voiceRecordingUrl(path).then((url) => {
      if (alive) setResult({ path, url })
    })
    return () => {
      alive = false
    }
  }, [path])

  const loading = result.path !== path
  const player = useAudioPlayer(result.url ?? null)
  const status = useAudioPlayerStatus(player)

  // Playing to the end leaves the head at the end, so the next tap would be a
  // no-op. Rewind it, which is what a second tap on a finished call means.
  React.useEffect(() => {
    if (status.didJustFinish) player.seekTo(0)
  }, [status.didJustFinish, player])

  const toggle = () => {
    feedback.tap()
    if (status.playing) player.pause()
    else player.play()
  }

  if (loading) {
    return <View style={[styles.pending, { backgroundColor: t.fieldBg }]} />
  }

  if (!result.url) {
    return (
      <View style={styles.missing}>
        <Icon name="voice" size={16} color={t.textTertiary} />
        <Text style={[textVariants.caption, { color: t.textTertiary, flex: 1 }]}>
          Recording not available. The caller may have closed the page before the call ended.
        </Text>
      </View>
    )
  }

  const duration = status.duration || 0
  const played = duration > 0 ? Math.min(1, (status.currentTime || 0) / duration) : 0

  return (
    <View>
      {!!at && (
        <Text style={[textVariants.caption, { color: t.textTertiary, marginBottom: 4 }]}>
          {formatDateTime(at)}
        </Text>
      )}
      <View style={[styles.player, { backgroundColor: t.fieldBg }]}>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause recording" : "Play recording"}
          hitSlop={8}
          style={[styles.button, { backgroundColor: t.primary }]}
        >
          <Icon name={status.playing ? "pause" : "play"} size={20} color="#FFFFFF" variant="Bold" />
        </Pressable>
        <View style={styles.track}>
          <View style={[styles.rail, { backgroundColor: t.border }]}>
            <View
              style={[styles.fill, { backgroundColor: t.primary, width: `${Math.round(played * 100)}%` }]}
            />
          </View>
          <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 4 }]}>
            {status.isLoaded ? `${clock(status.currentTime || 0)} / ${clock(duration)}` : "Loading…"}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  readBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  pending: { height: 56, borderRadius: radius.sm },
  missing: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  player: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  track: { flex: 1 },
  rail: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
})
