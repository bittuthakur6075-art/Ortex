import React from "react"
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native"

import {
  RANGES,
  computeWebTraffic,
  delta,
  durationWords,
  rangeFor,
  speedStep,
  type AttentionItem,
  type Delta,
  type RangeKey,
} from "@/domain/dashboard"
import { formatCurrency, formatNumber } from "@/domain/format"
import { QUOTATION_STATUS, statusMeta } from "@/domain/schema"
import AnuButton from "@/features/anu/AnuButton"
import AnuHomeCard from "@/features/anu/AnuHomeCard"
import AttendanceHomeCard from "@/features/attendance/AttendanceHomeCard"
import NotificationBell from "@/features/notifications/NotificationBell"
import { callNumber } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import AppScreen from "@/ui/AppScreen"
import DataNotice from "@/ui/DataNotice"
import EmptyState from "@/ui/EmptyState"
import Icon from "@/ui/Icon"
import IconButton from "@/ui/IconButton"
import ListRefreshControl from "@/ui/ListRefreshControl"
import ListRow, { RowSeparator } from "@/ui/ListRow"
import Panel from "@/ui/Panel"
import ProfileAvatarButton from "@/ui/ProfileAvatarButton"
import SegmentedControl from "@/ui/SegmentedControl"
import { SkeletonPanel } from "@/ui/Skeleton"

import { DeltaText, StackBar, StackedColumns } from "@/features/home/charts"
import { CountUp, FadeIn, PressScale } from "@/features/home/interaction"
import { useReducedMotion } from "@/features/home/motion"
import { MiniColumns, PaceChart, Ring, SpeedScale } from "@/features/home/widgets"
import { QuickAction, Tile, TileGrid } from "@/features/home/homeUi"
import type { InsightSection } from "@/features/home/InsightsScreen"
import { statusFill, useSeries } from "@/features/home/series"
import { useDashboard } from "@/features/home/useDashboard"

/**
 * HOME, the first tab, and a page for the next ten minutes rather than a report.
 *
 * Redesigned against the home screens of the apps that do this best (Mobbin,
 * 2026-09-13): Jobber (a field business of requests, quotes and jobs, the
 * closest match to Ortex), Shopify, Rocket Money, Remote, Asana and Jira. What
 * they agree on, and what this page therefore does:
 *
 *   1. THE GREETING IS THE TITLE, with the date above it in words (Jobber,
 *      Asana). It is the one line that tells a rep the page is theirs and today's.
 *   2. SHORTCUTS BEFORE DATA (Remote's quick actions): the four things a rep
 *      opens the app to do are one tap from launch, not a tab and a FAB away.
 *   3. THE TO-DO LIST OWNS THE TOP, and its rows are actionable in place: a
 *      waiting lead carries a Call button on the row itself (Yubo, Strava), so
 *      the commonest job, ring them back, needs no screen in between. The list
 *      shows three and expands in place, never a dead "and 7 more".
 *   4. ONE HERO NUMBER, WITH ITS COMPARISON IN WORDS (Rocket Money's "same as
 *      last month", Shopify's compare-to): "₹1.2L more than the previous 30
 *      days" is read in one glance where "↑ 24%" still needs a baseline.
 *   5. FOUR TILES, NOT SIX, each with a change pill (Jobber's Business health).
 *   6. SHORT PAGE, DEEP LINKS: sources, products, customers, losses and the
 *      website are preview rows here and full panels on Insights (Jobber's
 *      "Business health → View all"). The earlier Home ran to fourteen panels
 *      and buried the pipeline under a report nobody reads between two visits.
 *
 * Every figure comes from features/home/useDashboard.ts → domain/dashboard.ts,
 * shared with Insights, with each section gated on its module exactly as the
 * tabs are.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const COLLAPSED = 3

const money = (n: number) => formatCurrency(n, { compact: true })

function greeting(now: Date) {
  const h = now.getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

/** "₹12K more than the previous 30 days", the comparison a person reads, not a ratio. */
function compareWords(dl: Delta, previous: number, noun: string, format: (n: number) => string, what: string) {
  if (!previous && dl.diff === 0) return `Nothing ${what} in this period or the ${noun}`
  if (!previous) return `Nothing ${what} in the ${noun}`
  if (dl.dir === "flat") return `Same as the ${noun}`
  return `${format(Math.abs(dl.diff))} ${dl.dir === "up" ? "more" : "less"} than the ${noun}`
}

