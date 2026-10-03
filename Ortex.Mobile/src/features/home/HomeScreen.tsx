import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { delhiWeather, weatherTint, type Weather } from "@/lib/weather"
import Icon from "@/ui/Icon"

import { RANGES, delta, rangeFor, type AttentionItem, type Delta, type RangeKey } from "@/domain/dashboard"
import { formatCurrency, formatNumber } from "@/domain/format"
import { canAccess } from "@/domain/modules"
import AnuHomeCard from "@/features/anu/AnuHomeCard"
import AttendanceHomeCard from "@/features/attendance/AttendanceHomeCard"
import { useAttendanceNotices } from "@/features/attendance/useAttendance"
import ChatButton from "@/features/chat/ChatButton"
import NotificationBell from "@/features/notifications/NotificationBell"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useIsDark, useTheme } from "@/store/ThemeContext"
import { fontFamily } from "@/theme/typography"
import AppScreen from "@/ui/AppScreen"
import DataNotice from "@/ui/DataNotice"
import IconButton from "@/ui/IconButton"
import ListRefreshControl from "@/ui/ListRefreshControl"
import { Card, CardRow, CardRows, SubHeader, Tag } from "@/ui/OneUi"
import ProfileAvatarButton from "@/ui/ProfileAvatarButton"
import SegmentedControl from "@/ui/SegmentedControl"
import { SkeletonPanel } from "@/ui/Skeleton"

import {
  AgeCells,
  ApprovalsCard,
  CardHead,
  Columns,
  ComingUpCard,
  DeltaTag,
  InsetTile,
  LeaveBalanceGrid,
  NeedsYouCard,
  PayCard,
  QuickActionsCard,
  QuotesCard,
  RequestsCard,
  Widget,
  WidgetGrid,
} from "@/features/home/homeCards"
import { useDashboard } from "@/features/home/useDashboard"

/**
 * HOME, the first tab: the Figma "V2 · One UI 8 · Mobile Home by role" pages,
 * card for card. One shell for everyone (greeting, Anu, search, bell, attendance
 * first); what follows is built for the job of each role:
 *
 *   · STAFF (and Accounts, whose own work the phone does not carry yet): the
 *     full attendance card, shortcuts, your requests, leave balance, pay, the
 *     next holiday. Nothing they cannot act on.
 *   · SALES: attendance collapses to one row once checked in; then what needs a
 *     call now, shortcuts, the month in one card, quotes by age.
 *   · ADMINS: approvals decided in place, the two most urgent sales items,
 *     shortcuts, the business as four widgets.
 *
 * Every figure still comes from useDashboard → domain/dashboard.ts (shared with
 * Insights), and every card is gated on its module exactly as the tabs are.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const money = (n: number) => (n ? formatCurrency(n, { compact: true }) : "₹0")

function greeting(now: Date) {
  const h = now.getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

/** "₹1.2L more than the previous 30 days", the comparison a person reads. */
function compareWords(dl: Delta, previous: number, noun: string) {
  if (!previous && dl.diff === 0) return `Nothing quoted in this period or the ${noun}`
  if (!previous) return `Nothing quoted in the ${noun}`
  if (dl.dir === "flat") return `Same as the ${noun}`
  return `${money(Math.abs(dl.diff))} ${dl.dir === "up" ? "more" : "less"} than the ${noun}`
}

/** A running total as the step each bucket added, the last 14. */
const steps = (running: number[]) => running.map((v, i) => Math.max(0, v - (running[i - 1] ?? 0))).slice(-14)

