import { CameraView, useCameraPermissions } from "expo-camera"
import { Image } from "expo-image"
import React from "react"
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Circle, Path } from "react-native-svg"

import {
  flagWords,
  metresOutside,
  resultSentence,
  selfiePath,
  type LocationCheck,
  type PunchResult,
} from "@/domain/attendance"
import {
  check,
  getReading,
  isNetworkFailure,
  LocationError,
  newPunchId,
  prepareSelfie,
  punch,
  uploadSelfieBase64,
  type Reading,
} from "@/lib/attendance"
import { enqueue } from "@/lib/attendanceQueue"
import { cancelTodayReminder } from "@/lib/attendanceReminders"
import { checkFace, FACE_MESSAGE, type FaceCheck } from "@/lib/faceCheck"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Button from "@/ui/Button"
import Icon from "@/ui/Icon"
import IconButton from "@/ui/IconButton"
import ScreenLoader from "@/ui/ScreenLoader"
import TextField from "@/ui/TextField"

/**
 * Clocking in or out, as one screen in five steps:
 *
 *   locating → where you are (a diagram of the fence and you, Lyft) → selfie
 *   (dark canvas, oval, one line of guidance, Wise / Veriff) → saving → result.
 *
 * The server decides everything that matters (attendance_punch, migration
 * 0033). The pre-check (attendance_check) only lets the screen say "you are
 * 190 m away" before anyone takes a photo. The punch id is made once for the
 * whole attempt, so a Retry after a dropped connection can never punch twice;
 * the server returns the first answer again.
 */

type Photo = { uri: string; width: number; height: number }
type Step = "locating" | "location" | "camera" | "preview" | "saving" | "result"

