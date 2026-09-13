import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { computeWebTraffic, rangeFor, type RangeKey } from "@/domain/dashboard"
import { formatNumber } from "@/domain/format"
import type { Product } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { useTheme } from "@/store/ThemeContext"
import { radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import Panel from "@/ui/Panel"
import { SkeletonPanel } from "@/ui/Skeleton"

import { DeltaText } from "@/features/home/charts"
import { CountUp, PressScale } from "@/features/home/interaction"
import { MiniColumns, PaceChart, RankedBars, Ring, SplitMeter } from "@/features/home/widgets"
import type { useWebTraffic } from "@/features/home/useWebTraffic"

/**
 * The pieces Home and Insights share. Tiles are the one place a rounded card
 * shape belongs inside a panel (see ui/Panel.tsx): they sit on the inset plane
 * so they have an edge on a white panel without a border or a shadow.
 */

/**
 * A metric tile, Shopify's shape: label, figure, change pill, and one line of
 * context that says what the figure is made of. Tappable when there is a page
 * behind the number, then it gives under the thumb (PressScale).
 *
 * Pass `count` instead of relying on `value` alone and the figure counts up to
 * its value on first show and on a range change.
 */
export function Tile({
  label,
  value,
  count,
  delta,
  note,
  aside,
  chart,
  onPress,
}: {
  label: string
  value: string
  /** Animate the figure: the number and how to print each frame of it. */
  count?: { value: number; format: (n: number) => string }
  delta?: React.ReactNode
  note?: string
  /** Drawn at the right of the figure: a ring meter. */
  aside?: React.ReactNode
  /** Drawn under the footer: mini columns, a speed scale. */
  chart?: React.ReactNode
  onPress?: () => void
}) {
  const t = useTheme()
  const figureStyle = [textVariants.stat, { color: t.text, marginTop: 4 }]
  const body = (
    <>
      <View style={styles.tileTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[textVariants.caption, { color: t.textSecondary }]} numberOfLines={1}>
            {label}
          </Text>
          {count ? (
            <CountUp value={count.value} format={count.format} style={figureStyle} adjustsFontSizeToFit />
          ) : (
            <Text style={figureStyle} numberOfLines={1} adjustsFontSizeToFit>
              {value}
            </Text>
          )}
        </View>
        {aside ? <View style={styles.tileAside}>{aside}</View> : null}
      </View>
      <View style={styles.tileFoot}>
        {delta}
        {note ? (
          <Text style={[textVariants.caption, styles.tileNote, { color: t.textTertiary }]} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      {chart ? <View style={styles.tileChart}>{chart}</View> : null}
    </>
  )
  const a11y = `${label}: ${value}. ${note || ""}`
  if (!onPress) {
    return (
      <View style={[styles.tile, { backgroundColor: t.surfaceInset }]} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    )
  }
  return (
    <View style={styles.tileSlot}>
      <PressScale onPress={onPress} accessibilityLabel={a11y} style={[styles.tileInner, { backgroundColor: t.surfaceInset }]}>
        {body}
      </PressScale>
    </View>
  )
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>
}

/**
 * One of the shortcuts under the greeting (Remote's quick actions): a tinted
 * well over a two-word label. Four fit a 360dp phone in one row. The well
 * springs down under the thumb and the haptic lands with it.
 */
export function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme()
  return (
    <View style={styles.quick}>
      <PressScale onPress={onPress} accessibilityLabel={label} scaleTo={0.9} style={styles.quickInner}>
        <View style={[styles.quickWell, { backgroundColor: t.iconWell }]}>
          <Icon name={icon} size={24} color={t.primary} variant="Bulk" />
        </View>
        <Text style={[textVariants.captionStrong, styles.quickLabel, { color: t.text }]} numberOfLines={2}>
          {label}
        </Text>
      </PressScale>
    </View>
  )
}

export function Muted({ text }: { text: string }) {
  const t = useTheme()
  return <Text style={[textVariants.small, { color: t.textTertiary }]}>{text}</Text>
}

// ---- website (admins) ------------------------------------------------------------

export function WebsitePanels({
  range,
  now,
  web,
}: {
  range: RangeKey
  now: number
  web: ReturnType<typeof useWebTraffic>
}) {
  const t = useTheme()
  // Only an admin's Insights mounts this, and only they need the catalogue to
  // tell a search the shop can answer from one it cannot.
  const products = useCollection<Product>("products")
  const w = React.useMemo(
    () => computeWebTraffic({ activities: web.rows, products: products.items, range, now }),
    [web.rows, products.items, range, now],
  )
  const r = rangeFor(range)

  if (web.loading) return <SkeletonPanel block={132} lines={3} />
  if (web.error) {
    return (
      <Panel title="Website" padded>
        <Muted text={`Website traffic could not be loaded. ${web.error}`} />
      </Panel>
    )
  }

  const rows = (list: { label: string; count: number }[]) =>
    list.map((p) => ({ key: p.label, label: p.label, value: p.count, display: formatNumber(p.count) }))
  // Sessions as a running total, so the ghost of the previous window reads as
  // "ahead or behind by now" exactly as Home's quoted-value chart does.
  const running = (xs: number[]) => {
    let run = 0
    return xs.map((v) => (run += v))
  }

  return (
    <>
      <Panel title="Website" meta={`Last ${r.label}${web.truncated ? " · partial" : ""}`} padded>
        <TileGrid>
          <Tile label="Visitors" value={formatNumber(w.visitors)} delta={<DeltaText delta={w.visitorsDelta} />} />
          <Tile
            label="Sessions"
            value={formatNumber(w.sessions)}
            delta={<DeltaText delta={w.sessionsDelta} />}
            chart={<MiniColumns values={w.trend.map((b) => b.sessions)} color={t.primary} />}
          />
          <Tile
            label="Opened quote builder"
            value={formatNumber(w.quoteSessions)}
            aside={<Ring pct={w.sessions ? (w.quoteSessions / w.sessions) * 100 : null} color={t.primary} size={40} stroke={5} />}
            note={w.sessions ? `${Math.round((w.quoteSessions / w.sessions) * 100)}% of sessions` : undefined}
          />
        </TileGrid>
        {w.mobileShare !== null && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[textVariants.small, { color: t.textSecondary, marginBottom: spacing.sm }]}>Device</Text>
            <SplitMeter
              parts={[
                { label: "Phone or tablet", value: w.mobileShare, color: t.primary },
                { label: "Desktop", value: 100 - w.mobileShare, color: t.textHint },
              ]}
            />
          </View>
        )}
        <View style={{ marginTop: spacing.lg }}>
          <PaceChart
            current={running(w.trend.map((b) => b.sessions))}
            previous={running(w.trendPrevious)}
            labels={w.trend.map((b) => b.label.split(" – ").pop() || b.label)}
            format={formatNumber}
            color={t.primary}
            names={["Sessions, this period", "Previous period"]}
          />
        </View>
      </Panel>

      {w.demandGaps.length > 0 && (
        <Panel title="Searched, not in catalogue" meta="What to add next" padded>
          <RankedBars color={t.warning} rows={rows(w.demandGaps)} />
        </Panel>
      )}
      {w.channels.length > 0 && (
        <Panel title="How they found us" meta="Share of sessions" padded>
          <RankedBars color={t.primary} rows={rows(w.channels)} total={w.sessions} />
        </Panel>
      )}
      {w.topPages.length > 0 && (
        <Panel title="Most viewed" meta="Share of page views" padded>
          <RankedBars color={t.primary} rows={rows(w.topPages)} total={w.pageViews} />
        </Panel>
      )}
      {w.topSearches.length > 0 && (
        <Panel title="Top searches" padded>
          <RankedBars color={t.primary} rows={rows(w.topSearches)} />
        </Panel>
      )}
      {w.cities.length > 0 && (
        <Panel title="Visitors by city" meta="Consenting visitors only" padded>
          <RankedBars color={t.primary} rows={rows(w.cities)} />
        </Panel>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // Two to a row: flexBasis under half leaves room for the one 8dp gap.
  tile: {
    flexBasis: "46%",
    flexGrow: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: 104,
  },
  // A pressable tile keeps the grid cell on the outer View and scales the card inside it.
  tileSlot: { flexBasis: "46%", flexGrow: 1 },
  tileInner: { flex: 1, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: 14, minHeight: 104 },
  tileTop: { flexDirection: "row", alignItems: "center" },
  tileAside: { marginLeft: spacing.sm },
  tileChart: { marginTop: spacing.sm },
  tileFoot: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6, minHeight: 20 },
  tileNote: { flexShrink: 1 },
  quick: { flex: 1, alignItems: "center" },
  quickInner: { alignItems: "center" },
  quickWell: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  quickLabel: { marginTop: 8, textAlign: "center" },
})
