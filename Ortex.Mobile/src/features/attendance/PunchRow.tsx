import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, flagWords, REVIEW_LABEL, type Punch } from "@/domain/attendance"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Badge from "@/ui/Badge"
import Icon from "@/ui/Icon"

/**
 * One punch on a timeline: what it was and when (server time, IST), where it
 * was recorded, how accurate that was, and anything the server flagged or an
 * admin decided.
 *
 * No photo. Selfies stopped being taken in migration 0043 and the last of them
 * were deleted on 2026-09-30 (Ortex.Admin migration 0060).
 */
export default function PunchRow({ punch, last }: { punch: Punch; last?: boolean }) {
  const t = useTheme()

  const where =
    punch.mode === "field"
      ? `Field visit${punch.note ? ` · ${punch.note}` : ""}`
      : `${punch.site_name || "Office"}${punch.distance_m != null ? ` · ${Math.round(punch.distance_m)} m` : ""}`
  const accuracy = punch.accuracy_m != null ? `Location accurate to ${Math.round(punch.accuracy_m)} m` : ""
  const flags = flagWords(punch.flags)
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
        {flags.length > 0 && (
          <Text style={[textVariants.caption, { color: t.warningText }]}>{flags.join(" · ")}</Text>
        )}
        {!!punch.review_note && (
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>Admin note: {punch.review_note}</Text>
        )}
      </View>

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
})