export default function AttendanceClockScreen({ navigation, route }: StackScreenProps<"AttendanceClock">) {
  const kind = route.params.kind
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const uid = session?.user?.id || ""

  const [step, setStep] = React.useState<Step>("locating")
  const [reading, setReading] = React.useState<Reading | null>(null)
  const [where, setWhere] = React.useState<LocationCheck | null>(null)
  const [locError, setLocError] = React.useState<{ message: string; permission: boolean } | null>(null)
  const [note, setNote] = React.useState("")
  const [photo, setPhoto] = React.useState<Photo | null>(null)
  const [result, setResult] = React.useState<PunchResult | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [queued, setQueued] = React.useState(false)
  const [face, setFace] = React.useState<FaceCheck | null>(null)
  const [checkingFace, setCheckingFace] = React.useState(false)
  const punchId = React.useRef(newPunchId())
  // When the person actually punched, kept for an offline replay.
  const punchedAt = React.useRef<string | null>(null)

  const verb = kind === "in" ? "clock in" : "clock out"

  const locate = React.useCallback(async () => {
    setStep("locating")
    setLocError(null)
    setWhere(null)
    try {
      const r = await getReading()
      setReading(r)
      setWhere(await check(r))
      setStep("location")
    } catch (e) {
      const permission = e instanceof LocationError && e.reason === "permission"
      setLocError({ message: e instanceof Error ? e.message : "Your location could not be read.", permission })
      setStep("location")
    }
  }, [])

  React.useEffect(() => {
    void locate()
  }, [locate])

  const takePhoto = async (p: Photo) => {
    setPhoto(p)
    setFace(null)
    setStep("preview")
    setCheckingFace(true)
    const fc = await checkFace(p.uri)
    setFace(fc)
    setCheckingFace(false)
    if (fc.result === "no_face" || fc.result === "many_faces") feedback.warn()
  }

  const submit = async () => {
    if (!reading || !photo || !uid) return
    setStep("saving")
    setFailure(null)
    setQueued(false)
    punchedAt.current = punchedAt.current || new Date().toISOString()
    // The face check could not run (an APK without the native module): let the
    // punch through, and tell the admin it was not checked.
    const device = face?.result === "unavailable" ? { faceCheck: "unavailable" } : { faceCheck: face?.result ?? "skipped", faces: face?.faces }
    let prepared: { uri: string; base64: string } | null = null
    try {
      prepared = await prepareSelfie(photo.uri, photo.width, photo.height)
      const path = selfiePath(uid, punchId.current)
      await uploadSelfieBase64(prepared.base64, path)
      const res = await punch({ id: punchId.current, kind, reading, selfiePath: path, note, clientAt: punchedAt.current, device })
      setResult(res)
      if (res.status === "ok") feedback.unlocked()
      else if (res.status === "flagged") feedback.warn()
      else feedback.error()
      if (res.status === "ok" || res.status === "flagged") void cancelTodayReminder(kind)
      // A refusal recorded nothing that counts, so the next attempt is a new punch.
      if (res.status === "refused") {
        punchId.current = newPunchId()
        punchedAt.current = null
      }
      setStep("result")
    } catch (e) {
      // No signal: keep it on the phone and send it when the connection is back.
      if (isNetworkFailure(e) && prepared) {
        try {
          await enqueue(
            {
              id: punchId.current,
              kind,
              reading,
              clientAt: punchedAt.current || new Date().toISOString(),
              note,
              device,
              userId: uid,
            },
            prepared.uri,
          )
          void cancelTodayReminder(kind)
          feedback.warn()
          setQueued(true)
          setStep("result")
          return
        } catch {
          /* could not even save it: fall through to the plain failure */
        }
      }
      feedback.error()
      const msg = e instanceof Error ? e.message : ""
      setFailure(
        isNetworkFailure(e)
          ? `No connection. Your ${kind === "in" ? "clock-in" : "clock-out"} was not saved. Try again.`
          : msg || "That did not go through. Try again.",
      )
      setStep("result")
    }
  }

  const close = () => navigation.goBack()

  // ---- camera ----------------------------------------------------------------------
  if (step === "camera" || step === "preview") {
    return (
      <SelfieStep
        photo={step === "preview" ? photo : null}
        checking={checkingFace}
        faceIssue={face && (face.result === "no_face" || face.result === "many_faces") ? FACE_MESSAGE[face.result] : null}
        onTaken={(p) => void takePhoto(p)}
        onRetake={() => {
          setPhoto(null)
          setFace(null)
          setStep("camera")
        }}
        onUse={() => void submit()}
        onClose={close}
        kind={kind}
      />
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton name="close" onPress={close} accessibilityLabel="Close" disabled={step === "saving"} />
        <Text style={[textVariants.appBarTitleBack, { color: t.text }]}>{kind === "in" ? "Clock in" : "Clock out"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === "locating" && <ScreenLoader label="Finding your location" />}
      {step === "saving" && <ScreenLoader label={kind === "in" ? "Clocking you in" : "Clocking you out"} />}

      {step === "location" && (
        <LocationStep
          verb={verb}
          where={where}
          reading={reading}
          error={locError}
          note={note}
          onNote={setNote}
          onRetry={() => void locate()}
          onContinue={() => {
            feedback.tap()
            setStep("camera")
          }}
          bottom={insets.bottom}
        />
      )}

      {step === "result" && (
        <ResultStep
          kind={kind}
          result={result}
          failure={failure}
          queued={queued}
          onDone={close}
          onRetry={() => {
            if (failure) void submit()
            else {
              setPhoto(null)
              setResult(null)
              void locate()
            }
          }}
          bottom={insets.bottom}
        />
      )}
    </View>
  )
}

// ---- where you are ----------------------------------------------------------------------

function LocationStep({
  verb,
  where,
  reading,
  error,
  note,
  onNote,
  onRetry,
  onContinue,
  bottom,
}: {
  verb: string
  where: LocationCheck | null
  reading: Reading | null
  error: { message: string; permission: boolean } | null
  note: string
  onNote: (s: string) => void
  onRetry: () => void
  onContinue: () => void
  bottom: number
}) {
  const t = useTheme()

  let tone: "ok" | "warn" | "bad" = "ok"
  let title = ""
  let body = ""
  let canContinue = false

  if (error) {
    tone = "bad"
    title = "Location not available"
    body = error.message
  } else if (where) {
    if (where.mode === "field") {
      tone = where.accuracyOk ? "ok" : "warn"
      title = "Field visit"
      body = where.accuracyOk
        ? `Your location is recorded with your ${verb}. No office check for field work.`
        : `Location is only accurate to ${where.accuracyM ?? "?"} m. You can still continue; it will be marked for review.`
      canContinue = true
    } else if (!where.sitesConfigured) {
      tone = "bad"
      title = "No office set up yet"
      body = "Your office location has not been set up yet. Ask the Super Admin to add it."
    } else if (!where.accuracyOk) {
      tone = "warn"
      title = "Location is not precise enough"
      body = `Location is only accurate to ${where.accuracyM ?? "?"} m. Move near a window or outside and try again.`
    } else if (where.inside) {
      tone = "ok"
      title = `You're at ${where.site}`
      body = `${where.distanceM ?? 0} m from the office, inside its ${where.radiusM} m area.`
      canContinue = true
    } else if (where.mustBeInside) {
      tone = "bad"
      title = `You are ${metresOutside(where)} m from ${where.site}`
      body = `Clock in when you are within ${where.radiusM} m of the office.`
    } else {
      tone = "warn"
      title = `You are ${metresOutside(where)} m from ${where.site}`
      body = "You can continue, and it will be marked for review."
      canContinue = true
    }
  }

  const mocked = !!reading?.mocked
  const ink = tone === "ok" ? t.successText : tone === "warn" ? t.warningText : t.dangerText
  const well = tone === "ok" ? t.successBg : tone === "warn" ? t.warningBg : t.dangerBg

  return (
    <View style={styles.flex}>
      <View style={styles.content}>
        {where && !error && where.mode === "office" && where.sitesConfigured && (
          <FenceDiagram where={where} />
        )}
        <View style={[styles.card, { backgroundColor: well }]}>
          <Text style={[textVariants.cardTitle, { color: ink }]}>{title}</Text>
          <Text style={[textVariants.small, { color: ink }]}>{body}</Text>
        </View>
        {mocked && (
          <View style={[styles.card, { backgroundColor: t.dangerBg }]}>
            <Text style={[textVariants.smallStrong, { color: t.dangerText }]}>
              Your phone is reporting a fake location. It will not be accepted. Turn off any location-changing app.
            </Text>
          </View>
        )}
        {where?.mode === "field" && !error && (
          <TextField
            label="Where are you? (optional)"
            placeholder="Customer or site name"
            value={note}
            onChangeText={onNote}
            maxLength={120}
          />
        )}
        {!!where && !error && (
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            Location accurate to {where.accuracyM ?? "?"} m. Read once, now. Never tracked.
          </Text>
        )}
      </View>
      <View style={[styles.footer, { paddingBottom: bottom + spacing.md }]}>
        {error?.permission ? (
          <Button label="Open settings" fullWidth onPress={() => void Linking.openSettings()} />
        ) : canContinue ? (
          <Button label="Take selfie" icon="camera" fullWidth onPress={onContinue} />
        ) : null}
        <Button label="Try again" variant={canContinue ? "ghost" : "secondary"} fullWidth onPress={onRetry} />
      </View>
    </View>
  )
}

/** The office's circle and you, to scale, without a map (Lyft's pickup radius). */
function FenceDiagram({ where }: { where: LocationCheck }) {
  const t = useTheme()
  const W = 280
  const H = 150
  const cx = 110
  const cy = H / 2
  const fenceR = 48
  const radiusM = Math.max(1, where.radiusM ?? 150)
  const scale = fenceR / radiusM
  const d = Math.min((where.distanceM ?? 0) * scale, W - cx - 16)
  const acc = Math.min((where.accuracyM ?? 0) * scale, 60)
  const you = where.inside ? t.success : t.danger
  return (
    <View style={styles.diagram} accessible accessibilityLabel={`Office area and your position, ${where.distanceM ?? 0} metres away`}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Circle cx={cx} cy={cy} r={fenceR} fill={t.primary10} stroke={t.primary} strokeWidth={1.5} />
        <Circle cx={cx} cy={cy} r={4} fill={t.primary} />
        {acc > 3 && <Circle cx={cx + d} cy={cy} r={acc} fill={you} opacity={0.14} />}
        <Circle cx={cx + d} cy={cy} r={7} fill={you} stroke={t.surface} strokeWidth={2.5} />
      </Svg>
      <View style={styles.legend}>
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>Office · {radiusM} m area</Text>
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>You · {where.distanceM ?? 0} m</Text>
      </View>
    </View>
  )
}

// ---- selfie ----------------------------------------------------------------------------------

function SelfieStep({
  photo,
  checking,
  faceIssue,
  onTaken,
  onRetake,
  onUse,
  onClose,
  kind,
}: {
  photo: Photo | null
  checking: boolean
  faceIssue: string | null
  onTaken: (p: Photo) => void
  onRetake: () => void
  onUse: () => void
  onClose: () => void
  kind: "in" | "out"
}) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [permission, requestPermission] = useCameraPermissions()
  const camera = React.useRef<CameraView>(null)
  const [ready, setReady] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const ovalW = width * 0.62
  const ovalH = ovalW * 1.3
  const cx = width / 2
  const cy = height * 0.42
  const hole = `M0,0 H${width} V${height} H0 Z M${cx - ovalW / 2},${cy} a${ovalW / 2},${ovalH / 2} 0 1,0 ${ovalW},0 a${ovalW / 2},${ovalH / 2} 0 1,0 ${-ovalW},0 Z`

  const shoot = async () => {
    if (!camera.current || busy) return
    setBusy(true)
    feedback.tap()
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.7, skipProcessing: false })
      if (pic?.uri) onTaken({ uri: pic.uri, width: pic.width, height: pic.height })
    } finally {
      setBusy(false)
    }
  }

  if (permission && !permission.granted) {
    return (
      <View style={[styles.dark, { paddingTop: insets.top + spacing.xxl, paddingHorizontal: gutter }]}>
        <Text style={[textVariants.title, styles.white]}>Camera is off for Ortex</Text>
        <Text style={[textVariants.body, styles.dim]}>A selfie is needed to {kind === "in" ? "clock in" : "clock out"}.</Text>
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
      {photo ? (
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" mirror onCameraReady={() => setReady(true)} />
      )}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={hole} fill="#000000" opacity={0.62} fillRule="evenodd" />
        <Path
          d={`M${cx - ovalW / 2},${cy} a${ovalW / 2},${ovalH / 2} 0 1,0 ${ovalW},0 a${ovalW / 2},${ovalH / 2} 0 1,0 ${-ovalW},0 Z`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={3}
        />
      </Svg>

      <View style={[styles.selfieTop, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.round}>
          <Icon name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={[styles.selfieBottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={[textVariants.bodyStrong, styles.white, styles.center]}>
          {!photo
            ? "Keep your face inside the oval"
            : checking
              ? "Checking the photo"
              : faceIssue || "Is your face clear?"}
        </Text>
        {photo ? (
          <View style={styles.previewRow}>
            <View style={{ flex: 1 }}>
              <Button label="Retake" variant={faceIssue ? "primary" : "secondary"} fullWidth onPress={onRetake} />
            </View>
            {!faceIssue && (
              <View style={{ flex: 1 }}>
                <Button label="Use photo" fullWidth onPress={onUse} disabled={checking} loading={checking} />
              </View>
            )}
          </View>
        ) : (
          <Pressable
            onPress={() => void shoot()}
            disabled={!ready || busy}
            accessibilityRole="button"
            accessibilityLabel="Take selfie"
            style={({ pressed }) => [styles.shutter, { opacity: !ready || busy ? 0.5 : pressed ? 0.8 : 1 }]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

// ---- result ---------------------------------------------------------------------------------

function ResultStep({
  kind,
  result,
  failure,
  queued,
  onDone,
  onRetry,
  bottom,
}: {
  kind: "in" | "out"
  result: PunchResult | null
  failure: string | null
  queued: boolean
  onDone: () => void
  onRetry: () => void
  bottom: number
}) {
  const t = useTheme()
  const ok = !failure && !queued && result?.status === "ok"
  const flagged = !failure && !queued && result?.status === "flagged"
  const good = ok || flagged || queued
  const ink = ok ? t.success : flagged || queued ? t.warning : t.danger
  const well = ok ? t.successBg : flagged || queued ? t.warningBg : t.dangerBg
  const title = queued
    ? "Saved on this phone"
    : ok
      ? kind === "in"
        ? "You're clocked in"
        : "You're clocked out"
      : flagged
        ? "Saved, for review"
        : "Not saved"
  const sentence = queued
    ? `No connection right now. Your ${kind === "in" ? "clock-in" : "clock-out"} will be sent when you are back online. An admin may review it.`
    : failure || (result ? resultSentence(result) : "")

  return (
    <View style={styles.flex}>
      <View style={[styles.content, styles.resultBox]}>
        <View style={[styles.resultIcon, { backgroundColor: well }]}>
          <Icon name={good ? "tick" : "warning"} size={40} color={ink} variant="Bold" />
        </View>
        <Text style={[textVariants.largeTitle, styles.center, { color: t.text }]}>{title}</Text>
        <Text style={[textVariants.body, styles.center, { color: t.textSecondary }]}>{sentence}</Text>
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
            <Button label="Try again" fullWidth onPress={onRetry} />
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
  diagram: { gap: spacing.xs },
  legend: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.sm },
  footer: { paddingHorizontal: gutter, gap: spacing.xs, paddingTop: spacing.sm },
  dark: { flex: 1, backgroundColor: "#000000" },
  white: { color: "#FFFFFF" },
  dim: { color: "#C9CDD8", marginTop: spacing.sm },
  center: { textAlign: "center" },
  selfieTop: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: gutter, flexDirection: "row" },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  selfieBottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: gutter, gap: spacing.lg, alignItems: "center" },
  previewRow: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch" },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#FFFFFF" },
  resultBox: { alignItems: "center", justifyContent: "center", paddingBottom: spacing.huge },
  resultIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
})
