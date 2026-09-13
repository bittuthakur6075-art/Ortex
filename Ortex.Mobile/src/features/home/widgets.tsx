import React from "react"
import { Animated, StyleSheet, Text, View } from "react-native"
import { GestureDetector } from "react-native-gesture-handler"
import Svg, { Circle, Line, Path } from "react-native-svg"

import { SPEED_STEPS, type Heatmap } from "@/domain/dashboard"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"

import { ChartTooltip } from "@/features/home/interaction"
import {
  EASE,
  staggered,
  useEntrance,
  useFade,
  useFollow,
  useMorph,
  useReducedMotion,
  useRedraw,
  useScrub,
} from "@/features/home/motion"

/**
 * One chart form per job the data does: the form is chosen by what the reader
 * must do with the numbers, never by what looks busiest. The audit that picked
 * each one (dataviz form rules + the Mobbin references, 2026-09-13):
 *
 *   PaceChart    "am I ahead of last period?"  A running total against a grey
 *                ghost of the previous window on the same day index. EMPHASIS
 *                form: this period in the accent, the last one as grey context.
 *   Ring         one ratio out of a whole (win rate). A meter, not a pie.
 *   SpeedScale   a duration judged against thresholds (time to quote). Only the
 *                step it falls in is lit, in the status hue that step MEANS.
 *   MiniColumns  a stat tile's trend: the latest bucket in the accent.
 *   RankedBars   ranked magnitudes with long names, with rank, share of total,
 *                and optionally the converted part filled inside the same bar.
 *   HeatGrid     a weekday by time-of-day pattern. SEQUENTIAL: one hue, more is
 *                darker; the peak is labelled.
 *   SplitMeter   a two-part share, where a pie would be the anti-pattern.
 *
 * FLAT: no shadows, no glows, no gradients on any mark. Depth is the surface
 * and the ink, as everywhere else in the app.
 *
 * Motion follows motion.ts: native-driven, grows once, morphs after, and what
 * tracks a finger springs between data points instead of re-rendering the chart.
 */

// ---- pace -------------------------------------------------------------------------

