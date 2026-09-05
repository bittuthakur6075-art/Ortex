import React from "react"
import { Pressable, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { feedback } from "@/lib/feedback"
import { size, spacing } from "@/theme/tokens"
import Icon, { type IconName } from "@/ui/Icon"

/** The floating tab capsule's height, so the FAB can clear it. */
export const TAB_BAR_HEIGHT = size.tabBar

/**
 * The One UI floating action button: a 60px accent circle in the bottom-right,
 * lifted clear of the tab bar. Long-press is the speed dial — Samsung opens a
 * bottom sheet rather than radiating mini-FABs, so `onLongPress` is expected to
 * open a Sheet.
 */
export default function Fab({
  icon = "add",
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  icon?: IconName
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel: string
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Pressable
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
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: t.primary,
          bottom: insets.bottom + TAB_BAR_HEIGHT + spacing.xl,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Icon name={icon} size={26} color={t.textOnPrimary} variant="Linear" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
})