export default function HomeScreen({ navigation }: TabScreenProps<"Home">) {
  const t = useTheme()
  const [range, setRange] = React.useState<RangeKey>("30d")
  // The control follows the thumb at once; the page recomputes on the next frame.
  const shownRange = React.useDeferredValue(range)
  const { d, attention, now, access, profile, loading, refreshing, error, fromCache, cachedAt, reload } =
    useDashboard(shownRange)
  const notices = useAttendanceNotices()
  const r = rangeFor(shownRange)

  const staff = !access.leads && !access.quotes
  const admin = access.admin
  const today = new Date(now)
  const fullName = (profile?.name || "").trim().replace(/\s+/g, " ")
  // An initial ("S L Thakur") is no name to greet: show the whole name instead.
  const first = fullName.split(" ")[0]
  const firstName = first.replace(/\./g, "").length <= 1 ? fullName : first
  const title = `${greeting(today)}${firstName ? `, ${firstName}` : ""}`
  const dateLine = `${WEEKDAYS[today.getDay()].slice(0, 3)}, ${today.getDate()} ${MONTHS[
    today.getMonth()
  ].slice(0, 3)}`
  const expiring = attention.filter((i) => i.target.screen === "QuotationDetail").length

  const openRecord = (it: AttentionItem) => navigation.navigate(it.target.screen, { id: it.target.id })
  const openInsights = () => navigation.navigate("Insights", { range })

  const actions = staff
    ? [
        { icon: "calendar" as const, label: "Apply Leave", onPress: () => navigation.navigate("LeaveApply") },
        { icon: "invoice" as const, label: "New Claim", onPress: () => navigation.navigate("PayClaimNew") },
        { icon: "clock" as const, label: "Fix a Punch", onPress: () => navigation.navigate("Attendance") },
        { icon: "enquiry" as const, label: "Team Chat", onPress: () => navigation.navigate("Chat") },
      ]
    : admin
    ? [
        { icon: "quote" as const, label: "New Quote", onPress: () => navigation.navigate("QuotationEditor") },
        {
          icon: "tick" as const,
          label: "Approvals",
          tone: "violet" as const,
          onPress: () => navigation.navigate("AttendanceApprovals"),
        },
        { icon: "team" as const, label: "Team", onPress: () => navigation.navigate("Team") },
        { icon: "insights" as const, label: "Insights", onPress: openInsights },
      ]
    : [
        access.quotes && {
          icon: "quote" as const,
          label: "New Quote",
          onPress: () => navigation.navigate("QuotationEditor"),
        },
        access.customers && {
          icon: "customer" as const,
          label: "Add Customer",
          onPress: () => navigation.navigate("ContactEditor"),
        },
        access.leads && {
          icon: "leads" as const,
          label: "Leads",
          onPress: () => navigation.navigate("Leads"),
        },
        { icon: "enquiry" as const, label: "Team Chat", onPress: () => navigation.navigate("Chat") },
      ].filter(
        (a): a is { icon: "quote" | "customer" | "leads" | "enquiry"; label: string; onPress: () => void } =>
          Boolean(a),
      )

  return (
    <View style={{ flex: 1, backgroundColor: t.surfaceInset }}>
      <AppScreen
        title={title}
        subtitle={dateLine}
        titleSize={24}
        titleTop={20}
        barSubtitle={firstName || dateLine}
        subtitleStrong
        barTitle={greeting(today)}
        titleRight={<WeatherNow />}
        barTitleRight={<WeatherNow compact />}
        inset
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <>
            <IconButton
              name="search"
              onPress={() => navigation.navigate("Search")}
              accessibilityLabel="Search everything"
            />
            <ChatButton />
            <NotificationBell />
          </>
        }
        list={{
          data: [],
          renderItem: () => null,
          refreshControl: (
            <ListRefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                await Promise.all([reload(), notices.reload()])
              }}
            />
          ),
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />

        {/* The day in words, under the greeting (Figma "Summary" pills). */}
        {!staff && !loading && (attention.length > 0 || expiring > 0) ? (
          <View style={styles.summary}>
            {attention.length ? <Tag label={`${attention.length} need you`} tone="primary" dot /> : null}
            {expiring ? (
              <Tag label={`${expiring} quote${expiring === 1 ? "" : "s"} to chase`} tone="warning" dot />
            ) : null}
          </View>
        ) : null}

        {/* Attendance first for everyone; collapsed to a row once in, except for
            Staff, whose day is the clock. */}
        <AttendanceHomeCard collapse={!staff} />

        {admin && canAccess(profile, "attendance-team") ? (
          <ApprovalsCard onAll={() => navigation.navigate("AttendanceApprovals")} />
        ) : null}

        {!staff ? (
          loading ? (
            <SkeletonPanel lines={3} />
          ) : (
            <NeedsYouCard
              items={attention}
              limit={admin ? 2 : 4}
              onOpen={openRecord}
              onAll={() => navigation.navigate("Leads")}
            />
          )
        ) : null}

        <QuickActionsCard items={actions} />

        {!staff && access.quotes ? <QuotesCard onAll={() => navigation.navigate("Quotes")} /> : null}

        {staff ? (
          <>
            <RequestsCard
              onLeave={() => navigation.navigate("Leave")}
              onClaims={() => navigation.navigate("PayClaims")}
            />
            <LeaveBalanceGrid onOpen={() => navigation.navigate("Leave")} />
            <PayCard onOpen={(id) => navigation.navigate("Payslip", { id })} />
            <ComingUpCard holiday={notices.nextHoliday} />
          </>
        ) : loading ? null : admin ? (
          <>
            <SubHeader title={`Business, last ${r.label}`} action="Insights" onAction={openInsights} />
            <WidgetGrid>
              <Widget
                icon="quote"
                tone="primary"
                label="Quoted"
                value={money(d.quoted.value)}
                tag={<DeltaTag d={d.quoted.delta} />}
                note={`${formatNumber(d.quoted.count)} quotations`}
              />
              <Widget
                icon="tick"
                tone="success"
                label="Won"
                value={money(d.won.value)}
                tag={<DeltaTag d={d.won.delta} />}
                note={`${formatNumber(d.won.count)} orders`}
              />
              <Widget
                icon="leads"
                tone="primary"
                label="New leads"
                value={formatNumber(d.leads.total)}
                tag={<DeltaTag d={d.leads.delta} />}
                note={`Web ${formatNumber(d.leads.web)} · Anu ${formatNumber(d.leads.voice)}`}
              />
              <Widget
                icon="insights"
                tone="violet"
                label="Win rate"
                value={d.winRate.pct === null ? "–" : `${d.winRate.pct}%`}
                tag={
                  d.winRate.pct !== null && d.winRate.prevPct !== null ? (
                    <DeltaTag points d={delta(d.winRate.pct, d.winRate.prevPct)} />
                  ) : undefined
                }
                note={d.winRate.decided ? `${d.winRate.won} of ${d.winRate.decided} decided` : "None decided"}
              />
            </WidgetGrid>
          </>
        ) : (
          <>
            {/* The month in one card: range, one number said in words, the steps
                behind it, then four tiles. */}
            <Card style={styles.headed}>
              <CardHead
                icon="insights"
                tone="success"
                title="My Month"
                action="Insights"
                onAction={openInsights}
              />
              <View style={styles.seg}>
                <SegmentedControl
                  options={RANGES.map((x) => ({ key: x.key, label: x.label }))}
                  value={range}
                  onChange={(k) => {
                    feedback.select()
                    setRange(k)
                  }}
                />
              </View>
              {access.quotes ? (
                <>
                  <View style={styles.hero}>
                    <Text style={[styles.heroLabel, { color: t.textTertiary }]}>Quoted</Text>
                    <View style={styles.heroLine}>
                      <Text
                        style={[styles.heroValue, { color: t.text }]}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        {money(d.quoted.value)}
                      </Text>
                      <DeltaTag d={d.quoted.delta} />
                    </View>
                    <Text style={[styles.heroLabel, { color: t.textTertiary }]}>
                      {compareWords(d.quoted.delta, d.quoted.prevValue, r.noun)}
                    </Text>
                  </View>
                  <Columns values={steps(d.pace.current)} />
                </>
              ) : null}
              <View style={styles.tiles}>
                <View style={styles.tileRow}>
                  {access.quotes ? (
                    <InsetTile
                      label="Won"
                      value={money(d.won.value)}
                      tag={<DeltaTag d={d.won.delta} />}
                      note={`${d.won.count} quote${d.won.count === 1 ? "" : "s"}`}
                    />
                  ) : null}
                  {access.quotes ? (
                    <InsetTile
                      label="Win rate"
                      value={d.winRate.pct === null ? "–" : `${d.winRate.pct}%`}
                      tag={
                        d.winRate.pct !== null && d.winRate.prevPct !== null ? (
                          <DeltaTag points d={delta(d.winRate.pct, d.winRate.prevPct)} />
                        ) : undefined
                      }
                      note={
                        d.winRate.decided
                          ? `${d.winRate.won} of ${d.winRate.decided} decided`
                          : "None decided"
                      }
                    />
                  ) : null}
                </View>
                <View style={styles.tileRow}>
                  {access.leads ? (
                    <InsetTile
                      label="New leads"
                      value={formatNumber(d.leads.total)}
                      tag={<DeltaTag d={d.leads.delta} />}
                      note={d.uncontacted ? `${d.uncontacted} waiting` : "None waiting"}
                    />
                  ) : null}
                  {access.quotes ? (
                    <InsetTile
                      label="Open"
                      value={money(d.openValue)}
                      note={`${d.aging.reduce((s, a) => s + a.count, 0)} quotes`}
                    />
                  ) : null}
                </View>
              </View>
            </Card>

            {access.quotes ? (
              <Card style={styles.headed}>
                <CardHead
                  icon="quote"
                  tone="warning"
                  title="Quotes by Age"
                  action="All"
                  onAction={() => navigation.navigate("Quotes")}
                />
                <Text style={[styles.caption, { color: t.textTertiary }]}>
                  Chase the amber and red ones before they lapse
                </Text>
                <AgeCells cells={d.aging} />
              </Card>
            ) : null}
          </>
        )}

        {admin ? (
          <>
            <SubHeader title="Team and pay" />
            <Card>
              <CardRows>
                <CardRow
                  icon="team"
                  title="Team Attendance"
                  subtitle="Who is in today, and who is not yet"
                  onPress={() => navigation.navigate("TeamAttendance")}
                />
                <CardRow
                  icon="wallet"
                  tone="primary"
                  title="Payments"
                  subtitle="Received and paid out, record one"
                  onPress={() => navigation.navigate("Payments")}
                />
                <CardRow
                  icon="money"
                  tone="success"
                  title="My Payslips"
                  subtitle="Payslips, salary and claims"
                  onPress={() => navigation.navigate("Pay")}
                />
              </CardRows>
            </Card>
          </>
        ) : null}

        <AnuHomeCard />
      </AppScreen>
    </View>
  )
}

