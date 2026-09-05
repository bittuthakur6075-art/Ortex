import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"

/**
 * The One UI screen head: a slim toolbar row of icon buttons, then the title at
 * reading size underneath it. Samsung's own apps put the big title below the
 * chrome rather than inside it, so the thumb reaches the controls and the eye
 * lands on the name.
 *
 * `leading` / `trailing` take icon buttons; `subtitle` is for the one-line count
 * or context that would otherwise need a second card.
 */
export default function ScreenHeader({
  title,
  subtitle,
  leading,
  trailing,
  children,
}: {
  title: string
  subtitle?: string
  leading?: React.ReactNode
  trailing?: React.ReactNode
  /** Search field, segmented control — anything pinned under the title. */
  children?: React.ReactNode
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, backgroundColor: t.headerBg }]}>
      <View style={styles.bar}>
        <View style={styles.barSide}>{leading}</View>
        <View style={styles.barEnd}>{trailing}</View>
      </View>
      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={[styles.subtitle, { color: t.textTertiary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingBottom: 4,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  barSide: {
    flexDirection: "row",
    alignItems: "center",
  },
  barEnd: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  title: {
    fontSize: 30,
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 2,
    fontFamily: font.extrabold,
  },
  subtitle: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 2,
    fontFamily: font.regular,
  },
})
