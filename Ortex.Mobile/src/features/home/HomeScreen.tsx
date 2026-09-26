import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { RANGES, delta, rangeFor, type AttentionItem, type Delta, type RangeKey } from "@/domain/dashboard"
import { formatCurrency, formatNumber } from "@/domain/format"
import AnuButton from "@/features/anu/AnuButton"
import AnuHomeCard from "@/features/anu/AnuHomeCard"
import AttendanceHomeCard from "@/features/attendance/AttendanceHomeCard"
import { useAttendanceNotices } from "@/features/attendance/useAttendance"
import NotificationBell from "@/features/notifications/NotificationBell"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { fontFamily } from "@/theme/typography"
import AppScreen from "@/ui/AppScreen"
import DataNotice from "@/ui/DataNotice"
import IconButton from "@/ui/IconButton"
import ListRefreshControl from "@/ui/ListRefreshControl"
import { Card, SubHeader, Tag } from "@/ui/OneUi"
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

const money = (n: number) => formatCurrency(n, { compact: true })

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
  const firstName = (profile?.name || "").trim().split(/\s+/)[0]
  const title = `${greeting(today)}${firstName ? `, ${firstName}` : ""}`
  const dateLine = `${WEEKDAYS[today.getDay()]}, ${today.getDate()} ${MONTHS[today.getMonth()]}`
  const expiring = attention.filter((i) => i.target.screen === "QuotationDetail").length

  const openRecord = (it: AttentionItem) => navigation.navigate(it.target.screen, { id: it.target.id })
  const openInsights = () => navigation.navigate("Insights", { range })

  const actions = staff
    ? [
        { icon: "calendar" as const, label: "Apply leave", onPress: () => navigation.navigate("LeaveApply") },
        { icon: "invoice" as const, label: "New claim", onPress: () => navigation.navigate("PayClaimNew") },
        { icon: "clock" as const, label: "Fix a punch", onPress: () => navigation.navigate("Attendance") },
        { icon: "enquiry" as const, label: "Team chat", onPress: () => navigation.navigate("Chat") },
      ]
    : admin
    ? [
        { icon: "quote" as const, label: "New quote", onPress: () => navigation.navigate("QuotationEditor") },
        {
          icon: "tick" as const,
          label: "Approvals",
          tone: "violet" as const,
          onPress: () => navigation.navigate("AttendanceApprovals"),
        },
        { icon: "team" as const, label: "Team", onPress: () => navigation.navigate("Team") },
        access.social
          ? {
              icon: "share" as const,
              label: "Social",
              tone: "danger" as const,
              onPress: () => navigation.navigate("Social"),
            }
          : { icon: "insights" as const, label: "Insights", onPress: openInsights },
      ]
    : [
        access.quotes && {
          icon: "quote" as const,
          label: "New quote",
          onPress: () => navigation.navigate("QuotationEditor"),
        },
        access.customers && {
          icon: "customer" as const,
          label: "Add customer",
          onPress: () => navigation.navigate("ContactEditor"),
        },
        access.leads && {
          icon: "leads" as const,
          label: "Leads",
          onPress: () => navigation.navigate("Leads"),
        },
        { icon: "enquiry" as const, label: "Team chat", onPress: () => navigation.navigate("Chat") },
      ].filter(
        (a): a is { icon: "quote" | "customer" | "leads" | "enquiry"; label: string; onPress: () => void } =>
          Boolean(a),
      )

  return (
    <View style={{ flex: 1, backgroundColor: t.surfaceInset }}>
      <AppScreen
        title={title}
        subtitle={dateLine}
        inset
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <>
            <AnuButton />
            <IconButton
              name="search"
              onPress={() => navigation.navigate("Search")}
              accessibilityLabel="Search everything"
            />
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

        {admin ? <ApprovalsCard onAll={() => navigation.navigate("AttendanceApprovals")} /> : null}

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
                title="My month"
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
                  title="Quotes by age"
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

        <AnuHomeCard />
      </AppScreen>
    </View>
  )
}

const styles = StyleSheet.create({
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
