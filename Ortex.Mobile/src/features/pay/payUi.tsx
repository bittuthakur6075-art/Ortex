import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE, money, type ClaimStatus, type PayLine } from "@/features/pay/payFormat"
import { usePayColors } from "@/features/pay/usePayColors"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"

/**
 * The pay pages' drawing kit (Zoho Payroll's employee app): the net-pay hero,
 * the year-to-date donut, the monthly bars, the net-vs-deductions strip and
 * the claim status pill. Flat, no shadow, the saturated hue for a mark and the
 * `*Text` step for words on a tinted well.
 */

export type PaySlice = { key: string; label: string; value: number; color: string }

/** "Net pay · September 2026" over the figure. */
export function PayHero({ label, amount, caption }: { label: string; amount: number; caption?: string }) {
  const t = useTheme()
  return (
    <View style={styles.hero}>
      <Text style={[textVariants.small, { color: t.textSecondary }]}>{label}</Text>
      <Text style={[styles.heroAmount, { color: t.text }]} accessibilityLabel={`${label}: ${money(amount)}`}>
        {money(amount)}
      </Text>
      {caption ? <Text style={[textVariants.caption, { color: t.textTertiary }]}>{caption}</Text> : null}
    </View>
  )
}

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
  const HEIGHT = 110
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
    <View style={styles.stripWrap}>
      <View style={[styles.strip, { backgroundColor: t.surfaceTrack }]}>
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => <View key={p.key} style={{ flex: p.value / total, backgroundColor: p.color }} />)}
      </View>
      <View style={styles.stripLegend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.stripItem}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Text style={[textVariants.caption, { color: t.textSecondary }]}>
              {`${p.label} ${total > 0 ? Math.round((p.value / total) * 100) : 0}%`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** Label and amount rows with a total line under them. */
export function AmountList({ items, totalLabel, total }: { items: PayLine[]; totalLabel?: string; total?: number }) {
  const t = useTheme()
  const shown = items.filter((x) => Number(x.amount) > 0)
  return (
    <View style={styles.amounts}>
      {shown.length === 0 ? (
        <Text style={[textVariants.small, { color: t.textTertiary }]}>None this month.</Text>
      ) : (
        shown.map((x, i) => (
          <View key={`${x.code}-${i}`} style={styles.amountRow}>
            <Text style={[textVariants.body, { color: t.textSecondary, flex: 1 }]}>{x.name}</Text>
            <Text style={[textVariants.body, styles.tabular, { color: t.text }]}>{money(x.amount)}</Text>
          </View>
        ))
      )}
      {totalLabel !== undefined && total !== undefined ? (
        <View style={[styles.amountRow, styles.totalRow, { borderTopColor: t.border }]}>
          <Text style={[textVariants.bodyStrong, { color: t.text, flex: 1 }]}>{totalLabel}</Text>
          <Text style={[textVariants.bodyStrong, styles.tabular, { color: t.text }]}>{money(total)}</Text>
        </View>
      ) : null}
    </View>
  )
}

/** A fact tile: "Paid days / 30". */
export function PayFact({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  const t = useTheme()
  return (
    <View style={[styles.fact, { backgroundColor: tone === "warning" ? t.warningBg : t.surfaceInset }]}>
      <Text style={[textVariants.caption, { color: tone === "warning" ? t.warningText : t.textTertiary }]}>{label}</Text>
      <Text style={[styles.factValue, { color: tone === "warning" ? t.warningText : t.text }]}>{value}</Text>
    </View>
  )
}

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

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: 2 },
  heroAmount: { fontFamily: font.bold, fontSize: 34, lineHeight: 42, fontVariant: ["tabular-nums"] },
  donutRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: gutter, paddingBottom: spacing.md },
  centre: { alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  centreValue: { fontFamily: font.bold, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 3, marginTop: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.md },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barValue: { fontFamily: font.medium, fontSize: 10, lineHeight: 13, fontVariant: ["tabular-nums"] },
  barTrack: { width: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "70%", maxWidth: 28, borderRadius: 6 },
  stripWrap: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  strip: { height: 12, borderRadius: 6, overflow: "hidden", flexDirection: "row" },
  stripLegend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stripItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  amounts: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.xs },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 2 },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs, paddingTop: spacing.sm },
  fact: { flex: 1, borderRadius: radius.card, padding: spacing.md, gap: 2 },
  factValue: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, fontVariant: ["tabular-nums"] },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
})