export function PaceChart({
  current,
  previous,
  labels,
  format,
  color,
  height = 132,
  names = ["This period", "Previous period"],
}: {
  current: number[]
  previous: number[]
  labels: string[]
  format: (n: number) => string
  color: string
  height?: number
  names?: [string, string]
}) {
  const t = useTheme()
  const ghost = t.textHint
  const [width, setWidth] = React.useState(0)

  const n = Math.max(current.length, previous.length)
  const max = Math.max(1, ...current, ...previous)
  const padTop = 8
  const plotH = height - padTop
  const x = (i: number) => (n <= 1 ? width / 2 : (i * width) / (n - 1))
  const y = (v: number) => padTop + (1 - v / max) * (plotH - 2)
  const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")

  const scrub = useScrub<number>({
    resolve: (p) => (width && n > 1 ? Math.max(0, Math.min(n - 1, Math.round((p.x / width) * (n - 1)))) : null),
  })
  const at = scrub.active?.key ?? null
  const fresh = !!scrub.active?.fresh
  const last = n - 1
  const endCur = current[last] ?? 0
  const endPrev = previous[last] ?? 0

  // First show: the line is uncovered left to right by a surface-coloured sheet
  // sliding off, a native transform. After that a range switch re-draws the
  // paths, and the plot eases back from 35% so the new shape settles in.
  const reveal = useEntrance({ duration: 900 })
  const redraw = useRedraw(`${n}:${max}:${endCur}`)

  const gap = (a: number, b: number) =>
    a === b ? "Level with last period" : `${format(Math.abs(a - b))} ${a > b ? "ahead of" : "behind"} last period`

  const tipIndex = at ?? last
  const tipCur = current[tipIndex] ?? 0
  const tipPrev = previous[tipIndex] ?? 0

  // The crosshair and both dots are native views that SPRING to the scrubbed
  // day. The SVG underneath never re-renders while the chart is being read.
  const cx = useFollow(width ? x(tipIndex) : 0, fresh)
  const cy = useFollow(width ? y(tipCur) : 0, fresh)
  const py = useFollow(width ? y(tipPrev) : 0, fresh)
  const scrubbing = useFade(at !== null, 0)

  return (
    <View>
      <View style={styles.readout}>
        <Text style={[textVariants.caption, { color: t.textTertiary }]} numberOfLines={1}>
          By today · touch and drag the chart for any day
        </Text>
        <Text style={[textVariants.bodyStrong, { color: t.text }]} numberOfLines={1}>
          {format(endCur)}
          <Text style={[textVariants.small, { color: t.textTertiary }]}>
            {"  "}
            {endCur || endPrev ? gap(endCur, endPrev).toLowerCase() : "nothing quoted yet"}
          </Text>
        </Text>
      </View>

      <View>
        <GestureDetector gesture={scrub.gesture}>
          <View
            style={[styles.plot, { height }]}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            accessible
            accessibilityLabel={`${names[0]}: ${format(endCur)}. ${names[1]} at the same point: ${format(endPrev)}.`}
          >
            {width > 0 && n > 0 && (
              <Animated.View style={{ opacity: redraw }}>
                <Svg width={width} height={height}>
                  <Line x1={0} x2={width} y1={padTop} y2={padTop} stroke={t.divider} strokeWidth={1} />
                  <Line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={t.border} strokeWidth={1} />
                  {previous.length > 0 && (
                    <Path d={path(previous)} stroke={ghost} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  )}
                  {current.length > 0 && (
                    <>
                      <Path
                        d={`${path(current)} L${x(current.length - 1).toFixed(1)},${height} L0,${height} Z`}
                        fill={color}
                        opacity={0.08}
                      />
                      <Path d={path(current)} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                    </>
                  )}
                  <Circle cx={x(last)} cy={y(endCur)} r={4.5} fill={color} stroke={t.surface} strokeWidth={2} />
                </Svg>
              </Animated.View>
            )}

            {width > 0 && (
              <>
                {/* Scrub marks: a hairline and two dots, gliding natively. */}
                <Animated.View
                  pointerEvents="none"
                  style={[styles.crosshair, { height: height - padTop, top: padTop, backgroundColor: t.borderStrong, opacity: scrubbing, transform: [{ translateX: cx }] }]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.dot,
                    styles.dotSmall,
                    { backgroundColor: ghost, borderColor: t.surface, opacity: scrubbing, transform: [{ translateX: cx }, { translateY: py }] },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.dot,
                    { backgroundColor: color, borderColor: t.surface, opacity: scrubbing, transform: [{ translateX: cx }, { translateY: cy }] },
                  ]}
                />
              </>
            )}

            {width > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: t.surface,
                    transform: [{ translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width + 12] }) }],
                  },
                ]}
              />
            )}
            <Text style={[textVariants.microLabel, styles.maxLabel, { color: t.textTertiary }]}>{format(max)}</Text>
          </View>
        </GestureDetector>

        {width > 0 && (
          <ChartTooltip
            visible={at !== null}
            fresh={fresh}
            x={x(tipIndex)}
            y={Math.min(y(tipCur), y(tipPrev))}
            bounds={width}
            title={labels[tipIndex] ?? ""}
            rows={[
              { color, label: names[0], value: format(tipCur), line: true },
              { color: ghost, label: names[1], value: format(tipPrev), line: true },
            ]}
            footer={gap(tipCur, tipPrev)}
          />
        )}
      </View>

      <View style={styles.axis}>
        <Text style={[textVariants.microLabel, { color: t.textTertiary }]}>{labels[0]}</Text>
        <Text style={[textVariants.microLabel, { color: t.textTertiary }]}>{labels[labels.length - 1]}</Text>
      </View>

      <View style={styles.legend}>
        <LineKey color={color} label={names[0]} />
        <LineKey color={ghost} label={names[1]} thin />
      </View>
    </View>
  )
}

