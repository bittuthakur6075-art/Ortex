import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey, durationWords, summarizeDays, type DaySummary } from "@/domain/attendance"
import { myPunches } from "@/lib/attendance"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Badge, DataNotice, EmptyState, ListRefreshControl, ListRow, RowSeparator, SkeletonList } from "@/ui"

const DAY_MS = 86400000
const WINDOW_DAYS = 60

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })

type MonthSection = {
  key: string
  title: string
  totals: string
  data: DaySummary[]
}

/** "Fri 19 Sep" for an IST day key, formatted in UTC so the phone's zone cannot shift it. */
const dayLabel = (day: string) => DAY_LABEL.format(new Date(`${day}T00:00:00Z`)).replace(",", "")

function monthSections(days: DaySummary[]): MonthSection[] {
  const by = new Map<string, DaySummary[]>()
  for (const d of days) {
    const k = d.day.slice(0, 7)
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(d)
  }
  return [...by.entries()].map(([k, list]) => {
    const present = list.filter((d) => d.firstIn).length
    const minutes = list.reduce((s, d) => s + d.workedMin, 0)
    const flagged = list.reduce((s, d) => s + d.flagged, 0)
    const parts = [`${present} day${present === 1 ? "" : "s"}`, durationWords(minutes)]
    if (flagged) parts.push(`${flagged} to review`)
    return { key: k, title: MONTH_LABEL.format(new Date(`${k}-01T00:00:00Z`)), totals: parts.join(" · "), data: list }
  })
}

/**
 * My attendance: every day of the last 60 with a punch, newest first, grouped by
 * month with the month's totals. A day opens its timeline (each punch, its
 * selfie and where it was recorded).
 */
export default function AttendanceHistoryScreen({ navigation }: StackScreenProps<"AttendanceHistory">) {
  const t = useTheme()
  const [days, setDays] = React.useState<DaySummary[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const punches = await myPunches({ from: dayKey(Date.now() - WINDOW_DAYS * DAY_MS) })
      setDays(summarizeDays(punches))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your attendance.")
      setDays((d) => d ?? [])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const sections = React.useMemo(() => monthSections(days || []), [days])

  return (
    <AppScreen
      title="My attendance"
      subtitle={`Last ${WINDOW_DAYS} days`}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      sections={{
        sections,
        keyExtractor: (item) => (item as DaySummary).day,
        stickySectionHeadersEnabled: false,
        renderSectionHeader: ({ section }) => {
          const s = section as unknown as MonthSection
          return (
            <View style={[styles.month, { backgroundColor: t.background }]}>
              <Text style={[textVariants.sectionLabel, { color: t.textTertiary }]}>{s.title.toUpperCase()}</Text>
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>{s.totals}</Text>
            </View>
          )
        },
        renderItem: ({ item }) => {
          const d = item as DaySummary
          const rejected = d.punches.some((p) => p.review === "rejected")
          const span = d.open
            ? `On duty since ${d.firstIn ? clockIST(d.firstIn) : ""}`
            : d.firstIn
              ? `${clockIST(d.firstIn)} to ${d.lastOut ? clockIST(d.lastOut) : "no clock-out"}`
              : "Not accepted"
          return (
            <ListRow
              title={dayLabel(d.day)}
              subtitle={`${span}${d.field ? " · Field" : d.site ? ` · ${d.site}` : ""}`}
              value={d.firstIn ? durationWords(d.workedMin) : ""}
              leadingIcon={d.field ? "address" : "calendar"}
              leadingTone={d.flagged || rejected ? "amber" : "primary"}
              valueSub={
                d.flagged ? (
                  <Badge label="Review" tone="warning" />
                ) : rejected ? (
                  <Badge label="Not accepted" tone="danger" />
                ) : undefined
              }
              onPress={() => {
                feedback.tap()
                navigation.navigate("AttendanceDay", { day: d.day })
              }}
            />
          )
        },
        ItemSeparatorComponent: RowSeparator,
        ListEmptyComponent:
          days === null ? (
            <SkeletonList count={6} />
          ) : (
            <EmptyState
              icon="calendar"
              title="No attendance yet"
              hint="Clock in from Home and your days appear here, each with its selfie and hours."
            />
          ),
        refreshControl: (
          <ListRefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await load()
              setRefreshing(false)
            }}
          />
        ),
      }}
    >
      <DataNotice error={error} onRetry={() => void load()} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  month: {
    paddingHorizontal: gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.sm,
  },
})
