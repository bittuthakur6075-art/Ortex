import React from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { gutter, size as sizes, spacing } from "@/theme/tokens"
import Icon from "@/ui/Icon"
import Skeleton, { SkeletonPanel } from "@/ui/Skeleton"

/**
 * The loading state of a record page.
 *
 * It replaces a centred spinner, and the reason is not decoration. A detail
 * page is opened from a row the person just tapped, so the app already knows a
 * page is coming and roughly what shape it has; a spinner on an empty screen
 * throws that away and, on a slow connection, reads as "something has gone
 * wrong" rather than "this is arriving". Worse, it leaves no back arrow, so the
 * one screen where a person most wants out is the one screen they cannot
 * leave except by the system gesture.
 *
 * So the CHROME IS REAL — a live back arrow over the safe area, on the real
 * ground — and only the record itself is drawn as placeholder panels. That is
 * the pattern the good ones follow (eBay, Zomato, Babbel on Mobbin): keep what
 * you know, placeholder only what you are waiting for.
 */
export default function DetailSkeleton({
  onBack,
  /** A full-bleed media block at the top, this many dp tall — the product page. */
  hero,
  /** Lines per placeholder panel, top to bottom. */
  panels = [3, 2, 3],
}: {
  onBack?: () => void
  hero?: number
  panels?: number[]
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <View style={[styles.bar, { height: sizes.appBar }]}>
        {!!onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.slot}
          >
            <Icon name="back" size={24} color={t.text} />
          </Pressable>
        )}
      </View>

      {/* The large title's band, so the real title lands where this bar sat. */}
      <View style={styles.title}>
        <Skeleton width="64%" height={26} radius={9} />
      </View>

      {!!hero && <Skeleton height={hero} radius={0} style={{ marginBottom: 2 }} />}

      {panels.map((lines, i) => (
        <SkeletonPanel key={i} lines={lines} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center" },
  // The arrow's drawn mark sits 10dp inside its 44dp touch box, so the box
  // starts 10 short of the gutter and the glyph lands on the gutter line —
  // AppScreen's SLOT_INSET.back, kept in step by hand.
  slot: {
    width: sizes.touchMin,
    height: sizes.touchMin,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: gutter - 10,
  },
  title: { paddingHorizontal: gutter, paddingTop: spacing.xs, paddingBottom: spacing.md },
})
