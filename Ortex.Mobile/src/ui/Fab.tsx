import React from "react"
import { StyleSheet, Text } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { feedback } from "@/lib/feedback"
import { size, spacing } from "@/theme/tokens"
import { fontFamily } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import { AnimatedPressable, usePressMotion } from "@/ui/motion"

/** The floating tab capsule's height, so the FAB can clear it. */
export const TAB_BAR_HEIGHT = size.tabBar

/**
 * The One UI floating action button: a 60px accent circle in the bottom-right,
 * lifted clear of the tab bar (or, with `inTabs={false}`, the screen's bottom corner). Long-press is the speed dial — Samsung opens a
 * bottom sheet rather than radiating mini-FABs, so `onLongPress` is expected to
 * open a Sheet.
 */
export default function Fab({
  icon = "add",
  label,
  onPress,
  onLongPress,
  accessibilityLabel,
  inTabs = true,
}: {
  icon?: IconName
  /** Extended FAB: the glyph and a word ("New Quote"). */
  label?: string
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel: string
  /** False on a pushed page with no tab bar under it. */
  inTabs?: boolean
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const press = usePressMotion({ scale: 0.92, dim: 0.9 })

  return (
    <AnimatedPressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        feedback.tap()
        onPress()
      }}
      onLongPress={
        onLongPress
          ? () => {
              feedback.longPress()
              onLongPress()
            }
          : undefined
      }
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.fab,
        label ? styles.extended : null,
        {
          backgroundColor: t.primary,
          bottom: insets.bottom + (inTabs ? TAB_BAR_HEIGHT : 0) + spacing.xl,
        },
        press.style,
      ]}
    >
      <Icon name={icon} size={label ? 22 : 26} color={t.textOnPrimary} variant="Linear" />
      {label ? <Text style={[styles.label, { color: t.textOnPrimary }]}>{label}</Text> : null}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 60,
    minHeight: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  extended: { width: undefined, height: 52, borderRadius: 26, flexDirection: "row", gap: 8, paddingLeft: 18, paddingRight: 22 },
  label: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20 },
})
