import React from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { useIsDark, useTheme } from "@/store/ThemeContext"
import type { Colors } from "@/theme/theme"
import { gutter, size, spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

type ChipProps = {
  label: string
  icon?: IconName
  tint?: string
  active?: boolean
  onPress?: () => void
  onRemove?: () => void
  small?: boolean
  /** The 24px filter-rail pill. Fixed height, so the rail cannot grow with the label. */
  dense?: boolean
}

/**
 * The tint well and the readable words for an active chip. A status hue maps to
 * its own Bg / Text pair; the bare hue on its own 22% tint was under AA.
 * An unknown tint keeps the old look, as the caller chose it.
 */
function activePair(t: Colors, tint?: string): { bg: string; fg: string; border: string } {
  if (!tint || tint === t.primary) return { bg: t.primaryBg, fg: t.primaryText, border: t.primary }
  if (tint === t.danger) return { bg: t.dangerBg, fg: t.dangerText, border: t.danger }
  if (tint === t.success) return { bg: t.successBg, fg: t.successText, border: t.success }
  if (tint === t.warning) return { bg: t.warningBg, fg: t.warningText, border: t.warning }
  if (tint === t.info) return { bg: t.infoBg, fg: t.infoText, border: t.info }
  return { bg: `${tint}22`, fg: tint, border: tint }
}

/** Pill used for filters and tags. */
export function Chip({ label, icon, tint, active, onPress, onRemove, small, dense }: ChipProps) {
  const t = useTheme()
  const isDark = useIsDark()
  const on = activePair(t, tint)
  const color = on.fg
  const bg = active ? on.bg : isDark ? "rgba(255,255,255,0.06)" : t.fieldBg
  const border = active ? on.border : "transparent"

  const content = (
    <View
      style={[
        styles.chip,
        small && styles.chipSmall,
        dense && styles.chipDense,
        { backgroundColor: bg, borderColor: border },
      ]}
    >
      {icon && (
        <View style={styles.chipIcon}>
          <Icon
            name={icon}
            size={small ? 12 : 14}
            color={active ? color : t.textSecondary}
            variant={active ? "Bold" : "Linear"}
          />
        </View>
      )}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={[
          styles.chipLabel,
          small && styles.chipLabelSmall,
          { color: active ? color : t.textSecondary },
        ]}
      >
        {label}
      </Text>
      {onRemove && (
        <Pressable
          hitSlop={8}
          onPress={onRemove}
          style={styles.chipRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
        >
          <Icon name="close" size={13} color={t.textTertiary} />
        </Pressable>
      )}
    </View>
  )

  if (!onPress) return content

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      // A 30dp pill: the slop takes the touch to 48 without growing the rail.
      hitSlop={{ top: (size.touchMin - 30) / 2, bottom: (size.touchMin - 30) / 2, left: 2, right: 2 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      {content}
    </Pressable>
  )
}

export type ChipOption<T extends string> = { key: T; label: string; tint?: string }

type ChipGroupProps<T extends string> = {
  options: ChipOption<T>[]
  value: T
  onChange: (key: T) => void
}

/**
 * The horizontally-scrolling filter rail that sits above every list. Scrolls
 * rather than wraps, because a wrapped rail pushes the list itself off the fold
 * on a phone the moment there are more than four statuses.
 */
export function ChipGroup<T extends string>({ options, value, onChange }: ChipGroupProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.rail}
    >
      {options.map((o) => (
        <Chip
          key={o.key}
          label={o.label}
          tint={o.tint}
          dense
          active={o.key === value}
          onPress={() => onChange(o.key)}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  rail: {
    paddingHorizontal: gutter,
    paddingTop: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: spacing.sm,
  },
  chipDense: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 0,
    marginRight: 4,
  },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  chipIcon: {
    marginRight: 5,
  },
  chipLabel: {
    fontSize: 13,
    fontFamily: font.medium,
    maxWidth: 190,
  },
  chipLabelSmall: {
    fontSize: 11,
  },
  chipRemove: {
    marginLeft: 6,
  },
})
