import React from "react"
import { StyleSheet, View, type LayoutChangeEvent } from "react-native"

import { RANGES, rangeFor, type RangeKey } from "@/domain/dashboard"
import { formatCurrency, formatNumber } from "@/domain/format"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import AppScreen, { type ScrollableList } from "@/ui/AppScreen"
import DataNotice from "@/ui/DataNotice"
import ListRefreshControl from "@/ui/ListRefreshControl"
import Panel from "@/ui/Panel"
import SegmentedControl from "@/ui/SegmentedControl"
import { SkeletonPanel } from "@/ui/Skeleton"

import { Funnel } from "@/features/home/charts"
import { HeatGrid, RankedBars } from "@/features/home/widgets"
import { Muted, WebsitePanels } from "@/features/home/homeUi"
import { FadeIn } from "@/features/home/interaction"
import { useDashboard } from "@/features/home/useDashboard"

/**
 * INSIGHTS, everything Home summarises, in full.
 *
 * Home is kept to the day's work and the headline figures (Jobber's pattern: a
 * short home, with "Business health → View all" behind it), so the analysis a
 * rep reads once a week rather than between two visits lives here: the funnel,
 * lead sources and their conversion, what sells, who buys, why deals are lost,
 * and for admins the website.
 *
 * Opened from a preview row on Home, it arrives scrolled to that row's section
 * (`section`) and on Home's period (`range`). The period switch pins under the
 * app bar once the page scrolls (AppScreen's `stickyBar`), so the window being
 * read is always on screen, Shopify keeps its date chip in reach the same way.
 */

export type InsightSection = "funnel" | "sources" | "timing" | "products" | "customers" | "losses" | "website"

const money = (n: number) => formatCurrency(n, { compact: true })