/** One UI Weather's widget in miniature: glyph and temperature, then city and the day's range.
 *  Compact (the scrolled bar): glyph and temperature only. */
function WeatherNow({ compact = false }: { compact?: boolean }) {
  const dark = useIsDark()
  const t = useTheme()
  const [w, setW] = React.useState<Weather | null>(null)
  useFocusEffect(
    React.useCallback(() => {
      let alive = true
      const load = () => void delhiWeather().then((x) => alive && x && setW(x))
      load()
      // Open-Meteo's "current" moves every 15 minutes; follow it while Home is open.
      const timer = setInterval(load, 10 * 60000)
      return () => {
        alive = false
        clearInterval(timer)
      }
    }, []),
  )
  if (!w) return null
  const tint = weatherTint(w, dark)
  if (compact)
    return (
      <View
        style={[styles.weatherTop, styles.weatherPill, { backgroundColor: t.surfaceInset }]}
        accessibilityLabel={`Delhi, ${w.label}, ${w.temp} degrees`}
      >
        <Icon name={w.icon} size={18} color={tint} variant="Bulk" />
        <Text style={[styles.weatherTempSmall, { color: t.text }]}>{`${w.temp}°`}</Text>
      </View>
    )
  return (
    <View style={styles.weather} accessibilityLabel={`Delhi, ${w.label}, ${w.temp} degrees`}>
      <View style={styles.weatherTop}>
        <Icon name={w.icon} size={26} color={tint} variant="Bulk" />
        <Text style={[styles.weatherTemp, { color: t.text }]}>{`${w.temp}°`}</Text>
      </View>
      <Text style={[styles.weatherMeta, { color: t.textSecondary }]} numberOfLines={1}>
        {`Delhi · ${w.high}° / ${w.low}°`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  weather: { alignItems: "flex-end", gap: 2 },
  weatherTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  weatherPill: { paddingVertical: 4, paddingLeft: 8, paddingRight: 10, borderRadius: 999 },
  weatherTemp: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 28,
    fontVariant: ["tabular-nums"],
  },
  weatherTempSmall: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
  weatherMeta: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 26, paddingBottom: 14 },
  headed: { paddingTop: 18, paddingBottom: 4 },
  seg: { paddingHorizontal: 16, paddingBottom: 14 },
  hero: { paddingHorizontal: 20, paddingBottom: 6, gap: 4 },
  heroLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroLabel: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 18 },
  heroValue: {
    fontFamily: fontFamily.display,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  tiles: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tileRow: { flexDirection: "row", gap: 8 },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
})
