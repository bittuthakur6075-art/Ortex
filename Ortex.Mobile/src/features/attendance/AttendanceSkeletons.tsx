import React from "react"
import { StyleSheet, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import Skeleton from "@/ui/Skeleton"

/**
 * Placeholders that promise the real layouts of the attendance pages: the
 * dial hero, the week strip, the month tiles and the day rows. Each draws its
 * own 2dp band, as the panel it stands in for does.
 */

function Band() {
  const t = useTheme()
  return <View style={[styles.band, { backgroundColor: t.border }]} />
}

/** The Attendance page's hero: the shift and state chips, the timer, the Check-in pill, the stamp line. */
export function DialHeroSkeleton() {
  const t = useTheme()
  return (
    <>
      <View style={[styles.hero, { backgroundColor: t.surface }]}>
        <View style={styles.chips}>
          <Skeleton width={200} height={28} radius={14} />
          <Skeleton width={96} height={28} radius={14} />
        </View>
        <Skeleton width={230} height={48} radius={12} />
        <Skeleton width={120} height={12} radius={6} />
        <Skeleton height={54} radius={27} />
        <Skeleton width={180} height={14} radius={7} />
      </View>
      <Band />
    </>
  )
}

/** "This week": label, then seven columns of weekday, date circle and hours. */
export function WeekSkeleton() {
  const t = useTheme()
  return (
    <>
      <View style={[styles.panel, { backgroundColor: t.surface }]}>
        <Skeleton width={96} height={11} radius={5} style={{ marginBottom: spacing.md }} />
        <View style={styles.week}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={styles.col}>
              <Skeleton width={10} height={10} radius={5} />
              <Skeleton width={38} height={38} radius={19} />
              <Skeleton width={24} height={9} radius={4} />
            </View>
          ))}
        </View>
      </View>
      <Band />
    </>
  )
}

/** The month's tiles, three to a row. */
export function TilesSkeleton({ count = 6 }: { count?: number }) {
  const t = useTheme()
  return (
    <>
      <View style={[styles.panel, { backgroundColor: t.surface, paddingHorizontal: gutter - 4 }]}>
        <Skeleton width={96} height={11} radius={5} style={{ marginBottom: spacing.md, marginLeft: 4 }} />
        <View style={styles.tiles}>
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={styles.tileSlot}>
              <Skeleton height={72} radius={radius.card} />
            </View>
          ))}
        </View>
      </View>
      <Band />
    </>
  )
}

/** Day rows: the date column, the timeline bar with its two times, and the hours. */
export function DayRowsSkeleton({ count = 5 }: { count?: number }) {
  const t = useTheme()
  const widths = ["58%", "44%", "66%", "51%", "39%"] as const
  return (
    <>
      <View style={{ backgroundColor: t.surface, paddingTop: spacing.sm }}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={styles.row}>
            <View style={{ width: 40, alignItems: "center", gap: 4 }}>
              <Skeleton width={24} height={20} radius={6} />
              <Skeleton width={28} height={9} radius={4} />
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <Skeleton width={widths[i % widths.length]} height={8} radius={4} />
              <Skeleton width="100%" height={10} radius={5} />
            </View>
            <Skeleton width={40} height={14} radius={7} />
          </View>
        ))}
      </View>
      <Band />
    </>
  )
}

const styles = StyleSheet.create({
  band: { height: 2 },
  hero: { paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: gutter, gap: spacing.md, alignItems: "center" },
  chips: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch" },
  panel: { paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: gutter },
  week: { flexDirection: "row" },
  col: { flex: 1, alignItems: "center", gap: 8 },
  tiles: { flexDirection: "row", flexWrap: "wrap" },
  tileSlot: { width: "33.333%", padding: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingVertical: 10 },
})
