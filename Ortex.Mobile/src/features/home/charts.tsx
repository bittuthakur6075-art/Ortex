import React from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { GestureDetector } from "react-native-gesture-handler"

import type { Delta } from "@/domain/dashboard"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"

import { ChartTooltip } from "@/features/home/interaction"
import { useEntrance, useFade, useMorph, useRedraw, useScrub } from "@/features/home/motion"

/**
 * The Home tab's charts: small, flat, and drawn with Views (columns, stacks, the
 * funnel). The chart forms chosen per dataset live in widgets.tsx; the motion
 * rules every one follows are in motion.ts.
 *
 * The rules they share (the dataviz method this app follows):
 *   · marks are thin: a column never fills its slot (at most 24dp), a bar is 8dp;
 *   · data ends are rounded 4dp and square at the baseline;
 *   · touching fills are separated by a 2dp gap of the SURFACE, never a stroke;
 *   · text is never drawn in a series colour: values and labels wear ink tokens,
 *     and identity rides on a swatch beside them;
 *   · a chart with two series always has a legend;
 *   · a phone has no hover, so the FINGER is the pointer: drag, hold-and-drag or
 *     tap raises a tooltip bubble over the point.
 */

// ---- delta ------------------------------------------------------------------

/**
 * "↑ 24%" against the previous period, as a tinted pill (Jobber, Shopify): the
 * change is read before the figure beside it, so it earns a shape, not just a
 * colour. The arrow carries direction for anyone who cannot tell the green from
 * the red, and the text is the AA `*Text` step on its own `*Bg` well. `points`
 * renders a percentage-point difference (win rate).
 *
 * It rises in a beat after the figure it qualifies, so the eye reads the number
 * first and the judgement second.
 */