export default function HomeScreen({ navigation }: TabScreenProps<"Home">) {
  const t = useTheme()
  const series = useSeries()
  const [range, setRange] = React.useState<RangeKey>("30d")
  // The segmented control follows the thumb at once; the page recomputes on the
  // NEXT frame, so the control's slide is never stuck behind a full analytics
  // pass (React defers the heavy render and keeps the old one on screen).
  const shownRange = React.useDeferredValue(range)
  const [expanded, setExpanded] = React.useState(false)
  const chevron = React.useRef(new Animated.Value(0)).current
  const reduceMotion = useReducedMotion()

  const { d, attention, now, web, access, profile, loading, refreshing, error, fromCache, cachedAt, reload } =
    useDashboard(shownRange, { withWeb: true })
  const r = rangeFor(shownRange)

  // The one website figure Home shows, on the Insights preview row.
  const visitors = React.useMemo(
    () => (access.admin && !web.loading && !web.error ? computeWebTraffic({ activities: web.rows, range: shownRange, now }) : null),
    [access.admin, web.loading, web.error, web.rows, shownRange, now],
  )

  const today = new Date(now)
  const firstName = (profile?.name || "").trim().split(/\s+/)[0]
  const title = `${greeting(today)}${firstName ? `, ${firstName}` : ""}`
  const dateLine = `${WEEKDAYS[today.getDay()]}, ${today.getDate()} ${MONTHS[today.getMonth()]}`

  const openRecord = (target: AttentionItem["target"]) => {
    feedback.tap()
    navigation.navigate(target.screen, { id: target.id })
  }
  const openInsights = (section?: InsightSection) => {
    feedback.tap()
    navigation.navigate("Insights", { range, section })
  }

  const nothingGranted = !access.leads && !access.quotes
  const shown = expanded ? attention : attention.slice(0, COLLAPSED)

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
        title={title}
        subtitle={dateLine}
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <>
            <AnuButton />
            <IconButton name="search" onPress={() => navigation.navigate("Search")} accessibilityLabel="Search everything" />
            <NotificationBell />
          </>
        }
        list={{
          data: [],
          renderItem: () => null,
          refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />

        {/* ---- 0. attendance: every role's first action of the day ---- */}
        <AttendanceHomeCard />

        {/* ---- 1. shortcuts ---- */}
        {!nothingGranted && (
          <View style={styles.quickRow}>
            {access.quotes && (
              <QuickAction icon="quote" label="New quote" onPress={() => navigation.navigate("QuotationEditor")} />
            )}
            {access.customers && (
              <QuickAction icon="customer" label="Add customer" onPress={() => navigation.navigate("ContactEditor")} />
            )}
            {access.leads && <QuickAction icon="leads" label="Leads" onPress={() => navigation.navigate("Leads")} />}
            <QuickAction icon="insights" label="Insights" onPress={() => openInsights()} />
          </View>
        )}

        {/* ---- the AI assistant, one tap from launch ---- */}
        <AnuHomeCard />

        {nothingGranted ? (
          <EmptyState
            icon="info"
            title="Nothing to show here yet"
            hint="Your account is set up for attendance. Leads and quotations appear here if an admin grants them."
          />
        ) : loading ? (
          <>
            <SkeletonPanel lines={3} />
            <SkeletonPanel block={140} lines={2} />
            <SkeletonPanel block={132} lines={1} />
          </>
        ) : (
          <FadeIn>
            {/* ---- 2. what needs doing ---- */}
            <Panel title="Needs you today" meta={attention.length ? `${attention.length}` : undefined}>
              {attention.length === 0 ? (
                <View style={styles.clear}>
                  <View style={[styles.clearWell, { backgroundColor: t.successBg }]}>
                    <Icon name="tick" size={22} color={t.success} variant="Bulk" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[textVariants.bodyStrong, { color: t.text }]}>You're all caught up</Text>
                    <Text style={[textVariants.small, { color: t.textTertiary }]}>
                      No lead is waiting and no quote is about to lapse.
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  {shown.map((it, i) => (
                    <View key={it.id}>
                      {i > 0 && <RowSeparator />}
                      <ListRow
                        leadingIcon={it.icon}
                        leadingTone={it.tone}
                        title={it.title}
                        titleLines={1}
                        subtitle={it.detail}
                        value={it.amount ? money(it.amount) : undefined}
                        chevron={false}
                        trailing={
                          it.phone ? (
                            <View style={styles.callSlot}>
                              <PressScale
                                onPress={() => void callNumber(it.phone)}
                                hitSlop={6}
                                scaleTo={0.86}
                                accessibilityLabel={`Call ${it.title}`}
                                style={[styles.callButton, { backgroundColor: t.successBg }]}
                              >
                                <Icon name="call" size={18} color={t.successText} variant="Bold" />
                              </PressScale>
                            </View>
                          ) : null
                        }
                        onPress={() => openRecord(it.target)}
                      />
                    </View>
                  ))}
                  {attention.length > COLLAPSED && (
                    <>
                      <RowSeparator />
                      <Pressable
                        onPress={() => {
                          feedback.select()
                          // The extra rows slide the page open rather than jump it.
                          if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(260, "easeInEaseOut", "opacity"))
                          setExpanded((x) => !x)
                          Animated.spring(chevron, { toValue: expanded ? 0 : 1, damping: 16, stiffness: 240, useNativeDriver: true }).start()
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        style={({ pressed }) => [styles.more, { opacity: pressed ? state.pressedOpacity : 1 }]}
                      >
                        <Text style={[textVariants.smallStrong, { color: t.primary }]}>
                          {expanded ? "Show less" : `Show all ${attention.length}`}
                        </Text>
                        <Animated.View
                          style={{ transform: [{ rotate: chevron.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}
                        >
                          <Icon name="down" size={16} color={t.primary} />
                        </Animated.View>
                      </Pressable>
                    </>
                  )}
                </>
              )}
            </Panel>

            {/* ---- 3. how the period is going ---- */}
            <Panel title="Performance" padded>
              <View style={{ marginBottom: spacing.lg }}>{periods}</View>

              {access.quotes && (
                <View>
                  <Text style={[textVariants.small, { color: t.textSecondary }]}>Quoted in the last {r.label}</Text>
                  <View style={styles.heroLine}>
                    <CountUp
                      value={d.quoted.value}
                      format={(n) => formatCurrency(Math.round(n), { compact: d.quoted.value >= 1e5 })}
                      style={[textVariants.statLarge, { color: t.text, flexShrink: 1 }]}
                      adjustsFontSizeToFit
                    />
                    <DeltaText delta={d.quoted.delta} />
                  </View>
                  <Text style={[textVariants.small, { color: t.textTertiary }]}>
                    {compareWords(d.quoted.delta, d.quoted.prevValue, r.noun, money, "quoted")}
                  </Text>
                  {/* A running total against last period's, not a per-day line: the
                      question is "am I ahead of where we were", and only a pace
                      chart answers it on any day of the window. Drag to scrub. */}
                  <View style={{ marginTop: spacing.lg }}>
                    <PaceChart
                      current={d.pace.current}
                      previous={d.pace.previous}
                      labels={d.pace.labels}
                      format={money}
                      color={t.primary}
                      names={[`Last ${r.label}`, `The ${r.noun}`]}
                    />
                  </View>
                  <View style={[styles.wonStrip, { backgroundColor: t.surfaceInset }]}>
                    <View style={[styles.wonDot, { backgroundColor: t.success }]} />
                    <Text style={[textVariants.smallStrong, { color: t.text, flex: 1 }]} numberOfLines={1}>
                      {money(d.won.value)} won from {d.won.count} quote{d.won.count === 1 ? "" : "s"}
                    </Text>
                    <DeltaText delta={d.won.delta} />
                  </View>
                </View>
              )}

              <View style={{ marginTop: access.quotes ? spacing.lg : 0 }}>
                <TileGrid>
                  {access.leads && (
                    <Tile
                      label="New leads"
                      value={formatNumber(d.leads.total)}
                      count={{ value: d.leads.total, format: (n) => formatNumber(Math.round(n)) }}
                      delta={<DeltaText delta={d.leads.delta} />}
                      note={d.uncontacted ? `${d.uncontacted} waiting` : undefined}
                      chart={<MiniColumns values={d.trend.map((b) => b.web + b.voice)} color={t.primary} />}
                      onPress={() => navigation.navigate("Leads")}
                    />
                  )}
                  {access.quotes && (
                    <Tile
                      label="Win rate"
                      value={d.winRate.pct === null ? "–" : `${d.winRate.pct}%`}
                      count={d.winRate.pct === null ? undefined : { value: d.winRate.pct, format: (n) => `${Math.round(n)}%` }}
                      delta={
                        d.winRate.pct !== null && d.winRate.prevPct !== null ? (
                          <DeltaText points delta={delta(d.winRate.pct, d.winRate.prevPct)} />
                        ) : undefined
                      }
                      note={d.winRate.decided ? `${d.winRate.won} of ${d.winRate.decided}` : "None decided"}
                      aside={<Ring pct={d.winRate.pct} color={t.primary} />}
                    />
                  )}
                  {access.quotes && access.leads && (
                    <Tile
                      label="Time to quote"
                      value={durationWords(d.timeToQuote.hours)}
                      delta={
                        d.timeToQuote.hours !== null && d.timeToQuote.prevHours !== null ? (
                          <DeltaText invert delta={delta(d.timeToQuote.hours, d.timeToQuote.prevHours)} />
                        ) : undefined
                      }
                      note={d.timeToQuote.samples ? "median" : "No linked quotes"}
                      chart={<SpeedScale step={speedStep(d.timeToQuote.hours)} />}
                    />
                  )}
                  {access.quotes && (
                    <Tile
                      label="Open pipeline"
                      value={money(d.openValue)}
                      count={{ value: d.openValue, format: (n) => money(Math.round(n)) }}
                      note={`${d.aging.reduce((s, a) => s + a.count, 0)} open`}
                      onPress={() => navigation.navigate("Quotes")}
                    />
                  )}
                </TileGrid>
              </View>
            </Panel>

            {/* ---- 4. leads over time ---- */}
            {access.leads && (
              <Panel title="Leads" meta={`Last ${r.label}`} action={<LinkText label="Open" onPress={() => navigation.navigate("Leads")} />} padded>
                <StackedColumns
                  unit="leads"
                  buckets={d.trend.map((b) => ({
                    label: b.label,
                    values: access.enquiries && access.voice ? [b.web, b.voice] : [access.enquiries ? b.web : b.voice],
                  }))}
                  colors={access.enquiries && access.voice ? [series.web, series.voice] : [series.web]}
                  names={access.enquiries && access.voice ? ["Website", "Anu calls"] : [access.enquiries ? "Website" : "Anu calls"]}
                />
              </Panel>
            )}

            {/* ---- 5. the quotation book ---- */}
            {access.quotes && (
              <Panel title="Pipeline" meta={`Last ${r.label}`} action={<LinkText label="All quotes" onPress={() => navigation.navigate("Quotes")} />} padded>
                {d.statusMix.length ? (
                  <>
                    <StackBar
                      segments={d.statusMix.map((s) => ({
                        key: s.id,
                        value: s.value || s.count,
                        color: statusFill(t, s.id),
                        label: statusMeta(QUOTATION_STATUS, s.id).label,
                        count: s.count,
                        display: money(s.value),
                      }))}
                    />
                  </>
                ) : (
                  <Text style={[textVariants.small, { color: t.textTertiary }]}>No quotations in the last {r.label}.</Text>
                )}

                <Text style={[textVariants.small, styles.agingHead, { color: t.textSecondary }]}>
                  Open quotes by age · follow up before they expire
                </Text>
                <View style={styles.agingRow}>
                  {d.aging.map((a) => {
                    const hot = a.count > 0 && a.tone !== "emerald"
                    return (
                      <View
                        key={a.key}
                        style={[styles.agingCell, { backgroundColor: hot ? t.tones[a.tone].bg : t.surfaceInset }]}
                        accessible
                        accessibilityLabel={`${a.count} open quotes aged ${a.label}, ${money(a.value)}`}
                      >
                        <Text style={[textVariants.amount, { color: hot ? t.tones[a.tone].fg : t.text }]}>{a.count}</Text>
                        <Text style={[textVariants.microLabel, { color: hot ? t.tones[a.tone].fg : t.textTertiary }]} numberOfLines={1}>
                          {a.label}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </Panel>
            )}

            {/* ---- 6. deeper, one tap away ---- */}
            <Panel title="Insights" action={<LinkText label="View all" onPress={() => openInsights()} />}>
              {access.leads && (
                <InsightRow
                  icon="leads"
                  title="Where leads come from"
                  subtitle={d.sources[0] ? `${d.sources[0].label} leads with ${d.sources[0].count}` : "No leads yet"}
                  onPress={() => openInsights("sources")}
                />
              )}
              {access.leads && (
                <InsightRow
                  icon="clock"
                  title="When leads arrive"
                  subtitle={
                    d.heatmap.peak
                      ? `Busiest ${d.heatmap.peak.day} ${d.heatmap.peak.band} · last 90 days`
                      : "Not enough leads yet"
                  }
                  onPress={() => openInsights("timing")}
                />
              )}
              {access.quotes && (
                <InsightRow
                  icon="product"
                  title="Most quoted products"
                  subtitle={d.topProducts[0] ? `${d.topProducts[0].name} · ${money(d.topProducts[0].value)}` : "Nothing quoted yet"}
                  onPress={() => openInsights("products")}
                />
              )}
              {access.quotes && (
                <InsightRow
                  icon="company"
                  title="Top customers"
                  subtitle={d.topCustomers[0] ? `${d.topCustomers[0].name} · ${money(d.topCustomers[0].value)}` : "No customers quoted yet"}
                  onPress={() => openInsights("customers")}
                />
              )}
              {access.quotes && (
                <InsightRow
                  icon="warning"
                  title="Why we lose"
                  subtitle={d.lostReasons[0] ? `${d.lostReasons[0].reason} · ${d.lostReasons[0].count}` : "No losses recorded"}
                  onPress={() => openInsights("losses")}
                />
              )}
              {access.admin && (
                <InsightRow
                  icon="website"
                  title="Website"
                  subtitle={
                    visitors
                      ? `${formatNumber(visitors.visitors)} visitors · ${formatNumber(visitors.quoteSessions)} opened the quote builder`
                      : web.error
                        ? "Could not load"
                        : "Loading…"
                  }
                  last
                  onPress={() => openInsights("website")}
                />
              )}
            </Panel>
          </FadeIn>
        )}
      </AppScreen>
    </View>
  )
}

// ---- pieces -------------------------------------------------------------------

function InsightRow({
  icon,
  title,
  subtitle,
  onPress,
  last,
}: {
  icon: React.ComponentProps<typeof ListRow>["leadingIcon"]
  title: string
  subtitle: string
  onPress: () => void
  last?: boolean
}) {
  return (
    <>
      <ListRow leadingIcon={icon} title={title} titleLines={1} subtitle={subtitle} onPress={onPress} />
      {!last && <RowSeparator />}
    </>
  )
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme()
  return (
    <Text
      onPress={() => {
        feedback.tap()
        onPress()
      }}
      accessibilityRole="link"
      suppressHighlighting
      style={[textVariants.smallStrong, { color: t.primary }]}
    >
      {label}
    </Text>
  )
}

const styles = StyleSheet.create({
  quickRow: {
    flexDirection: "row",
    paddingHorizontal: gutter - spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  clear: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingBottom: gutter },
  clearWell: { width: 44, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  callSlot: { marginLeft: spacing.md },
  callButton: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
  },
  heroLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  wonStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: spacing.md,
  },
  wonDot: { width: 8, height: 8, borderRadius: 4 },
  legendList: { marginTop: spacing.md, gap: 10 },
  legendRow: { flexDirection: "row", alignItems: "center" },
  legendCount: { marginLeft: "auto" },
  legendValue: { width: 72, textAlign: "right" },
  agingHead: { marginTop: spacing.xl, marginBottom: spacing.sm },
  agingRow: { flexDirection: "row", gap: 6 },
  agingCell: { flex: 1, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center" },
})
