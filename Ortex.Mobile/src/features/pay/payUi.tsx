import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE, money, type ClaimStatus } from "@/features/pay/payFormat"
import type { PayTableRow } from "@/features/pay/payRows"
import { usePayColors } from "@/features/pay/usePayColors"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Skeleton, { SkeletonList } from "@/ui/Skeleton"

/**
 * The pay pages' drawing kit, modelled on Zoho Payroll's employee app: the
 * payslip hero, the summary band, the ruled earnings/deductions tables, the
 * stat strip, the year-to-date donut, the monthly bars and the claim pill.
 *
 * Everything here is flat: a panel's content on `surface`, a nested tile on the
 * inset plane or a tone's tinted well, never a shadow. A status hue fills a
 * mark; words on its well use the `*Text` step. Figures are formatted by
 * `money()` (lakh/crore grouping) and are never computed here.
 */

export type PaySlice = { key: string; label: string; value: number; color: string }

// ---- hero ------------------------------------------------------------------------------------------

/**
 * Zoho's payslip card, as the head of a panel: the month as an eyebrow, net pay
 * as the one large figure, the pay date under it, and whatever the caller puts
 * below (the stat strip, an action).
 */
export function PayHero({
  eyebrow,
  label,
  amount,
  caption,
  children,
}: {
  eyebrow?: string
  label: string
  amount: number
  caption?: string
  children?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={styles.hero}>
      {eyebrow ? <Text style={[textVariants.sectionLabel, { color: t.textTertiary }]}>{eyebrow.toUpperCase()}</Text> : null}
      <Text style={[textVariants.small, { color: t.textSecondary, marginTop: eyebrow ? spacing.sm : 0 }]}>{label}</Text>
      <Text
        style={[textVariants.statLarge, { color: t.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLabel={`${label}: ${money(amount)}`}
      >
        {money(amount)}
      </Text>
      {caption ? <Text style={[textVariants.caption, { color: t.textTertiary }]}>{caption}</Text> : null}
      {children ? <View style={styles.heroBody}>{children}</View> : null}
    </View>
  )
}

// ---- stat strip ------------------------------------------------------------------------------------

export type PayStat = { key: string; label: string; value: string; tone?: "warning" | "accent" }

/**
 * Two to four facts side by side on one inset tile, split by hairlines:
 * "Paid days 30 | LOP days 0 | Gross ₹32,000". A fact that needs attention
 * (loss of pay) sits on the warning well with the warning's text step.
 */
export function StatStrip({ stats }: { stats: PayStat[] }) {
  const t = useTheme()
  return (
    <View style={[styles.strip, { backgroundColor: t.surfaceInset }]}>
      {stats.map((s, i) => {
        const warn = s.tone === "warning"
        const accent = s.tone === "accent"
        return (
          <View
            key={s.key}
            style={[
              styles.stripCell,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.border },
              warn && { backgroundColor: t.warningBg },
              accent && { backgroundColor: t.primary10 },
            ]}
            accessible
            accessibilityLabel={`${s.label}: ${s.value}`}
          >
            <Text style={[textVariants.caption, { color: warn ? t.warningText : accent ? t.primary : t.textTertiary }]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text
              style={[textVariants.amount, { color: warn ? t.warningText : accent ? t.primary : t.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {s.value}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ---- ruled table -----------------------------------------------------------------------------------

/**
 * A ruled table at phone width, the shape of the payslip's EARNINGS and
 * DEDUCTIONS blocks: a small header line, one hairline-ruled row per component
 * (name left, figures right), and a total row set strong over a heavier rule.
 * One figure column on a payslip; two (Monthly, Annual) on the salary page.
 */
export function PayTable({
  headers,
  rows,
  total,
  empty = "None this month.",
}: {
  /** First is the name column, the rest head the figure columns. */
  headers: string[]
  rows: PayTableRow[]
  total?: { label: string; values: string[] }
  empty?: string
}) {
  const t = useTheme()
  const figureCols = headers.length - 1
  const numStyle = [styles.num, figureCols > 1 && styles.numFixed]
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.th, { borderBottomColor: t.divider }]}>
        {headers.map((h, i) => (
          <Text
            key={h}
            style={[textVariants.tileLabel, { color: t.textTertiary }, i === 0 ? styles.nameCol : numStyle]}
            numberOfLines={1}
          >
            {h.toUpperCase()}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>{empty}</Text>
      ) : (
        rows.map((r, i) => (
          <View
            key={r.key}
            style={[styles.tr, styles.td, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.divider }]}
            accessible
            accessibilityLabel={`${r.label}: ${r.values.join(", ")}`}
          >
            <View style={styles.nameCol}>
              <Text style={[textVariants.body, { color: t.textSecondary }]}>{r.label}</Text>
              {r.note ? <Text style={[textVariants.caption, { color: t.textTertiary }]}>{r.note}</Text> : null}
            </View>
            {r.values.map((v, j) => (
              <Text key={j} style={[textVariants.body, numStyle, { color: t.text }]} numberOfLines={1}>
                {v}
              </Text>
            ))}
          </View>
        ))
      )}
      {total ? (
        <View
          style={[styles.tr, styles.tTotal, { borderTopColor: t.border }]}
          accessible
          accessibilityLabel={`${total.label}: ${total.values.join(", ")}`}
        >
          <Text style={[textVariants.bodyStrong, styles.nameCol, { color: t.text }]}>{total.label}</Text>
          {total.values.map((v, j) => (
            <Text key={j} style={[textVariants.bodyStrong, numStyle, { color: t.text }]} numberOfLines={1}>
              {v}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

// ---- highlighted net pay ---------------------------------------------------------------------------

/**
 * NET PAY on the brand's tinted well: the figure a payslip exists to state,
 * with the same figure in words under it, as the printed payslip carries it.
 */
export function NetPayBlock({ label = "Net pay", amount, words }: { label?: string; amount: number; words?: string }) {
  const t = useTheme()
  return (
    <View style={[styles.netBlock, { backgroundColor: t.primary10 }]} accessible accessibilityLabel={`${label}: ${money(amount)}`}>
      <View style={styles.netHead}>
        <Text style={[textVariants.tileLabel, { color: t.primary, flex: 1 }]}>{label.toUpperCase()}</Text>
        <Text style={[styles.netAmount, { color: t.primary }]} numberOfLines={1} adjustsFontSizeToFit>
          {money(amount)}
        </Text>
      </View>
      {words ? <Text style={[textVariants.caption, { color: t.textSecondary }]}>{words}</Text> : null}
    </View>
  )
}

// ---- charts ----------------------------------------------------------------------------------------

/** A donut of slices with a figure in the middle, and its legend beside it. */
export function PayDonut({
  slices,
  centreLabel,
  centreValue,
  size = 132,
}: {
  slices: PaySlice[]
  centreLabel: string
  centreValue: string
  size?: number
}) {
  const t = useTheme()
  const c = usePayColors()
  const stroke = 16
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const gap = slices.filter((x) => x.value > 0).length > 1 ? 3 : 0
  let offset = 0

  return (
    <View style={styles.donutRow}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.track} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            slices.map((s) => {
              if (s.value <= 0) return null
              const len = (s.value / total) * circ
              const dash = Math.max(0, len - gap)
              const el = (
                <Circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={s.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              )
              offset += len
              return el
            })}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{centreLabel}</Text>
          <Text style={[styles.centreValue, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {centreValue}
          </Text>
        </View>
      </View>
      <View style={styles.legend}>
        {slices.map((s) => (
          <View key={s.key} style={styles.legendRow} accessible accessibilityLabel={`${s.label}: ${money(s.value)}`}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>{s.label}</Text>
              <Text style={[textVariants.bodyStrong, styles.tabular, { color: t.text }]}>{money(s.value)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

/** Net pay per month, oldest first; the newest bar in the accent. Tap a bar to open that payslip. */
export function NetPayBars({
  data,
  onPress,
}: {
  data: { id: string; label: string; net: number }[]
  onPress?: (id: string) => void
}) {
  const t = useTheme()
  const c = usePayColors()
  const max = Math.max(1, ...data.map((d) => d.net))
  const HEIGHT = 96
  return (
    <View style={styles.bars}>
      {data.map((d, i) => {
        const last = i === data.length - 1
        const h = Math.max(4, Math.round((d.net / max) * HEIGHT))
        return (
          <Pressable
            key={d.id}
            style={styles.barCol}
            onPress={
              onPress
                ? () => {
                    feedback.tap()
                    onPress(d.id)
                  }
                : undefined
            }
            accessibilityRole={onPress ? "button" : undefined}
            accessibilityLabel={`${d.label}: ${money(d.net)}`}
          >
            <Text style={[styles.barValue, { color: last ? t.text : t.textTertiary }]} numberOfLines={1}>
              {compactRupees(d.net)}
            </Text>
            <View style={[styles.barTrack, { height: HEIGHT }]}>
              <View style={[styles.bar, { height: h, backgroundColor: last ? c.net : t.accentBorder }]} />
            </View>
            <Text style={[textVariants.caption, { color: last ? t.text : t.textTertiary }]}>{d.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** ₹32.4K, for a bar label where the full figure does not fit. */
function compactRupees(n: number): string {
  const v = Math.abs(n)
  if (v >= 1e7) return `₹${(n / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`
  if (v >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, "")}L`
  if (v >= 1e3) return `₹${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`
  return `₹${Math.round(n)}`
}

/** One horizontal strip: how much of what was earned reached the account. */
export function NetStrip({ parts }: { parts: PaySlice[] }) {
  const t = useTheme()
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0)
  return (
    <View style={styles.netStripWrap}>
      <View style={[styles.netStrip, { backgroundColor: t.surfaceTrack }]}>
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => <View key={p.key} style={{ flex: p.value / total, backgroundColor: p.color }} />)}
      </View>
      <View style={styles.netStripLegend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.netStripItem}>
            <View style={[styles.swatch, styles.swatchInline, { backgroundColor: p.color }]} />
            <Text style={[textVariants.caption, { color: t.textSecondary }]}>
              {`${p.label} ${total > 0 ? Math.round((p.value / total) * 100) : 0}%`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ---- claims ----------------------------------------------------------------------------------------

/** "Waiting" on its tone's tinted well. */
export function ClaimStatusPill({ status }: { status: ClaimStatus }) {
  const t = useTheme()
  const c = t.tones[CLAIM_STATUS_TONE[status]]
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[textVariants.caption, { color: c.fg, fontFamily: font.semibold }]}>{CLAIM_STATUS_LABEL[status]}</Text>
    </View>
  )
}

// ---- skeletons -------------------------------------------------------------------------------------

/** The hero panel's shape: eyebrow, label, figure, caption, the stat strip and a button. */
export function PayHeroSkeleton({ button = true }: { button?: boolean }) {
  const t = useTheme()
  return (
    <>
      <View style={[styles.hero, { backgroundColor: t.surface, paddingTop: gutter }]}>
        <Skeleton width={120} height={11} radius={5} />
        <Skeleton width={90} height={13} radius={6} style={{ marginTop: spacing.sm + 4 }} />
        <Skeleton width="58%" height={34} radius={10} style={{ marginTop: 6 }} />
        <Skeleton width="44%" height={12} radius={6} style={{ marginTop: 6 }} />
        <Skeleton height={62} radius={radius.card} style={{ marginTop: spacing.md }} />
        {button ? <Skeleton height={48} radius={radius.card} style={{ marginTop: spacing.md }} /> : null}
      </View>
      <View style={[styles.band, { backgroundColor: t.border }]} />
    </>
  )
}

/** A panel of month rows: its label, then ListRow-shaped rows with a figure. */
export function PayListSkeleton({ count = 4 }: { count?: number }) {
  const t = useTheme()
  return (
    <View style={{ backgroundColor: t.surface }}>
      <View style={styles.skHead}>
        <Skeleton width={110} height={11} radius={5} />
      </View>
      <SkeletonList count={count} value />
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingBottom: gutter, gap: 2 },
  heroBody: { marginTop: spacing.md, gap: spacing.md },

  strip: { flexDirection: "row", borderRadius: radius.card, overflow: "hidden" },
  stripCell: { flex: 1, paddingHorizontal: spacing.md - 4, paddingVertical: spacing.sm + 2, gap: 2 },

  table: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  th: { paddingBottom: spacing.sm, borderBottomWidth: 1 },
  td: { paddingVertical: spacing.sm + 2 },
  tTotal: { borderTopWidth: 1.5, paddingVertical: spacing.md - 4, marginTop: 2 },
  nameCol: { flex: 1, minWidth: 0 },
  num: { textAlign: "right", fontVariant: ["tabular-nums"] },
  numFixed: { width: 104 },
  empty: { paddingVertical: spacing.md },

  netBlock: { marginHorizontal: gutter, marginBottom: gutter, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  netHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  netAmount: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, fontVariant: ["tabular-nums"], flexShrink: 1 },

  donutRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: gutter, paddingBottom: spacing.md },
  centre: { alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  centreValue: { fontFamily: font.bold, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 3, marginTop: 4 },
  swatchInline: { marginTop: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: gutter },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barValue: { fontFamily: font.medium, fontSize: 10, lineHeight: 13, fontVariant: ["tabular-nums"] },
  barTrack: { width: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "70%", maxWidth: 28, borderRadius: 6 },
  netStripWrap: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  netStrip: { height: 10, borderRadius: 5, overflow: "hidden", flexDirection: "row" },
  netStripLegend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  netStripItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },

  band: { height: 2 },
  skHead: { paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: spacing.sm },
})
