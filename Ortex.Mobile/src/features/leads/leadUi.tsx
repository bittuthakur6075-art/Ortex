import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { ENQUIRY_STATUS } from "@/domain/schema"
import type { StatusTone } from "@/theme/theme"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Icon } from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * The parts an enquiry page and a voice-call page both need.
 *
 * Both screens answer the same three questions in the same order — is there
 * anything I should know before I ring, what did they ask for, and where is this
 * in the pipeline — so the pieces that answer them are shared rather than
 * written twice with drifting spacing.
 */

export type AdvisoryTone = "danger" | "warning" | "info" | "success"

/**
 * A sentence the person has to read before acting. Deliberately prose, not a
 * badge: "Support" on a chip tells you a rule fired, while "handle this as
 * support before any sales follow-up" tells you what to do about it, which is
 * the difference between a flag and advice.
 */
export function Advisory({ tone, icon, children }: { tone: AdvisoryTone; icon: IconName; children: string }) {
  const t = useTheme()
  const fills: Record<AdvisoryTone, string> = {
    danger: t.dangerBg,
    warning: t.warningBg,
    info: t.iconWell,
    success: t.successBg,
  }
  const inks: Record<AdvisoryTone, string> = {
    danger: t.danger,
    warning: t.warning,
    info: t.primary,
    success: t.success,
  }
  return (
    <View style={[styles.advisory, { backgroundColor: fills[tone] }]}>
      <Icon name={icon} size={18} color={inks[tone]} variant="Bulk" />
      <Text style={[textVariants.small, styles.advisoryText, { color: inks[tone] }]}>{children}</Text>
    </View>
  )
}

/**
 * The pipeline as one row of taps, ported from the console's
 * `EnquiryStatusStepper`: new → contacted → qualified → quoted, then won or
 * lost. Every step writes straight back, so moving a lead along is a tap rather
 * than a form.
 */
export function StatusStepper({
  status,
  onChange,
  disabled,
}: {
  status: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const t = useTheme()
  const currentIndex = ENQUIRY_STATUS.findIndex((s) => s.id === status)
  const closed = status === "won" || status === "lost"

  return (
    <View style={styles.stepper} accessibilityRole="tablist">
      {ENQUIRY_STATUS.map((s, i) => {
        const active = s.id === status
        // "lost" never counts as progress towards "won", so only mark earlier
        // steps done while the lead is still on the happy path.
        const done = !active && currentIndex > i && !(closed && s.id === "won")
        const bg = active ? t.primary : done ? t.successBg : t.surfaceInset
        const fg = active ? t.textOnPrimary : done ? t.success : t.textSecondary
        return (
          <Pressable
            key={s.id}
            disabled={disabled || active}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              feedback.select()
              onChange(s.id)
            }}
            style={({ pressed }) => [styles.step, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}
          >
            {done && <Icon name="tick" size={14} color={fg} variant="Bulk" />}
            <Text style={[styles.stepLabel, { color: fg }]}>{s.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * The action pills, IDENTICAL to the contact card's (CustomerDetailScreen): a
 * 76×54 filled lozenge with a white Bold glyph and its verb beneath in the
 * primary ink. Same geometry, same tone vocabulary, same label weight — a rep
 * moves between an enquiry and the customer behind it constantly, and "Call"
 * should not be a different object on the two pages.
 */
export function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  icon: IconName
  label: string
  onPress: () => void
  disabled?: boolean
  /** A console status tone, or the brand. */
  tone?: StatusTone | "primary"
}) {
  const t = useTheme()
  const fill = tone === "primary" ? t.primary : t.tones[tone].fg
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.quick, { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 }]}
    >
      <View style={[styles.quickCircle, { backgroundColor: fill }]}>
        <Icon name={icon} size={22} color={t.textOnPrimary} variant="Bold" />
      </View>
      <Text style={[styles.quickLabel, { color: t.text }]}>{label}</Text>
    </Pressable>
  )
}

/** An uppercase heading over a group. */
export function GroupLabel({ children }: { children: string }) {
  const t = useTheme()
  return (
    <Text style={[textVariants.sectionLabel, styles.groupLabel, { color: t.textTertiary }]}>
      {children.toUpperCase()}
    </Text>
  )
}

/**
 * One fact. An absent value is drawn as the ASK — "Not captured" in the warning
 * ink where it matters (a delivery city you cannot quote freight without),
 * muted where it does not.
 */
export function Fact({
  icon,
  label,
  value,
  missing = "Not captured",
  important,
}: {
  icon: IconName
  label: string
  value?: string
  missing?: string
  important?: boolean
}) {
  const t = useTheme()
  const has = Boolean(value && value.trim())
  const ink = has ? t.text : important ? t.warning : t.textTertiary
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={t.textTertiary} variant="Bulk" />
      <View style={styles.factBody}>
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
        <Text selectable={has} style={[textVariants.bodyStrong, { color: ink }]}>
          {has ? value : missing}
        </Text>
      </View>
    </View>
  )
}

/**
 * What they asked for. Quantity leads each row because it is the number that
 * decides whether this is a sample or an order, and an item with no quantity is
 * called out rather than left blank — a line without one cannot be priced.
 */
export function ItemRow({
  product,
  quantity,
  note,
  last,
}: {
  product: string
  quantity?: string
  note?: string
  last?: boolean
}) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.item,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.divider },
      ]}
    >
      <View style={styles.itemBody}>
        <Text style={[textVariants.bodyStrong, { color: t.text }]}>{product}</Text>
        {!!note && (
          <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 2 }]}>{note}</Text>
        )}
      </View>
      <Text
        style={[
          textVariants.amount,
          { color: quantity ? t.text : t.warning, fontFamily: quantity ? font.bold : font.medium },
        ]}
      >
        {quantity || "No qty"}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  advisory: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.card,
    // Loose content between panels carries the page gutter itself.
    marginHorizontal: gutter,
    marginBottom: spacing.sm,
  },
  advisoryText: { flex: 1 },

  stepper: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
  },
  stepLabel: { fontSize: 13, fontFamily: font.medium },

  quick: { alignItems: "center", width: 76 },
  quickCircle: {
    width: 76,
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { marginTop: 7, fontSize: 12, fontFamily: font.semibold },

  groupLabel: { marginBottom: spacing.sm, marginLeft: spacing.xs },

  fact: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 9 },
  factBody: { flex: 1, minWidth: 0 },

  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  itemBody: { flex: 1, minWidth: 0 },
})
