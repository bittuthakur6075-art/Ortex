import { Image } from "expo-image"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { clockIST, flagWords, REVIEW_LABEL, type Punch } from "@/domain/attendance"
import { selfieUrl } from "@/lib/attendance"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Badge from "@/ui/Badge"
import Icon from "@/ui/Icon"

/**
 * One punch on a timeline: the selfie, what it was and when (server time, IST),
 * where it was recorded, how accurate that was, what the face check said, and
 * anything the server flagged or an admin decided. The selfie is private (signed URL, an hour), so it loads
 * lazily and a missing one (past the 90-day retention) says so.
 */
export default function PunchRow({ punch, onOpenPhoto, last }: { punch: Punch; onOpenPhoto: (url: string) => void; last?: boolean }) {
  const t = useTheme()
  const [url, setUrl] = React.useState<string | null | undefined>(undefined)

  React.useEffect(() => {
    let alive = true
    void selfieUrl(punch.selfie_path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [punch.selfie_path])

  const where =
    punch.mode === "field"
      ? `Field visit${punch.note ? ` · ${punch.note}` : ""}`
      : `${punch.site_name || "Office"}${punch.distance_m != null ? ` · ${Math.round(punch.distance_m)} m` : ""}`
  const accuracy = punch.accuracy_m != null ? `Location accurate to ${Math.round(punch.accuracy_m)} m` : ""
  const flags = flagWords(punch.flags)
  const face = faceWords((punch as Punch & { device?: { faceCheck?: string } | null }).device?.faceCheck)
  const rejected = punch.review === "rejected"

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.node, { backgroundColor: punch.kind === "in" ? t.successBg : t.dangerBg }]}>
          <Icon name={punch.kind === "in" ? "forward" : "back"} size={12} color={punch.kind === "in" ? t.success : t.danger} />
        </View>
        {!last && <View style={[styles.line, { backgroundColor: t.border }]} />}
      </View>

      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={[textVariants.listTitle, { color: rejected ? t.textTertiary : t.text }]}>{clockIST(punch.at)}</Text>
          <Text style={[textVariants.captionStrong, { color: rejected ? t.textTertiary : punch.kind === "in" ? t.successText : t.dangerText }]}>
            {punch.kind === "in" ? "Clock in" : "Clock out"}
          </Text>
          {punch.review !== "ok" && (
            <Badge
              label={REVIEW_LABEL[punch.review]}
              tone={rejected ? "danger" : punch.review === "flagged" ? "warning" : "accent"}
            />
          )}
        </View>
        <Text style={[textVariants.small, { color: t.textSecondary }]}>{where}</Text>
        {!!accuracy && <Text style={[textVariants.caption, { color: t.textTertiary }]}>{accuracy}</Text>}
        {face ? (
          <View style={styles.face}>
            <Icon name={face.ok ? "tick" : "profile"} size={13} color={face.ok ? t.success : face.warn ? t.warning : t.textFaint} variant="Bulk" />
            <Text style={[textVariants.caption, { color: face.ok ? t.successText : face.warn ? t.warningText : t.textTertiary }]}>
              {face.text}
            </Text>
          </View>
        ) : null}
        {flags.length > 0 && (
          <Text style={[textVariants.caption, { color: t.warningText }]}>{flags.join(" · ")}</Text>
        )}
        {!!punch.review_note && (
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>Admin note: {punch.review_note}</Text>
        )}
      </View>

      <Pressable
        disabled={!url}
        onPress={() => url && onOpenPhoto(url)}
        accessibilityRole="imagebutton"
        accessibilityLabel="Open the selfie"
        style={[styles.photo, { backgroundColor: t.fieldBg }]}
      >
        {url ? (
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : url === null ? (
          <Icon name="camera" size={18} color={t.textFaint} />
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: gutter, gap: spacing.md },
  rail: { alignItems: "center", width: 22 },
  node: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 2 },
  line: { flex: 1, width: 2, marginVertical: 4 },
  body: { flex: 1, paddingBottom: spacing.lg, gap: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  face: { flexDirection: "row", alignItems: "center", gap: 4 },
  photo: { width: 52, height: 52, borderRadius: radius.card, overflow: "hidden", alignItems: "center", justifyContent: "center" },
})

/**
 * What the on-phone face check said about the selfie (device.faceCheck, written
 * with the punch by the clock screen). Nothing for a punch that never ran one.
 */
function faceWords(result?: string): { text: string; ok: boolean; warn: boolean } | null {
  switch (result) {
    case "ok":
      return { text: "Face check passed", ok: true, warn: false }
    case "no_face":
      return { text: "No face found in the selfie", ok: false, warn: true }
    case "many_faces":
      return { text: "More than one face in the selfie", ok: false, warn: true }
    case "unavailable":
      return { text: "Face check not available on this phone", ok: false, warn: false }
    default:
      return null
  }
}