function LineKey({ color, label, thin }: { color: string; label: string; thin?: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.keyRow}>
      <View style={[styles.lineKey, { backgroundColor: color, height: thin ? 1.5 : 2 }]} />
      <Text style={[textVariants.caption, { color: t.textSecondary }]}>{label}</Text>
    </View>
  )
}

// ---- ring -------------------------------------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Fills its arc from empty on first show, and eases from the old value to a new one. */
export function Ring({ pct, color, size = 46, stroke = 6 }: { pct: number | null; color: string; size?: number; stroke?: number }) {
  const t = useTheme()
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const filled = pct === null ? 0 : Math.max(0, Math.min(100, pct)) / 100
  const fill = React.useRef(new Animated.Value(reduce ? filled : 0)).current

  React.useEffect(() => {
    if (reduce) {
      fill.setValue(filled)
      return
    }
    // SVG props cannot ride the native driver; one short JS-driven arc is cheap.
    Animated.timing(fill, { toValue: filled, duration: 900, delay: 120, easing: EASE, useNativeDriver: false }).start()
  }, [filled, reduce, fill])

  return (
    <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surfaceTrack} strokeWidth={stroke} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={fill.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
        opacity={pct ? 1 : 0}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  )
}

// ---- speed scale ------------------------------------------------------------------

const SPEED_LABELS = ["<1h", "<4h", "<1d", "1d+"]

function SpeedSegment({ on, color, order }: { on: boolean; color: string; order: number }) {
  const t = useTheme()
  const lit = useFade(on, 0)
  const enter = useEntrance({ duration: 520, delay: 200 + order * 40 })
  return (
    <View style={[styles.speedSeg, { backgroundColor: t.surfaceTrack }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.speedFill,
          { backgroundColor: color, opacity: Animated.multiply(lit, enter), transformOrigin: "left", transform: [{ scaleX: enter }] },
        ]}
      />
    </View>
  )
}

