import { CameraView, useCameraPermissions } from "expo-camera"
import React from "react"
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Path, Rect } from "react-native-svg"

import { canRescan, clockIST, flagWords, isAttendanceCode, resultSentence, type PunchResult } from "@/domain/attendance"
import { isNetworkFailure, newPunchId, punch } from "@/lib/attendance"
import { InfoChip } from "@/features/attendance/attendanceUi"
import { cancelTodayReminder } from "@/lib/attendanceReminders"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Button from "@/ui/Button"
import Icon from "@/ui/Icon"
import IconButton from "@/ui/IconButton"
import ScreenLoader from "@/ui/ScreenLoader"
import TextField from "@/ui/TextField"

/**
 * Clocking in or out, by scanning the code on the office screen (migration
 * 0043). Three steps: scanning, saving, result.
 *
 * The server decides everything that matters. The phone's only job is to read
 * a QR code and hand the string over verbatim; it does not know whether a code
 * is live, whose station it belongs to, or whether this person has already
 * clocked in today. It does check the ORTEX-ATT1 prefix locally, but only so
 * that pointing the camera at a parcel label does not fire a request per
 * frame, never as a decision.
 *
 * Two rules the camera has to honour:
 *
 *   * ONE submit per attempt. `sent` latches on the first accepted frame,
 *     because the scanner keeps firing while the code is in view and each
 *     extra call would burn another code off the screen behind the person in
 *     the queue.
 *   * A retry reuses the SAME punch id, so a dropped connection replays into
 *     the server's own idempotence rather than punching twice. Only a refusal
 *     that recorded nothing mints a new id.
 *
 * There is no offline path: a code is dead within thirty seconds, so a punch
 * saved now and sent later would be refused for a reason the person could do
 * nothing about. It fails at the gate, where it can be tried again.
 */

type Step = "scanning" | "field" | "saving" | "result"

export default function AttendanceClockScreen({ navigation, route }: StackScreenProps<"AttendanceClock">) {
  const kind = route.params.kind
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const [step, setStep] = React.useState<Step>("scanning")
  const [note, setNote] = React.useState("")
  const [result, setResult] = React.useState<PunchResult | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const punchId = React.useRef(newPunchId())
  // Latches on the first accepted frame; see the header note.
  const sent = React.useRef(false)
  const lastPayload = React.useRef<string | null>(null)

  const submit = React.useCallback(
    async (payload: string | null, withNote = "") => {
      setStep("saving")
      setFailure(null)
      lastPayload.current = payload
      try {
        const res = await punch({ id: punchId.current, kind, payload, note: withNote })
        setResult(res)
        if (res.status === "ok") feedback.unlocked()
        else if (res.status === "flagged") feedback.warn()
        else feedback.error()
        if (res.status === "ok" || res.status === "flagged") void cancelTodayReminder(kind)
        // Nothing that counts was recorded, so the next attempt is a new punch.
        if (res.status !== "ok" && res.status !== "flagged") {
          punchId.current = newPunchId()
          sent.current = false
        }
        setStep("result")
      } catch (e) {
        feedback.error()
        const msg = e instanceof Error ? e.message : ""
        setFailure(
          isNetworkFailure(e)
            ? `No connection. Your ${kind === "in" ? "clock-in" : "clock-out"} was not saved. Move where there is signal and scan again.`
            : msg || "That did not go through. Try again.",
        )
        sent.current = false
        setStep("result")
      }
    },
    [kind],
  )

  const onScanned = React.useCallback(
    (payload: string) => {
      if (sent.current) return
      // Not ours: keep looking rather than asking the server about a parcel.
      if (!isAttendanceCode(payload)) return
      sent.current = true
      feedback.tap()
      void submit(payload)
    },
    [submit],
  )

  const close = () => navigation.goBack()

  const rescan = () => {
    setResult(null)
    setFailure(null)
    sent.current = false
    setStep("scanning")
  }

  if (step === "scanning") {
    return <ScanStep kind={kind} onScanned={onScanned} onClose={close} onNoCode={() => setStep("field")} />
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton name="close" onPress={close} accessibilityLabel="Close" disabled={step === "saving"} />
        <Text style={[textVariants.appBarTitleBack, { color: t.text }]}>{kind === "in" ? "Clock in" : "Clock out"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === "saving" && <ScreenLoader label={kind === "in" ? "Clocking you in" : "Clocking you out"} />}

      {step === "field" && (
        <FieldStep
          kind={kind}
          note={note}
          onNote={setNote}
          onSubmit={() => void submit(null, note)}
          onBack={() => setStep("scanning")}
          bottom={insets.bottom}
        />
      )}

      {step === "result" && (
        <ResultStep
          kind={kind}
          result={result}
          failure={failure}
          onDone={close}
          onScanAgain={rescan}
          onRetry={() => void submit(lastPayload.current, note)}
          bottom={insets.bottom}
        />
      )}
    </View>
  )
}

