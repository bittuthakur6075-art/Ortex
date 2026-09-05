import React from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
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
}

/** Pill used for filters and tags. */
export function Chip({ label, icon, tint, active, onPress, onRemove, small }: ChipProps) {
  const t = useTheme()
  const color = tint ?? t.accent
  const bg = active ? `${color}22` : t.dark ? "rgba(255,255,255,0.06)" : t.searchBg
  const border = active ? color : "transparent"

  const content = (
    <View style={[styles.chip, small && styles.chipSmall, { backgroundColor: bg, borderColor: border }]}>
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
          accessibilityLabel={`Remove ${label}`}
        >
          <Icon name="close" size={13} color={t.textTertiary} />
        </Pressable>
      )}
    </View>
  )

  if (!onPress) return content

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
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
          active={o.key === value}
          onPress={() => onChange(o.key)}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  rail: {
    paddingHorizontal: 20,
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
    marginBottom: 8,
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
