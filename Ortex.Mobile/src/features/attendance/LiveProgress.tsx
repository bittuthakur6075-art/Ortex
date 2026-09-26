import { useIsFocused } from "@react-navigation/native"
import React from "react"
import { Animated, Easing, StyleSheet, Text, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { clockIST } from "@/domain/attendance"
import { hms, type Timeline, type WeekColumn } from "@/features/attendance/progress"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { useReducedMotion } from "@/ui/motion"

/**
 * The live attendance progress display (Zoho People's check-in screen is the
 * reference): a ring of the shift done, a live timer inside it, the day as a
 * timeline bar, and (full size) the week as columns.
 *
 * Smoothness, in a codebase with no Reanimated:
 *   · the TIMER is its own component with its own 1 s interval, running only
 *     while the screen is focused AND the person is on duty, so the ring, the
 *     bar and the page around them never re-render once a second;
 *   · the ring's arc moves on Animated (JS driver: SVG props cannot use the
 *     native one), only when the parent's 30 s tick or new data changes it;
 *   · under reduced motion the arc jumps instead of sweeping, and the numbers
 *     still update.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** 3:42, hours unpadded, for the small ring. */
const shortHm = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`
}

/** HH:MM:SS that ticks itself. `baseMs` is the time worked at `baseAt`. */
export function LiveTimer({
  baseMs,
  baseAt,
  running,
  style,
  short = false,
}: {
  baseMs: number
  baseAt: number
  running: boolean
  style: object
  /** "3:42" instead of "03:42:18": the small ring on the Home card has room for H:MM only. */
  short?: boolean
}) {
  const focused = useIsFocused()
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!running || !focused) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running, focused])
  const ms = running ? baseMs + Math.max(0, now - baseAt) : baseMs
  return (
    <Text style={style} accessibilityLabel={`Worked ${short ? shortHm(ms) : hms(ms)}`}>
      {hms(ms)}
    </Text>
  )
}

export function ProgressRing({
  workedMs,
  computedAt,
  running,
  shiftMin,
  size = 200,
  stroke = 14,
  compact = false,
  color,
  caption,
  short = false,
  face,
}: {
  workedMs: number
  computedAt: number
  running: boolean
  shiftMin: number
  size?: number
  stroke?: number
  compact?: boolean
  /** The arc's colour, when the state decides it (the Home card). */
  color?: string
  /** A line under the timer in the compact ring: "of 9 h". */
  caption?: string
  /** H:MM in the ring, for the small Home ring. */
  short?: boolean
  /** Drawn in the ring instead of the timer: the collapsed Home row's clock glyph. */
  face?: React.ReactNode
}) {
  const t = useTheme()
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const fraction = shiftMin > 0 ? workedMs / 60000 / shiftMin : 0
  const done = Math.min(1, fraction)
  const over = Math.min(1, Math.max(0, fraction - 1))
  const complete = fraction >= 1

  const progress = React.useRef(new Animated.Value(0)).current
  const overtime = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    if (reduce) {
      progress.setValue(done)
      overtime.setValue(over)
      return
    }
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(progress, { toValue: done, duration: 700, easing, useNativeDriver: false }),
      Animated.timing(overtime, { toValue: over, duration: 700, easing, useNativeDriver: false }),
    ]).start()
  }, [done, over, reduce, progress, overtime])

  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })
  const innerR = r - stroke / 2 - 5
  const innerC = 2 * Math.PI * innerR
  const overOffset = overtime.interpolate({ inputRange: [0, 1], outputRange: [innerC, 0] })
  const c = size / 2

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(done * 100) }}
    >
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={t.fieldBg} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={c}
          cy={c}
          r={r}
          stroke={color ?? (complete ? t.success : t.primary)}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${c} ${c})`}
        />
        {over > 0 && (
          <AnimatedCircle
            cx={c}
            cy={c}
            r={innerR}
            stroke={t.warning}
            strokeWidth={Math.max(3, stroke / 3)}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${innerC} ${innerC}`}
            strokeDashoffset={overOffset}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {face ?? (
          <>
            <LiveTimer
              baseMs={workedMs}
              baseAt={computedAt}
              running={running}
              short={short}
              style={[
                short ? styles.timerShort : compact ? styles.timerCompact : styles.timer,
                { color: t.text },
              ]}
            />
            {!compact && <Text style={[textVariants.caption, { color: t.textTertiary }]}>Worked today</Text>}
            {compact && caption ? (
              <Text style={[styles.ringCaption, { color: t.textTertiary }]}>{caption}</Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}

/** The day, shift start to shift end (wider if punches run outside it). */
export function DayTimelineBar({ timeline, compact = false }: { timeline: Timeline; compact?: boolean }) {
  const t = useTheme()
  const h = compact ? 8 : 12
  const pct = (f: number) => `${(f * 100).toFixed(2)}%` as `${number}%`
  return (
    <View style={{ gap: 6 }} accessibilityLabel="Today's timeline">
      <View style={[styles.track, { height: h, borderRadius: h / 2, backgroundColor: t.fieldBg }]}>
        {/* The shift itself, faintly, when punches stretch the axis past it. */}
        <View
          style={[
            styles.abs,
            {
              left: pct(timeline.shiftLeft),
              width: pct(timeline.shiftRight - timeline.shiftLeft),
              backgroundColor: t.border,
              opacity: 0.5,
            },
          ]}
        />
        {timeline.late && (
          <View
            style={[
              styles.abs,
              {
                left: pct(timeline.late.left),
                width: pct(timeline.late.width),
                backgroundColor: t.warningBg,
              },
            ]}
          />
        )}
        {timeline.segments.map((s, i) => (
          <View
            key={i}
            style={[
              styles.abs,
              {
                left: pct(s.left),
                width: pct(s.width),
                backgroundColor: t.success,
                borderRadius: h / 2,
                opacity: s.open ? 0.85 : 1,
              },
            ]}
          />
        ))}
        {timeline.grace != null && (
          <View style={[styles.tick, { left: pct(timeline.grace), backgroundColor: t.textFaint }]} />
        )}
        {timeline.now != null && (
          <View style={[styles.now, { left: pct(timeline.now), backgroundColor: t.text }]} />
        )}
      </View>
      {!compact && (
        <View style={styles.ends}>
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{clockIST(timeline.startMs)}</Text>
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{clockIST(timeline.endMs)}</Text>
        </View>
      )}
    </View>
  )
}

/** Mon to Sun, hours worked, today highlighted, the shift as a faint target line. */
export function WeekStrip({ columns, targetMin }: { columns: WeekColumn[]; targetMin: number }) {
  const t = useTheme()
  const H = 96
  const max = Math.max(targetMin * 1.15, ...columns.map((c) => c.minutes), 60)
  const targetY = H - (targetMin / max) * H
  return (
    <View style={styles.week}>
      <View style={[styles.weekBars, { height: H }]}>
        <View style={[styles.target, { top: targetY, borderColor: t.textFaint }]} pointerEvents="none" />
        {columns.map((c) => {
          const barH = c.minutes > 0 ? Math.max(4, (c.minutes / max) * H) : 0
          return (
            <View
              key={c.day}
              style={styles.weekCol}
              accessibilityLabel={`${c.label}: ${Math.floor(c.minutes / 60)} hours ${c.minutes % 60} minutes`}
            >
              <View
                style={{
                  height: barH,
                  width: "62%",
                  borderRadius: 6,
                  backgroundColor: c.today ? t.primary : c.minutes >= targetMin ? t.success : t.primary10,
                }}
              />
            </View>
          )
        })}
      </View>
      <View style={styles.weekLabels}>
        {columns.map((c) => (
          <View key={c.day} style={styles.weekCol}>
            <Text
              style={[
                textVariants.caption,
                {
                  color: c.today ? t.primary : c.future ? t.textFaint : t.textTertiary,
                  fontFamily: c.today ? font.semibold : font.regular,
                },
              ]}
            >
              {c.label}
            </Text>
            <Text style={[styles.hours, { color: c.future ? t.textFaint : t.textSecondary }]}>
              {c.future
                ? ""
                : c.minutes
                ? `${Math.floor(c.minutes / 60)}h${c.minutes % 60 ? ` ${c.minutes % 60}m` : ""}`
                : "0h"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 2 },
  timer: { fontFamily: font.semibold, fontSize: 30, lineHeight: 36, fontVariant: ["tabular-nums"] },
  timerShort: {
    fontFamily: font.semibold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  timerCompact: { fontFamily: font.semibold, fontSize: 15, lineHeight: 19, fontVariant: ["tabular-nums"] },
  ringCaption: { fontFamily: font.medium, fontSize: 11, lineHeight: 14 },
  track: { width: "100%", overflow: "hidden", position: "relative" },
  abs: { position: "absolute", top: 0, bottom: 0 },
  tick: { position: "absolute", top: 0, bottom: 0, width: 1.5 },
  now: { position: "absolute", top: -2, bottom: -2, width: 2, borderRadius: 1 },
  ends: { flexDirection: "row", justifyContent: "space-between" },
  week: { gap: spacing.xs },
  weekBars: { flexDirection: "row", alignItems: "flex-end", position: "relative" },
  weekCol: { flex: 1, alignItems: "center" },
  target: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderStyle: "dashed" },
  weekLabels: { flexDirection: "row" },
  hours: { fontFamily: font.regular, fontSize: 10, lineHeight: 13, fontVariant: ["tabular-nums"] },
})
