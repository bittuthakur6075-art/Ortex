import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { LEAVE_STATUS_LABEL, LEAVE_STATUS_TONE, type LeaveStatus } from "@/domain/attendance"
import { useTheme } from "@/store/ThemeContext"
import { radius } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"

/** "Waiting for approval" on its tone's tinted well. */
export function LeaveStatusPill({ status }: { status: LeaveStatus }) {
  const t = useTheme()
  const c = t.tones[LEAVE_STATUS_TONE[status]]
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[textVariants.caption, { color: c.fg, fontFamily: font.semibold }]}>{LEAVE_STATUS_LABEL[status]}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
})