// ---- scanning ------------------------------------------------------------------------------

/**
 * The camera, a cut-out window and one line of guidance. Dark, like every
 * scanner people already know, so the bright QR on the wall is the only thing
 * on screen with any light in it.
 */
function ScanStep({
  kind,
  onScanned,
  onClose,
  onNoCode,
}: {
  kind: "in" | "out"
  onScanned: (payload: string) => void
  onClose: () => void
  onNoCode: () => void
}) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [permission, requestPermission] = useCameraPermissions()

  const box = Math.min(width * 0.72, 300)
  const x = (width - box) / 2
  const y = height * 0.3
  // A full-screen dim with the scanning window punched out of it (even-odd).
  const hole = `M0,0 H${width} V${height} H0 Z M${x},${y} H${x + box} V${y + box} H${x} Z`

  if (permission && !permission.granted) {
    return (
      <View style={[styles.dark, { paddingTop: insets.top + spacing.xxl, paddingHorizontal: gutter }]}>
        <Text style={[textVariants.title, styles.white]}>Camera is off for Ortex</Text>
        <Text style={[textVariants.body, styles.dim]}>
          The camera reads the code on the office screen. That is how you {kind === "in" ? "clock in" : "clock out"}.
        </Text>
        <View style={{ height: spacing.lg }} />
        {permission.canAskAgain ? (
          <Button label="Allow camera" fullWidth onPress={() => void requestPermission()} />
        ) : (
          <Button label="Open settings" fullWidth onPress={() => void Linking.openSettings()} />
        )}
        <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
      </View>
    )
  }

  return (
    <View style={styles.dark}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(e) => onScanned(e.data)}
      />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={hole} fill="#000000" opacity={0.62} fillRule="evenodd" />
        <Rect x={x} y={y} width={box} height={box} rx={20} fill="none" stroke="#FFFFFF" strokeWidth={3} />
      </Svg>

      <View style={[styles.scanTop, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.round}>
          <Icon name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={[styles.scanBottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={[textVariants.bodyStrong, styles.white, styles.center]}>
          Point at the code on the office screen
        </Text>
        <Text style={[textVariants.small, styles.dim, styles.center]}>
          The code changes every few seconds. That is normal, just hold it in the box.
        </Text>
        <Button label="No code to scan?" variant="secondary" fullWidth onPress={onNoCode} />
      </View>
    </View>
  )
}

// ---- no code (field visit) --------------------------------------------------------------------

/**
 * For a rep who starts the day at a customer's site. The server decides
 * whether this person is allowed to mark attendance without a code; an office
 * worker gets a plain refusal here, which is the honest answer and the reason
 * this screen does not pretend to know the person's mode itself.
 */
function FieldStep({
  kind,
  note,
  onNote,
  onSubmit,
  onBack,
  bottom,
}: {
  kind: "in" | "out"
  note: string
  onNote: (s: string) => void
  onSubmit: () => void
  onBack: () => void
  bottom: number
}) {
  const t = useTheme()
  return (
    <View style={styles.flex}>
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: t.warningBg }]}>
          <Text style={[textVariants.cardTitle, { color: t.warningText }]}>Marking without a code</Text>
          <Text style={[textVariants.small, { color: t.warningText }]}>
            This is for field work, when you are not at an office screen. It is recorded and an admin checks it. If you
            are at the office, go back and scan the code instead.
          </Text>
        </View>
        <TextField
          label="Where are you? (optional)"
          placeholder="Customer or site name"
          value={note}
          onChangeText={onNote}
          maxLength={120}
        />
      </View>
      <View style={[styles.footer, { paddingBottom: bottom + spacing.md }]}>
        <Button label={kind === "in" ? "Clock in without a code" : "Clock out without a code"} fullWidth onPress={onSubmit} />
        <Button label="Back to the scanner" variant="ghost" fullWidth onPress={onBack} />
      </View>
    </View>
  )
}

