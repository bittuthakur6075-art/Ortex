import React from "react"
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { gutter, radius, size as sizes, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

/**
 * The full-bleed data row.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\AppListRow.jsx
 * and its `fullBleedRowMetrics`.
 *
 * A table does not survive at phone width, so a record becomes a row: a round
 * 38dp icon well, a title and subtitle, and a right-hand stack carrying the
 * figure and its caption. No fact is dropped — columns become lines.
 *
 * Rows are NOT cards. They are flat planes on `surface` separated by a literal
 * 2px band of `colors.border` — the SEPARATION, not a shadow or a margin, is what
 * makes each row read as its own object. Use `RowSeparator` before the first row,
 * between every pair, and after the last.
 *
 * Press feedback is a content opacity fade, never a background ripple.
 */

export const ROW_PADDING = gutter
export const ROW_SEPARATOR_HEIGHT = 2

export function RowSeparator() {
  const c = useTheme()
  return <View style={{ height: ROW_SEPARATOR_HEIGHT, backgroundColor: c.border }} />
}

type Props = {
  title: string
  subtitle?: string
  /** The figure — set in the display serif, because it is what they came to read. */
  value?: string
  /** The caption under the figure: a status, a date. */
  valueSub?: React.ReactNode
  leadingIcon?: IconName
  /** A custom leading slot — a product photo, an avatar — in place of the well. */
  leading?: React.ReactNode
  /** Tints the icon well. `primary` uses the brand at 10%. */
  leadingTone?: StatusTone | "primary"
  /** Actions pinned to the row's right, in place of a value stack. */
  trailing?: React.ReactNode
  onPress?: () => void
  onLongPress?: () => void
  /** A row that opens something shows the chevron; one that states a fact does not. */
  chevron?: boolean
  style?: StyleProp<ViewStyle>
}

export default function ListRow({
  title,
  subtitle,
  value,
  valueSub,
  leadingIcon,
  leading,
  leadingTone = "primary",
  trailing,
  onPress,
  onLongPress,
  chevron,
  style,
}: Props) {
  const c = useTheme()
  const showChevron = chevron ?? Boolean(onPress)

  const wellBg = leadingTone === "primary" ? c.iconWell : c.tones[leadingTone].bg
  const wellFg = leadingTone === "primary" ? c.primary : c.tones[leadingTone].fg

  const body = (
    <>
      {leading ? (
        <View style={styles.leadingSlot}>{leading}</View>
      ) : leadingIcon ? (
        <View style={[styles.well, { backgroundColor: wellBg }]}>
          <Icon name={leadingIcon} size={18} color={wellFg} variant="Bold" />
        </View>
      ) : null}

      <View style={styles.body}>
        <Text numberOfLines={2} style={[textVariants.listTitle, { color: c.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[textVariants.listSubtitle, { color: c.textTertiary, marginTop: 2 }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value || valueSub ? (
        <View style={styles.valueStack}>
          {value ? (
            <Text numberOfLines={1} style={[textVariants.listAmount, { color: c.text }]}>
              {value}
            </Text>
          ) : null}
          {valueSub ? <View style={{ marginTop: 4 }}>{valueSub}</View> : null}
        </View>
      ) : null}

      {trailing}

      {showChevron ? <Icon name="forward" size={18} color={c.textTertiary} /> : null}
    </>
  )

  if (!onPress && !onLongPress) return <View style={[styles.row, style]}>{body}</View>

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, { opacity: pressed ? state.pressedOpacity : 1 }, style]}
    >
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ROW_PADDING,
    paddingVertical: spacing.md,
    // Content is vertically centred; the row never gets shorter than a touch
    // target even when it carries a single line.
    minHeight: sizes.touchMin,
  },
  well: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  leadingSlot: { marginRight: spacing.md },
  body: { flex: 1, minWidth: 0 },
  valueStack: {
    alignItems: "flex-end",
    marginLeft: spacing.md,
  },
})
