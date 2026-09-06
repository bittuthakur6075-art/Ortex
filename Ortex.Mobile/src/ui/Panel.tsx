import React from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"

/**
 * A section of a page.
 *
 * THE APP'S SECTION LANGUAGE, and the only one: a panel is full-bleed — no
 * radius, no border, no shadow — on `surface`, and what separates it from the
 * panel above and below is a literal 2dp band of `colors.border`. The SEPARATION
 * is the boundary. A rounded, hairline-bordered card floating on a page of the
 * same colour draws that boundary twice and, at a glance, reads as a stack of
 * lozenges rather than one page of sections.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner AppCard, whose sheet-page form
 * is exactly this: "a FLAT PANEL — full width, no radius, no border, no shadow —
 * separated from the panel above and below by the 2px band".
 *
 * Each panel draws its OWN bottom band rather than the screen inserting bands
 * between its children. Capnix tried it the other way first: a screen that maps
 * over children to place separators breaks the moment a panel is conditional or
 * wrapped, and these pages are full of `{x && <Panel/>}`.
 *
 * Two rules for callers:
 *   · the PAGE adds no horizontal padding — a panel reaches both edges and pads
 *     its own content by `gutter`. A screen that also pads gets a double inset
 *     and bands that stop short of the screen.
 *   · loose content between panels (a hint, a submit button) carries the gutter
 *     itself.
 *
 * `Section` (ui/Section.tsx) is this same panel plus the grouped-row rhythm —
 * dividers between children, a 44dp row height. Reach for `Panel` when the
 * content is not a list of rows.
 */
export default function Panel({
  title,
  /** A short count or status set beside the title — "3 lines". */
  meta,
  /** Rendered at the right of the title line — an Edit button, typically. */
  action,
  children,
  /** Padding for content that is not already full-bleed rows. */
  padded = false,
  style,
}: {
  title?: string
  meta?: string
  action?: React.ReactNode
  children: React.ReactNode
  padded?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const hasHead = !!title || !!action

  return (
    <>
      <View style={[{ backgroundColor: t.surface }, style]}>
        {hasHead && (
          <View style={styles.head}>
            {!!title && (
              <Text style={[textVariants.sectionLabel, { color: t.textTertiary }]}>
                {title.toUpperCase()}
              </Text>
            )}
            {!!meta && (
              <Text style={[textVariants.caption, styles.meta, { color: t.textTertiary }]}>{meta}</Text>
            )}
            {!!action && <View style={styles.action}>{action}</View>}
          </View>
        )}
        <View style={padded ? styles.padded : undefined}>{children}</View>
      </View>
      <PanelBand />
    </>
  )
}

/**
 * The band on its own, for a block that is its own panel but cannot use the
 * component — a hero that must paint edge to edge, say.
 */
export function PanelBand() {
  const t = useTheme()
  return <View style={[styles.band, { backgroundColor: t.border }]} />
}

const styles = StyleSheet.create({
  band: { height: 2 },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: gutter,
    paddingTop: gutter,
    paddingBottom: spacing.sm,
  },
  meta: { marginLeft: 8 },
  action: { marginLeft: "auto", alignSelf: "center" },
  padded: { paddingHorizontal: gutter, paddingBottom: gutter },
})