// ---- result ---------------------------------------------------------------------------------

function ResultStep({
  kind,
  result,
  failure,
  onDone,
  onScanAgain,
  onRetry,
  bottom,
}: {
  kind: "in" | "out"
  result: PunchResult | null
  failure: string | null
  onDone: () => void
  onScanAgain: () => void
  onRetry: () => void
  bottom: number
}) {
  const t = useTheme()
  const ok = !failure && result?.status === "ok"
  const flagged = !failure && result?.status === "flagged"
  const good = ok || flagged
  const ink = ok ? t.success : flagged ? t.warning : t.danger
  const well = ok ? t.successBg : flagged ? t.warningBg : t.dangerBg
  const title = ok
    ? kind === "in"
      ? "You're clocked in"
      : "You're clocked out"
    : flagged
      ? "Saved, for review"
      : "Not saved"
  const sentence = failure || (result ? resultSentence(result) : "")
  // A dead code means "look up, the screen has a new one". Being already
  // clocked in does not, so it gets Close rather than Scan again.
  const again = !good && !failure && result ? canRescan(result.status) : false

  return (
    <View style={styles.flex}>
      <View style={[styles.content, styles.resultBox]}>
        <View style={[styles.resultIcon, { backgroundColor: well }]}>
          <Icon name={good ? "tick" : "warning"} size={40} color={ink} variant="Bold" />
        </View>
        <Text style={[textVariants.largeTitle, styles.center, { color: t.text }]}>{title}</Text>
        <Text style={[textVariants.body, styles.center, { color: t.textSecondary }]}>{sentence}</Text>
        {good && result?.at ? (
          <InfoChip icon="clock" tone={ok ? "success" : "warning"}>
            {`${kind === "in" ? "In" : "Out"} at ${clockIST(result.at)}${result.mode === "field" ? " · Field visit" : result.site ? ` · ${result.site}` : ""}`}
          </InfoChip>
        ) : null}
        {flagged && result?.flags?.length ? (
          <Text style={[textVariants.small, styles.center, { color: t.warningText }]}>
            An admin will check: {flagWords(result.flags).join(", ").toLowerCase()}.
          </Text>
        ) : null}
      </View>
      <View style={[styles.footer, { paddingBottom: bottom + spacing.md }]}>
        {good ? (
          <Button label="Done" fullWidth onPress={onDone} />
        ) : (
          <>
            {failure ? <Button label="Try again" fullWidth onPress={onRetry} /> : null}
            {again ? <Button label="Scan again" fullWidth={!failure} variant={failure ? "ghost" : "primary"} onPress={onScanAgain} /> : null}
            <Button label="Close" variant="ghost" fullWidth onPress={onDone} />
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  bar: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter - 10 },
  content: { flex: 1, paddingHorizontal: gutter, paddingTop: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  footer: { paddingHorizontal: gutter, gap: spacing.xs, paddingTop: spacing.sm },
  dark: { flex: 1, backgroundColor: "#000000" },
  white: { color: "#FFFFFF" },
  dim: { color: "#C9CDD8", marginTop: spacing.sm },
  center: { textAlign: "center" },
  scanTop: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: gutter, flexDirection: "row" },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  scanBottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: gutter, gap: spacing.sm, alignItems: "center" },
  resultBox: { alignItems: "center", justifyContent: "center", paddingBottom: spacing.huge },
  resultIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
})