export function DeltaText({
  delta,
  points,
  invert,
}: {
  delta: Delta
  points?: boolean
  /** Down is good (time to quote). */
  invert?: boolean
}) {
  const t = useTheme()
  const pop = useEntrance({ duration: 520, delay: 280 })
  const flat = delta.dir === "flat"
  const good = invert ? delta.dir === "down" : delta.dir === "up"
  const fg = flat ? t.textTertiary : good ? t.successText : t.dangerText
  const bg = flat ? t.mutedBg : good ? t.successBg : t.dangerBg
  const arrow = flat ? "" : delta.dir === "up" ? "↑ " : "↓ "
  const figure = flat
    ? points
      ? "0 pts"
      : "0%"
    : points
      ? `${Math.abs(Math.round(delta.diff))} pts`
      : delta.pct === null
        ? "New"
        : `${Math.abs(delta.pct)}%`
  return (
    <Animated.View
      style={[
        styles.pill,
        {
          backgroundColor: bg,
          opacity: pop,
          transform: [
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      <Text numberOfLines={1} style={[textVariants.captionStrong, { color: fg }]}>
        {arrow}
        {figure}
      </Text>
    </Animated.View>
  )
}

// ---- stacked columns ----------------------------------------------------------

export type ColumnBucket = { label: string; values: number[] }

/** One column: grows on first show, glides to a new height after, dims natively. */
function Column({
  values,
  colors,
  max,
  barArea,
  width,
  order,
  dim,
}: {
  values: number[]
  colors: string[]
  max: number
  barArea: number
  width: number
  order: number
  dim: boolean
}) {
  const total = values.reduce((s, v) => s + v, 0)
  const scale = useMorph(total / max, order)
  const opacity = useFade(!dim, 0.32)
  const live = values.map((v, k) => ({ v, k })).filter((s) => s.v > 0).reverse()
  return (
    <Animated.View style={{ width, opacity, transformOrigin: "bottom", transform: [{ scaleY: scale }] }}>
      {live.map((s, idx) => (
        <View
          key={s.k}
          style={{
            height: Math.max(2, (s.v / max) * barArea),
            backgroundColor: colors[s.k],
            borderTopLeftRadius: idx === 0 ? 4 : 0,
            borderTopRightRadius: idx === 0 ? 4 : 0,
            // The 2dp surface gap between stacked segments.
            marginBottom: idx < live.length - 1 ? 2 : 0,
          }}
        />
      ))}
    </Animated.View>
  )
}

export function StackedColumns({
  buckets,
  colors,
  names,
  height = 132,
  format = (n: number) => String(n),
  unit,
}: {
  buckets: ColumnBucket[]
  colors: string[]
  names: string[]
  height?: number
  format?: (n: number) => string
  /** What a column counts, for the readout: "leads", "sessions". */
  unit: string
}) {
  const t = useTheme()
  const [width, setWidth] = React.useState(0)

  const totals = buckets.map((b) => b.values.reduce((s, v) => s + v, 0))
  const max = Math.max(1, ...totals)
  const total = totals.reduce((s, v) => s + v, 0)
  const slot = buckets.length ? width / buckets.length : 0
  const columnW = Math.max(4, Math.min(24, slot - 6))
  const barArea = height - 18

  const scrub = useScrub<number>({
    resolve: (p) => (slot ? Math.max(0, Math.min(buckets.length - 1, Math.floor(p.x / slot))) : null),
  })
  const sel = scrub.active && scrub.active.key < buckets.length ? scrub.active.key : null

  const tip = sel ?? 0
  const tipTotal = totals[tip] ?? 0
  const tipTop = height - Math.max(2, (tipTotal / max) * barArea)

  return (
    <View>
      <View style={styles.readout}>
        <Text style={[textVariants.bodyStrong, { color: t.text }]} numberOfLines={1}>
          {format(total)} {unit}
        </Text>
        <Text style={[textVariants.caption, { color: t.textTertiary }]} numberOfLines={1}>
          Touch and drag across the columns
        </Text>
      </View>

      <View>
        <GestureDetector gesture={scrub.gesture}>
          <View
            style={[styles.plot, { height, borderBottomColor: t.border }]}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            accessible
            accessibilityLabel={`${format(total)} ${unit}. ${buckets.map((b, i) => `${b.label}: ${totals[i]}`).join(", ")}`}
          >
            {/* One recessive gridline at the top, labelled with the scale's max. */}
            <View style={[styles.gridTop, { borderTopColor: t.divider }]}>
              <Text style={[textVariants.microLabel, { color: t.textTertiary }]}>{format(max)}</Text>
            </View>
            {width > 0 &&
              buckets.map((b, i) => (
                // Keyed by POSITION, so a range switch morphs column i into the
                // new column i instead of unmounting the chart and regrowing it.
                <View key={i} style={[styles.slot, { width: slot }]}>
                  <Column
                    values={b.values}
                    colors={colors}
                    max={max}
                    barArea={barArea}
                    width={columnW}
                    order={i}
                    dim={sel !== null && sel !== i}
                  />
                </View>
              ))}
          </View>
        </GestureDetector>

        {width > 0 && buckets.length > 0 && (
          <ChartTooltip
            visible={sel !== null}
            fresh={!!scrub.active?.fresh}
            x={slot * tip + slot / 2}
            y={tipTop}
            bounds={width}
            title={buckets[tip].label}
            rows={
              names.length > 1
                ? buckets[tip].values.map((v, k) => ({ color: colors[k], label: names[k], value: format(v) }))
                : [{ color: colors[0], label: names[0], value: format(buckets[tip].values[0] ?? 0) }]
            }
            footer={names.length > 1 ? `${format(tipTotal)} ${unit} in total` : undefined}
          />
        )}
      </View>

      <View style={styles.axis}>
        <Text style={[textVariants.microLabel, { color: t.textTertiary }]}>{buckets[0]?.label.split(" – ")[0]}</Text>
        <Text style={[textVariants.microLabel, { color: t.textTertiary }]}>
          {buckets[buckets.length - 1]?.label.split(" – ").pop()}
        </Text>
      </View>

      {names.length > 1 && (
        <View style={styles.legend}>
          {names.map((n, i) => (
            <Swatch key={n} color={colors[i]} label={n} />
          ))}
        </View>
      )}
    </View>
  )
}

export function Swatch({ color, label, value }: { color: string; label: string; value?: string }) {
  const t = useTheme()
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[textVariants.caption, { color: t.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? <Text style={[textVariants.captionStrong, { color: t.text, marginLeft: 6 }]}>{value}</Text> : null}
    </View>
  )
}

// ---- one stacked horizontal bar, with its legend ------------------------------

export type Segment = { key: string; value: number; color: string; label: string; count: number; display: string }

function StackPiece({ seg, flex, lit, first, lastPiece }: { seg: Segment; flex: number; lit: string | null; first: boolean; lastPiece: boolean }) {
  const opacity = useFade(!lit || lit === seg.key, 0.22)
  return (
    <Animated.View
      style={{
        flex,
        opacity,
        backgroundColor: seg.color,
        marginRight: lastPiece ? 0 : 2,
        borderTopLeftRadius: first ? 4 : 0,
        borderBottomLeftRadius: first ? 4 : 0,
        borderTopRightRadius: lastPiece ? 4 : 0,
        borderBottomRightRadius: lastPiece ? 4 : 0,
      }}
    />
  )
}

function LegendRow({ s, active, dimmed, unit, onPress }: { s: Segment; active: boolean; dimmed: boolean; unit: string; onPress: () => void }) {
  const t = useTheme()
  const opacity = useFade(!dimmed, 0.45)
  const wash = useFade(active, 0)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${s.label}, ${s.count} ${unit}${s.count === 1 ? "" : "s"}, ${s.display}`}
      style={styles.legendRow}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.legendWash, { backgroundColor: t.surfaceInset, opacity: wash }]} />
      <Animated.View style={[styles.legendInner, { opacity }]}>
        <Swatch color={s.color} label={s.label} />
        <Text style={[textVariants.caption, styles.legendCount, { color: t.textTertiary }]}>
          {s.count} {unit}
          {s.count === 1 ? "" : "s"}
        </Text>
        <Text style={[textVariants.smallStrong, styles.legendValue, { color: t.text }]}>{s.display}</Text>
      </Animated.View>
    </Pressable>
  )
}

/**
 * A part-to-whole bar that can be read three ways: drag along it for a bubble
 * per segment, tap a legend row to light that segment and dim the rest, or just
 * read the legend. The bar grows out from the left on first show and cross-fades
 * when its proportions change.
 */
export function StackBar({ segments, unit = "quote" }: { segments: Segment[]; unit?: string }) {
  const [width, setWidth] = React.useState(0)
  const [focus, setFocus] = React.useState<string | null>(null)
  const total = segments.reduce((s, x) => s + x.value, 0)
  const live = segments.filter((s) => s.value > 0)
  const grow = useMorph(total ? 1 : 0)
  const redraw = useRedraw(live.map((s) => `${s.key}=${s.value}`).join("|"))

  // Segment boundaries in dp, gaps included, for resolving a finger to a segment.
  const usable = Math.max(0, width - 2 * Math.max(0, live.length - 1))
  const edges = live.reduce<number[]>((acc, s, i) => {
    const start = i ? acc[acc.length - 1] + 2 : 0
    acc.push(start + (s.value / Math.max(1, total)) * usable)
    return acc
  }, [])
  const scrub = useScrub<number>({
    resolve: (p) => {
      if (!width) return null
      const i = edges.findIndex((e) => p.x <= e)
      return i === -1 ? live.length - 1 : i
    },
  })
  const hit = scrub.active?.key ?? null
  const lit = hit !== null ? (live[hit]?.key ?? null) : focus

  if (!total) return null
  const tip = hit ?? 0
  const tipStart = tip ? edges[tip - 1] + 2 : 0
  const tipSeg = live[tip]

  return (
    <View>
      <View>
        <GestureDetector gesture={scrub.gesture}>
          <View style={styles.stackHit} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <Animated.View style={[styles.stack, { opacity: redraw, transformOrigin: "left", transform: [{ scaleX: grow }] }]}>
              {live.map((s, i) => (
                <StackPiece key={s.key} seg={s} flex={s.value / total} lit={lit} first={i === 0} lastPiece={i === live.length - 1} />
              ))}
            </Animated.View>
          </View>
        </GestureDetector>
        {width > 0 && tipSeg && (
          <ChartTooltip
            visible={hit !== null}
            fresh={!!scrub.active?.fresh}
            x={tipStart + (edges[tip] - tipStart) / 2}
            y={14}
            bounds={width}
            title={tipSeg.label}
            rows={[{ color: tipSeg.color, label: `${tipSeg.count} ${unit}${tipSeg.count === 1 ? "" : "s"}`, value: tipSeg.display }]}
            footer={`${Math.round((tipSeg.value / total) * 100)}% of the total`}
          />
        )}
      </View>

      <View style={styles.legendList}>
        {segments.map((s) => (
          <LegendRow
            key={s.key}
            s={s}
            unit={unit}
            active={focus === s.key}
            dimmed={!!focus && focus !== s.key}
            onPress={() => {
              feedback.select()
              setFocus(focus === s.key ? null : s.key)
            }}
          />
        ))}
      </View>
    </View>
  )
}

// ---- funnel -----------------------------------------------------------------

function FunnelBar({ fraction, order, color, opacity }: { fraction: number; order: number; color: string; opacity: number }) {
  const scale = useMorph(fraction, order * 2)
  return (
    <Animated.View
      style={[
        styles.funnelBar,
        {
          width: `${Math.max(3, fraction * 100)}%`,
          backgroundColor: color,
          opacity,
          transformOrigin: "left",
          transform: [{ scaleX: scale }],
        },
      ]}
    />
  )
}

/**
 * Stages as bars that narrow with the count, with the step conversion between
 * each pair in words: the conversion is the insight, the bar only shows it at a
 * glance. Stages fill in top to bottom, the order a lead travels.
 */
export function Funnel({ stages, color }: { stages: { stage: string; count: number; display?: string }[]; color: string }) {
  const t = useTheme()
  const max = Math.max(1, ...stages.map((s) => s.count))
  return (
    <View>
      {stages.map((s, i) => {
        const prev = stages[i - 1]
        const conv = prev && prev.count ? Math.round((s.count / prev.count) * 100) : null
        return (
          <View key={s.stage}>
            {i > 0 && (
              <Text style={[textVariants.caption, styles.funnelStep, { color: t.textTertiary }]}>
                {conv === null ? "No earlier stage to compare" : `${conv}% of ${prev.stage.toLowerCase()}`}
              </Text>
            )}
            <View style={styles.funnelRow}>
              <Text style={[textVariants.smallStrong, styles.funnelLabel, { color: t.textSecondary }]} numberOfLines={1}>
                {s.stage}
              </Text>
              <View style={styles.funnelTrack}>
                <FunnelBar fraction={s.count / max} order={i} color={color} opacity={1 - i * 0.15} />
              </View>
              <Text style={[textVariants.smallStrong, styles.funnelValue, { color: t.text }]}>{s.display ?? s.count}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  readout: { marginBottom: spacing.sm, minHeight: 40 },
  plot: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
  },
  gridTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    borderTopWidth: 1,
    alignItems: "flex-end",
  },
  slot: { height: "100%", alignItems: "center", justifyContent: "flex-end" },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  swatchRow: { flexDirection: "row", alignItems: "center" },
  swatch: { width: 10, height: 10, borderRadius: 3, marginRight: 6 },
  // A taller touch band than the 12dp bar, so the bar is easy to land on.
  stackHit: { paddingVertical: 10, marginVertical: -10 },
  stack: { flexDirection: "row", height: 12 },
  legendList: { marginTop: spacing.md, marginHorizontal: -8 },
  legendRow: { minHeight: 36, justifyContent: "center" },
  legendWash: { borderRadius: 8 },
  legendInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  legendCount: { marginLeft: "auto" },
  legendValue: { width: 72, textAlign: "right" },
  funnelRow: { flexDirection: "row", alignItems: "center" },
  funnelLabel: { width: 72 },
  funnelTrack: { flex: 1, height: 28, justifyContent: "center" },
  funnelBar: { height: 28, borderRadius: 6 },
  funnelValue: { width: 56, textAlign: "right" },
  funnelStep: { marginLeft: 72, marginVertical: 4 },
})