export default function InsightsScreen({ navigation, route }: StackScreenProps<"Insights">) {
  const t = useTheme()
  const [range, setRange] = React.useState<RangeKey>(route.params?.range || "30d")
  // The segmented control follows the thumb at once; the page recomputes on the
  // NEXT frame, so the control's slide is never stuck behind a full analytics
  // pass (React defers the heavy render and keeps the old one on screen).
  const shownRange = React.useDeferredValue(range)
  const { d, now, web, access, loading, refreshing, error, fromCache, cachedAt, reload } = useDashboard(shownRange, {
    withWeb: true,
  })
  const r = rangeFor(shownRange)

  // ---- scroll to the section Home asked for, once it has been laid out.
  const listRef = React.useRef<ScrollableList>(null)
  const offsets = React.useRef<Partial<Record<InsightSection, number>>>({})
  const jumped = React.useRef(false)
  const [threshold, setThreshold] = React.useState(0)
  const target = route.params?.section

  const anchor = (key: InsightSection) => (e: LayoutChangeEvent) => {
    // Read NOW: React Native recycles the event once this handler returns, so
    // `e.nativeEvent` is null inside the frame callback below. Reading it there
    // crashed the app every time an Insights row on Home was tapped.
    const y = e.nativeEvent.layout.y
    offsets.current[key] = y
    if (!jumped.current && key === target && !loading) {
      jumped.current = true
      // Leave the pinned period bar's height clear above the section head.
      requestAnimationFrame(() => listRef.current?.scrollToOffset?.({ offset: Math.max(0, y - 56), animated: true }))
    }
  }

  const periods = (
    <SegmentedControl
      options={RANGES.map((x) => ({ key: x.key, label: x.label }))}
      value={range}
      onChange={(k) => {
        feedback.select()
        setRange(k)
      }}
    />
  )

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title="Insights"
        subtitle={`Last ${r.label}, compared with the ${r.noun}`}
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        listRef={listRef}
        stickyBar={<View style={styles.sticky}>{periods}</View>}
        stickyThreshold={threshold}
        list={{
          data: [],
          renderItem: () => null,
          refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />
        <View
          style={styles.segments}
          onLayout={(e) => setThreshold(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          {periods}
        </View>

        {loading ? (
          <>
            <SkeletonPanel block={120} lines={1} />
            <SkeletonPanel lines={4} />
            <SkeletonPanel lines={4} />
          </>
        ) : (
          <FadeIn>
            {access.leads && access.quotes && (
              <View onLayout={anchor("funnel")}>
                <Panel title="Funnel" meta="Each stage dated on its own" padded>
                  <Funnel color={t.primary} stages={d.funnel} />
                </Panel>
              </View>
            )}

            {access.leads && (
              <View onLayout={anchor("sources")}>
                <Panel title="Where leads come from" meta={`Share of ${formatNumber(d.leads.total)} leads`} padded>
                  {d.sources.length ? (
                    // Volume AND conversion in one mark: the whole bar is the leads a
                    // source sent, the dark part inside it the ones that were won.
                    <RankedBars
                      color={t.primary}
                      total={d.leads.total}
                      partLabel="Won"
                      wholeLabel="Leads"
                      rows={d.sources.map((s) => ({
                        key: s.label,
                        label: s.label,
                        value: s.count,
                        part: s.won,
                        display: formatNumber(s.count),
                        sub: s.won ? `${s.won} won · ${s.conv}% converted` : "None won yet",
                      }))}
                    />
                  ) : (
                    <Muted text={`No leads in the last ${r.label}.`} />
                  )}
                </Panel>
              </View>
            )}

            {access.leads && (
              <View onLayout={anchor("timing")}>
                <Panel title="When leads arrive" meta="Last 90 days, your local time" padded>
                  {d.heatmap.total ? (
                    <HeatGrid data={d.heatmap} color={t.primary} />
                  ) : (
                    <Muted text="No leads in the last 90 days." />
                  )}
                </Panel>
              </View>
            )}

            {access.quotes && (
              <View onLayout={anchor("products")}>
                <Panel title="Most quoted products" meta="By value, ex-GST" padded>
                  {d.topProducts.length ? (
                    <RankedBars
                      color={t.primary}
                      rows={d.topProducts.map((p) => ({
                        key: p.name,
                        label: p.name,
                        value: p.value,
                        display: money(p.value),
                        sub: `${formatNumber(p.quantity)} pcs across ${p.quotes} quote${p.quotes === 1 ? "" : "s"}`,
                      }))}
                    />
                  ) : (
                    <Muted text={`Nothing quoted in the last ${r.label}.`} />
                  )}
                </Panel>
              </View>
            )}

            {access.quotes && (
              <View onLayout={anchor("customers")}>
                <Panel title="Top customers" meta="Won inside quoted" padded>
                  {d.topCustomers.length ? (
                    <RankedBars
                      color={t.primary}
                      partLabel="Won"
                      wholeLabel="Quoted"
                      rows={d.topCustomers.map((c) => ({
                        key: c.name,
                        label: c.name,
                        value: c.value,
                        part: c.wonValue,
                        display: money(c.value),
                        sub: `${c.quotes} quote${c.quotes === 1 ? "" : "s"}${c.wonValue ? ` · ${money(c.wonValue)} won` : " · none won yet"}`,
                      }))}
                    />
                  ) : (
                    <Muted text={`No customers quoted in the last ${r.label}.`} />
                  )}
                </Panel>
              </View>
            )}

            {access.quotes && (
              <View onLayout={anchor("losses")}>
                <Panel title="Why we lose" meta="Share of rejected quotes" padded>
                  {d.lostReasons.length ? (
                    <RankedBars
                      color={t.danger}
                      total={d.lostReasons.reduce((s, l) => s + l.count, 0)}
                      rows={d.lostReasons.map((l) => ({ key: l.reason, label: l.reason, value: l.count, display: `${l.count}` }))}
                    />
                  ) : (
                    <Muted text="No quotation was rejected in this period." />
                  )}
                </Panel>
              </View>
            )}

            {access.admin && (
              <View onLayout={anchor("website")}>
                <WebsitePanels range={shownRange} now={now} web={web} />
              </View>
            )}
          </FadeIn>
        )}
      </AppScreen>
    </View>
  )
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  sticky: { paddingHorizontal: gutter, paddingVertical: spacing.sm },
})
