import React from "react"
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { fontFamily } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

/**
 * The One UI card vocabulary of the Figma redesign ("Mobile Home v3 · by role",
 * V2/V3 boards, Chat, Attendance and Profile screens), measured off the frames:
 *
 *   · the page is the grey canvas (AppScreen `inset`), and content sits in white
 *     cards 12 from the screen edge, radius 24, 12 apart;
 *   · a section is named by an UPPERCASE grey label ABOVE its card, 28 in;
 *   · a row is 13 top and bottom, 16 in, a 38 round tinted well with its Bulk
 *     glyph, 14 to a 16 title over a 13.5 subtitle; rows part on a 1px rule
 *     indented to the text (16 + 38 + 14 = 68).
 *
 * Flat, as every surface in the app: no shadow (owner's rule; only the tab bar).
 */

export const ONE_UI = { inset: 12, radius: 24, gap: 12, rowX: 16, well: 38 } as const

export type OneTone = "primary" | "success" | "warning" | "danger" | "neutral" | "violet"

export function useOneTone() {
  const t = useTheme()
  return (tone: OneTone): { bg: string; fg: string; solid: string } =>
    ({
      primary: { bg: t.primary10, fg: t.primary, solid: t.primary },
      success: { bg: t.successBg, fg: t.successText, solid: t.success },
      warning: { bg: t.warningBg, fg: t.warningText, solid: t.warning },
      danger: { bg: t.dangerBg, fg: t.dangerText, solid: t.danger },
      neutral: { bg: t.surfaceInset, fg: t.textTertiary, solid: t.textFaint },
      violet: { bg: t.tones.violet.bg, fg: t.tones.violet.fg, solid: t.tones.violet.fg },
    }[tone])
}

/** A white card on the canvas: 12 from the edges, radius 24, 12 below. */
export function Card({
  children,
  style,
  tone,
  padded,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** A tinted card (the phone-number nudge, a settings warning). */
  tone?: OneTone
  /** 16 around the content, for a card that is not a list of rows. */
  padded?: boolean
}) {
  const t = useTheme()
  const tint = useOneTone()
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tone ? tint(tone).bg : t.surfaceRaised },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** The grey UPPERCASE label above a card, with an optional link on the right. */
export function SubHeader({
  title,
  action,
  onAction,
}: {
  title: string
  action?: string
  onAction?: () => void
}) {
  const t = useTheme()
  return (
    <View style={styles.sub}>
      <Text accessibilityRole="header" style={[styles.subText, { color: t.textTertiary }]}>
        {title.toUpperCase()}
      </Text>
      {action && onAction ? (
        <Text
          onPress={() => {
            feedback.tap()
            onAction()
          }}
          accessibilityRole="link"
          suppressHighlighting
          style={[styles.subAction, { color: t.primary }]}
        >
          {action}
        </Text>
      ) : null}
    </View>
  )
}

/** A 38 round tinted well with its Bulk glyph. */
export function Well({
  icon,
  tone = "primary",
  size = ONE_UI.well,
}: {
  icon: IconName
  tone?: OneTone
  size?: number
}) {
  const tint = useOneTone()(tone)
  return (
    <View
      style={[styles.well, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg }]}
    >
      <Icon name={icon} size={Math.round(size / 2)} color={tint.fg} variant="Bulk" />
    </View>
  )
}

/** A small rounded tag: "On", "New", "Pending". */
export function Tag({ label, tone = "neutral", dot }: { label: string; tone?: OneTone; dot?: boolean }) {
  const tint = useOneTone()(tone)
  return (
    <View style={[styles.tag, { backgroundColor: tint.bg }]}>
      {dot ? <View style={[styles.tagDot, { backgroundColor: tint.solid }]} /> : null}
      <Text style={[styles.tagText, { color: tint.fg }]}>{label}</Text>
    </View>
  )
}

/** One row of a card. */
export function CardRow({
  icon,
  tone = "primary",
  leading,
  title,
  subtitle,
  subtitleTone,
  trailing,
  chevron,
  danger,
  onPress,
  accessibilityLabel,
}: {
  icon?: IconName
  tone?: OneTone
  /** In place of the well: an avatar, Anu's face. */
  leading?: React.ReactNode
  title: string
  subtitle?: string
  /** A subtitle that is a warning ("Phone number missing"). */
  subtitleTone?: OneTone
  trailing?: React.ReactNode
  chevron?: boolean
  danger?: boolean
  onPress?: () => void
  accessibilityLabel?: string
}) {
  const t = useTheme()
  const tint = useOneTone()
  const showChevron = chevron ?? Boolean(onPress)
  const body = (
    <View style={styles.row}>
      {leading ?? (icon ? <Well icon={icon} tone={tone} /> : null)}
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: danger ? t.dangerText : t.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[
              styles.rowSub,
              subtitleTone
                ? { color: tint(subtitleTone).fg, fontFamily: fontFamily.medium }
                : { color: t.textTertiary },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? <Icon name="forward" size={18} color={t.textHint} /> : null}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable
      onPress={() => {
        feedback.tap()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {body}
    </Pressable>
  )
}

/** The 1px rule between two rows, indented to the text. */
export function CardDivider({ inset = ONE_UI.rowX + ONE_UI.well + 14 }: { inset?: number }) {
  const t = useTheme()
  return <View style={[styles.divider, { marginLeft: inset, backgroundColor: t.border }]} />
}

/** Rows with a rule between each, the way the cards list them. */
export function CardRows({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean)
  return (
    <>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <CardDivider /> : null}
          {child}
        </React.Fragment>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: ONE_UI.inset,
    marginBottom: ONE_UI.gap,
    borderRadius: ONE_UI.radius,
    paddingVertical: 6,
    overflow: "hidden",
  },
  padded: { padding: 16 },
  sub: { flexDirection: "row", alignItems: "center", paddingHorizontal: 28, paddingTop: 8, paddingBottom: 8 },
  subText: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 16, letterSpacing: 0.7 },
  subAction: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 18 },
  well: { alignItems: "center", justifyContent: "center" },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  tagText: { fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: ONE_UI.rowX,
    paddingVertical: 13,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 21 },
  rowSub: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 18 },
  divider: { height: 1, marginRight: ONE_UI.rowX },
})

/**
 * Panel's props on a card: the drop-in the attendance pages use, so a block that
 * was a full-bleed panel becomes a Figma card without being rewritten. The title
 * is the card's own heading (17 semibold), as in "This week" and the month card.
 */
export function CardPanel({
  title,
  meta,
  action,
  padded,
  children,
  style,
}: {
  title?: string
  meta?: string
  action?: React.ReactNode
  padded?: boolean
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  return (
    <Card style={[panelStyles.card, style]}>
      {title || action ? (
        <View style={panelStyles.head}>
          {title ? <Text style={[panelStyles.title, { color: t.text }]}>{title}</Text> : null}
          {meta ? <Text style={[panelStyles.meta, { color: t.textTertiary }]}>{meta}</Text> : null}
          <View style={panelStyles.flex} />
          {action}
        </View>
      ) : null}
      <View style={padded ? panelStyles.padded : undefined}>{children}</View>
    </Card>
  )
}

const panelStyles = StyleSheet.create({
  card: { paddingTop: 16, paddingBottom: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, marginBottom: 12 },
  title: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 18 },
  flex: { flex: 1 },
  padded: { paddingHorizontal: 18 },
})