export function SpeedScale({ step }: { step: number }) {
  const t = useTheme()
  const fills = [t.success, t.success, t.warning, t.danger]
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.speedTrack}>
        {SPEED_STEPS.map((s, i) => (
          <SpeedSegment key={s.label} on={i === step} color={fills[i]} order={i} />
        ))}
      </View>
      <View style={styles.speedLabels}>
        {SPEED_LABELS.map((l, i) => (
          <Text key={l} style={[textVariants.microLabel, styles.speedLabel, { color: i === step ? t.text : t.textTertiary }]}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  )
}

// ---- mini columns -------------------------------------------------------------------

function MiniCol({ v, max, height, color, order }: { v: number; max: number; height: number; color: string; order: number }) {
  const scale = useMorph(v / max, order)
  return (
    <View style={styles.miniSlot}>
      <Animated.View
        style={{
          height: Math.max(3, (v / max) * height),
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          backgroundColor: color,
          transformOrigin: "bottom",
          transform: [{ scaleY: scale }],
        }}
      />
    </View>
  )
}

export function MiniColumns({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) {
  const t = useTheme()
  const max = Math.max(1, ...values)
  return (
    <View style={[styles.mini, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) =>
        v ? (
          <MiniCol key={i} v={v} max={max} height={height} order={i} color={i === values.length - 1 ? color : t.primary20} />
        ) : (
          <View key={i} style={styles.miniSlot}>
            <View style={[styles.miniEmpty, { backgroundColor: t.surfaceTrack }]} />
          </View>
        ),
      )}
    </View>
  )
}

// ---- ranked bars ------------------------------------------------------------------

export type RankedRow = {
  key: string
  label: string
  value: number
  display: string
  /** The converted part of `value`, drawn inside the same bar. */
  part?: number
  sub?: string
}

function RankBar({ fraction, partFraction, color, trackFill, order }: { fraction: number; partFraction?: number; color: string; trackFill: string; order: number }) {
  const scale = useMorph(fraction, order * 2)
  return (
    <Animated.View
      style={[
        styles.bar,
        {
          width: `${Math.max(2, fraction * 100)}%`,
          backgroundColor: partFraction !== undefined ? trackFill : color,
          transformOrigin: "left",
          transform: [{ scaleX: scale }],
        },
      ]}
    >
      {partFraction !== undefined && partFraction > 0 && (
        <View style={[styles.bar, { width: `${Math.min(100, partFraction * 100)}%`, backgroundColor: color }]} />
      )}
    </Animated.View>
  )
}

export function RankedBars({
  rows,
  color,
  total,
  partLabel,
  wholeLabel,
}: {
  rows: RankedRow[]
  color: string
  /** Base for the share-of-total figure; omit to hide it. */
  total?: number
  /** Legend names when rows carry a `part`: "Won" inside "Quoted". */
  partLabel?: string
  wholeLabel?: string
}) {
  const t = useTheme()
  const max = Math.max(1, ...rows.map((r) => r.value))
  const hasPart = rows.some((r) => r.part !== undefined)
  return (
    <View>
      {hasPart && partLabel && wholeLabel && (
        <View style={[styles.legend, { marginTop: 0, marginBottom: spacing.md }]}>
          <Key color={color} label={partLabel} />
          <Key color={t.primary20} label={wholeLabel} />
        </View>
      )}
      <View style={{ gap: spacing.md }}>
        {rows.map((r, i) => {
          const share = total ? Math.round((r.value / total) * 100) : null
          return (
            <View
              key={r.key}
              style={styles.rankRow}
              accessible
              accessibilityLabel={`${i + 1}. ${r.label}, ${r.display}${share !== null ? `, ${share}% of total` : ""}${r.sub ? `, ${r.sub}` : ""}`}
            >
              <Text style={[textVariants.smallStrong, styles.rank, { color: t.textTertiary }]}>{i + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rankHead}>
                  <Text style={[textVariants.smallStrong, styles.rankLabel, { color: t.text }]} numberOfLines={1}>
                    {r.label}
                  </Text>
                  <Text style={[textVariants.smallStrong, { color: t.text }]}>{r.display}</Text>
                  {share !== null && <Text style={[textVariants.caption, styles.share, { color: t.textTertiary }]}>{share}%</Text>}
                </View>
                <View style={[styles.track, { backgroundColor: t.surfaceTrack }]}>
                  <RankBar
                    fraction={r.value / max}
                    partFraction={hasPart ? (r.part || 0) / Math.max(1, r.value) : undefined}
                    color={color}
                    trackFill={t.primary20}
                    order={i}
                  />
                </View>
                {r.sub ? (
                  <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 4 }]} numberOfLines={1}>
                    {r.sub}
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function Key({ color, label }: { color: string; label: string }) {
  const t = useTheme()
  return (
    <View style={styles.keyRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[textVariants.caption, { color: t.textSecondary }]}>{label}</Text>
    </View>
  )
}

// ---- heat grid --------------------------------------------------------------------

const HEAT_STEPS = [0.2, 0.42, 0.68, 1]
const HEAT_DAY_W = 32
const HEAT_ROW_H = 31

function HeatCell({
  n,
  lv,
  color,
  selected,
  isPeak,
  appear,
  label,
}: {
  n: number
  lv: number
  color: string
  selected: boolean
  isPeak: boolean
  appear: Animated.AnimatedInterpolation<number>
  label: string
}) {
  const t = useTheme()
  const ring = useFade(selected, 0)
  const lift = useFollow(selected ? 1.08 : 1, false)
  return (
    <Animated.View accessible accessibilityLabel={label} style={[styles.heatCell, { opacity: appear, transform: [{ scale: lift }] }]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.heatFill,
          { backgroundColor: lv < 0 ? t.surfaceTrack : color, opacity: lv < 0 ? 1 : HEAT_STEPS[lv] },
        ]}
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heatRing, { borderColor: t.text, opacity: ring }]} />
      {isPeak ? <Text style={[textVariants.microLabel, { color: t.textOnPrimary }]}>{n}</Text> : null}
    </Animated.View>
  )
}

export function HeatGrid({ data, color, unit = "leads" }: { data: Heatmap; color: string; unit?: string }) {
  const t = useTheme()
  const [width, setWidth] = React.useState(0)
  const level = (n: number) => (n <= 0 ? -1 : Math.min(3, Math.ceil((n / Math.max(1, data.max)) * 4) - 1))
  const cols = data.bands.length
  const colW = width ? (width - HEAT_DAY_W) / cols : 0

  const scrub = useScrub<[number, number]>({
    resolve: (p) => {
      if (!colW) return null
      const c = Math.floor((p.x - HEAT_DAY_W) / colW)
      const r = Math.floor(p.y / HEAT_ROW_H)
      if (c < 0 || c >= cols || r < 0 || r >= data.days.length) return null
      return [r, c]
    },
  })
  const sel = scrub.active?.key ?? null

  // Cells settle in on a diagonal wave from Monday morning.
  const wave = useEntrance({ duration: 820 })

  const tipCell = sel ?? [0, 0]
  const tipCount = data.cells[tipCell[0]][tipCell[1]]

  return (
    <View>
      <Text style={[textVariants.bodyStrong, { color: t.text }]}>
        {data.peak ? `Busiest: ${data.peak.day} ${data.peak.band}` : `No ${unit} in the last 90 days`}
      </Text>
      <Text style={[textVariants.caption, { color: t.textTertiary, marginBottom: spacing.sm }]}>
        Touch and hold, then slide across the grid
      </Text>
      <View style={styles.heatHead}>
        <View style={{ width: HEAT_DAY_W }} />
        {data.bands.map((b) => (
          <Text key={b} style={[textVariants.microLabel, styles.heatBand, { color: t.textTertiary }]}>
            {b}
          </Text>
        ))}
      </View>

      <View>
        <GestureDetector gesture={scrub.gesture}>
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {data.cells.map((row, di) => (
              <View key={data.days[di]} style={styles.heatRow}>
                <Text style={[textVariants.microLabel, { width: HEAT_DAY_W, color: sel?.[0] === di ? t.text : t.textTertiary }]}>
                  {data.days[di]}
                </Text>
                {row.map((n, bi) => (
                  <HeatCell
                    key={bi}
                    n={n}
                    lv={level(n)}
                    color={color}
                    selected={!!sel && sel[0] === di && sel[1] === bi}
                    isPeak={n === data.max && n > 0}
                    appear={staggered(wave, di + bi, data.days.length + cols - 1, 0.5)}
                    label={`${data.days[di]} ${data.bands[bi]}, ${n} ${unit}`}
                  />
                ))}
              </View>
            ))}
          </View>
        </GestureDetector>

        {colW > 0 && (
          <ChartTooltip
            visible={sel !== null}
            fresh={!!scrub.active?.fresh}
            x={HEAT_DAY_W + colW * tipCell[1] + colW / 2}
            y={HEAT_ROW_H * tipCell[0]}
            bounds={width}
            title={`${data.days[tipCell[0]]} · ${data.bands[tipCell[1]]}`}
            rows={[{ color, label: unit[0].toUpperCase() + unit.slice(1), value: String(tipCount) }]}
            footer={data.total ? `${Math.round((tipCount / data.total) * 100)}% of all ${unit}` : undefined}
          />
        )}
      </View>

      <View style={[styles.keyRow, { marginTop: spacing.sm, alignSelf: "flex-end" }]}>
        <Text style={[textVariants.microLabel, { color: t.textTertiary, marginRight: 6 }]}>Fewer</Text>
        {HEAT_STEPS.map((o) => (
          <View key={o} style={[styles.heatKey, { backgroundColor: color, opacity: o }]} />
        ))}
        <Text style={[textVariants.microLabel, { color: t.textTertiary, marginLeft: 6 }]}>More</Text>
      </View>
    </View>
  )
}

// ---- split meter ------------------------------------------------------------------

export function SplitMeter({
  parts,
}: {
  parts: [{ label: string; value: number; color: string }, { label: string; value: number; color: string }]
}) {
  const t = useTheme()
  const total = parts[0].value + parts[1].value
  const grow = useMorph(total ? 1 : 0)
  const redraw = useRedraw(parts[0].value)
  if (!total) return null
  const pct = (v: number) => Math.round((v / total) * 100)
  return (
    <View accessible accessibilityLabel={parts.map((p) => `${p.label} ${pct(p.value)}%`).join(", ")}>
      <Animated.View style={[styles.split, { opacity: redraw, transformOrigin: "left", transform: [{ scaleX: grow }] }]}>
        {parts
          .filter((p) => p.value > 0)
          .map((p, i, arr) => (
            <View
              key={p.label}
              style={{
                flex: p.value,
                backgroundColor: p.color,
                marginRight: i < arr.length - 1 ? 2 : 0,
                borderTopLeftRadius: i === 0 ? 5 : 0,
                borderBottomLeftRadius: i === 0 ? 5 : 0,
                borderTopRightRadius: i === arr.length - 1 ? 5 : 0,
                borderBottomRightRadius: i === arr.length - 1 ? 5 : 0,
              }}
            />
          ))}
      </Animated.View>
      <View style={styles.splitLabels}>
        {parts.map((p) => (
          <View key={p.label} style={styles.keyRow}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Text style={[textVariants.caption, { color: t.textSecondary }]}>{p.label}</Text>
            <Text style={[textVariants.captionStrong, { color: t.text, marginLeft: 6 }]}>{pct(p.value)}%</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  readout: { marginBottom: spacing.sm },
  plot: { overflow: "hidden" },
  maxLabel: { position: "absolute", right: 0, top: -4 },
  crosshair: { position: "absolute", left: 0, width: 1 },
  // Dots are drawn centred on their translate, so their origin sits at -radius.
  dot: { position: "absolute", left: -5.5, top: -5.5, width: 11, height: 11, borderRadius: 5.5, borderWidth: 2 },
  dotSmall: { left: -4, top: -4, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  keyRow: { flexDirection: "row", alignItems: "center" },
  lineKey: { width: 16, borderRadius: 1, marginRight: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3, marginRight: 6 },
  speedTrack: { flexDirection: "row", gap: 2, height: 6 },
  speedSeg: { flex: 1, borderRadius: 3, overflow: "hidden" },
  speedFill: { borderRadius: 3 },
  speedLabels: { flexDirection: "row", marginTop: 3 },
  speedLabel: { flex: 1, textAlign: "center" },
  mini: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  miniSlot: { flex: 1, justifyContent: "flex-end" },
  miniEmpty: { height: 2, borderRadius: 1 },
  rankRow: { flexDirection: "row" },
  rank: { width: 22 },
  rankHead: { flexDirection: "row", alignItems: "baseline", marginBottom: 6 },
  rankLabel: { flex: 1, marginRight: spacing.sm },
  share: { width: 36, textAlign: "right" },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  bar: { height: 8, borderRadius: 4, overflow: "hidden" },
  heatHead: { flexDirection: "row", marginBottom: 4 },
  heatRow: { flexDirection: "row", alignItems: "center", height: HEAT_ROW_H },
  heatBand: { flex: 1, textAlign: "center" },
  heatCell: {
    flex: 1,
    height: 28,
    marginHorizontal: 1.5,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  heatFill: { borderRadius: 6 },
  heatRing: { borderRadius: 6, borderWidth: 1.5 },
  heatKey: { width: 12, height: 12, borderRadius: 3, marginHorizontal: 1 },
  split: { flexDirection: "row", height: 10 },
  splitLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
})
