import React from "react"
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, size, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

/**
 * Section / SectionRow — the One UI grouped-list vocabulary.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\AppListRow.jsx
 * (`AppSection` + `AppListRow`), measurement for measurement:
 *
 *   · a 12/semibold uppercase title OUTSIDE the plane, with an optional action
 *     (an Edit button) pinned to its right
 *   · one rounded plane holding every row, hairline-bordered at `radius.card`
 *   · dividers INSET from the leading edge with 8 above and 8 below, so two rows
 *     sit 16 apart with the rule centred in the step
 *   · a 16 foot under the last row, so it never rides the closing edge
 *   · each row 44 tall (the touch minimum) with no vertical padding of its own
 *
 * `ListItem` stays what it was — the settings row with a bare glyph. This is the
 * denser record row: a round icon well at the brand at 10%, a label/value stack,
 * and no chevron unless the row actually opens something.
 */

type SectionProps = {
  title?: string
  /** Rendered at the right of the title line — an Edit button, typically. */
  action?: React.ReactNode
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  bodyStyle?: StyleProp<ViewStyle>
}

export function Section({ title, action, children, style, bodyStyle }: SectionProps) {
  const t = useTheme()
  // Flattened DEEP, not merely spread: a screen routinely builds its rows with a
  // `.map()`, which arrives here as ONE child holding an array — without this the
  // divider rhythm would treat the whole list as a single item and the mapped
  // rows would sit flush.
  const items = React.Children.toArray(children).flat(Infinity).filter(Boolean)

  return (
    <View style={style}>
      {(!!title || !!action) && (
        <View style={styles.head}>
          {title ? (
            <Text style={[textVariants.sectionLabel, { color: t.textTertiary }]}>{title.toUpperCase()}</Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      )}

      <View
        style={[
          styles.plane,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            borderRadius: radius.card,
          },
          bodyStyle,
        ]}
      >
        {items.map((child, index) => (
          // eslint-disable-next-line react/no-array-index-key -- positional separators
          <View key={index}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: t.divider }]} />}
            {child}
          </View>
        ))}
      </View>
    </View>
  )
}

export type SectionRowTone = "primary" | "danger" | "success" | "warning"

type SectionRowProps = {
  /** A string takes the row title face; a node renders as-is. */
  title: React.ReactNode
  subtitle?: string
  value?: React.ReactNode
  leadingIcon?: IconName
  leadingTone?: SectionRowTone
  trailing?: React.ReactNode
  onPress?: () => void
  danger?: boolean
  /** Defaults to "only when the row opens something". */
  chevron?: boolean
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

export function SectionRow({
  title,
  subtitle,
  value,
  leadingIcon,
  leadingTone = "primary",
  trailing,
  onPress,
  danger,
  chevron,
  accessibilityLabel,
  style,
}: SectionRowProps) {
  const t = useTheme()
  const showChevron = chevron ?? Boolean(onPress)

  // The well agrees with its glyph: the brand at 10% under a primary icon, the
  // tone's own wash under any other — two unrelated reds inside one 38dp circle
  // is what that rule exists to prevent.
  const wells: Record<SectionRowTone, string> = {
    primary: t.iconWell,
    danger: t.dangerBg,
    success: t.successBg,
    warning: t.warningBg,
  }
  const inks: Record<SectionRowTone, string> = {
    primary: t.primary,
    danger: t.danger,
    success: t.success,
    warning: t.warning,
  }

  const content = (
    <View style={[styles.row, style]}>
      {!!leadingIcon && (
        <View style={[styles.well, { backgroundColor: wells[leadingTone] }]}>
          <Icon name={leadingIcon} size={19} variant="Bulk" color={inks[leadingTone]} />
        </View>
      )}

      <View style={styles.body}>
        {typeof title === "string" ? (
          <Text numberOfLines={2} style={[textVariants.bodyStrong, { color: danger ? t.danger : t.text }]}>
            {title}
          </Text>
        ) : (
          title
        )}
        {!!subtitle && (
          <Text numberOfLines={2} style={[textVariants.small, { color: t.textSecondary, marginTop: 2 }]}>
            {subtitle}
          </Text>
        )}
      </View>

      {(value != null || trailing) && (
        <View style={styles.trailing}>
          {typeof value === "string" || typeof value === "number" ? (
            <Text numberOfLines={1} style={[textVariants.amount, { color: t.text }]}>
              {value}
            </Text>
          ) : (
            value
          )}
          {trailing}
        </View>
      )}

      {showChevron && <Icon name="forward" size={18} color={t.textTertiary} />}
    </View>
  )

  if (!onPress) return content

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof title === "string" ? title : undefined)}
      onPress={onPress}
      // Press feedback is a content fade, not a background wash — no ripple and
      // no plane change, so the group keeps reading as one surface.
      style={({ pressed }) => ({ opacity: pressed ? state.pressedOpacity : 1 })}
    >
      {content}
    </Pressable>
  )
}

/**
 * A fact as an icon-led row: a 12/semibold uppercase label over its value.
 *
 * An empty value hands the row to `onAdd` — it becomes an accent-coloured
 * "Add …" that opens the editor, because grey placeholder text pretending to be
 * data is the thing this pattern exists to remove.
 */
export function FactRow({
  icon,
  label,
  value,
  addLabel,
  onAdd,
}: {
  icon: IconName
  label: string
  value?: string | null
  addLabel?: string
  onAdd?: () => void
}) {
  const t = useTheme()

  const column = (node: React.ReactNode) => (
    <View style={{ gap: 2 }}>
      <Text style={[textVariants.tileLabel, { color: t.textSecondary }]}>{label.toUpperCase()}</Text>
      {node}
    </View>
  )

  if (!value && onAdd) {
    return (
      <SectionRow
        leadingIcon={icon}
        accessibilityLabel={addLabel}
        onPress={onAdd}
        title={column(<Text style={[textVariants.listSubtitle, { color: t.primary }]}>{addLabel}</Text>)}
      />
    )
  }

  return (
    <SectionRow
      leadingIcon={icon}
      chevron={false}
      title={column(
        <Text
          selectable
          style={[textVariants.listSubtitle, { color: value ? t.textStrong : t.textTertiary }]}
        >
          {value || "Not on file"}
        </Text>,
      )}
    />
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    // A section title sits 16 below whatever precedes it and 12 above the rows
    // it names.
    marginBottom: 12,
  },
  plane: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
    // 8 each side: 16 between two rows, with the rule centred in the step.
    marginVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: gutter,
    // The touch minimum as the height, with no vertical padding — a single-line
    // row centres its content in 44 and the group stays dense.
    minHeight: size.touchMin,
  },
  well: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md - 4,
  },
  body: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  trailing: {
    alignItems: "flex-end",
    marginRight: spacing.sm,
  },
})
