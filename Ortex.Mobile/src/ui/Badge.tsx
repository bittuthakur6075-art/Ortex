import React, { memo } from "react"
import { StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"

export type BadgeTone = "accent" | "danger" | "warning" | "neutral"

type Props = {
  label?: string | number
  tone?: BadgeTone
  dotOnly?: boolean
}

/**
 * Small count or status pill. Usage:
 * `<Badge label={unreadCount} tone="danger" />`
 * `<Badge tone="accent" dotOnly />`
 */
function Badge({ label, tone = "accent", dotOnly }: Props) {
  const t = useTheme()

  const colors: Record<BadgeTone, { bg: string; text: string }> = {
    accent: { bg: t.accentSoft, text: t.accent },
    danger: { bg: `${t.danger}22`, text: t.danger },
    warning: { bg: `${t.warning}22`, text: t.warning },
    neutral: { bg: t.searchBg, text: t.textSecondary },
  }
  const { bg, text } = colors[tone]

  if (dotOnly) {
    return <View style={[styles.dot, { backgroundColor: text }]} />
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export default memo(Badge)

const styles = StyleSheet.create({
  pill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    fontFamily: font.bold,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
