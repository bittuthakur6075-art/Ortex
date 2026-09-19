import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { daysWords, type LeaveBalance, type LeaveRequest } from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { addDays, leaveDatesWords, todayIST } from "@/features/leave/leaveFormat"
import { LeaveStatusPill } from "@/features/leave/leaveUi"
import { feedback } from "@/lib/feedback"
import { holidays as loadHolidays, type Holiday } from "@/lib/attendance"
import { balances as loadBalances, myRequests } from "@/lib/leave"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  Card,
  DataNotice,
  EmptyState,
  ListRefreshControl,
  ListRow,
  Panel,
  RowSeparator,
  SkeletonPanel,
} from "@/ui"

/**
 * Leave, the page (Remote / Gusto references): what I have left, first, as
 * numbers; then the one action; then what is coming (approved leave), what I
 * asked for, and the holidays. A balance opens its history, because "why is
 * it 4.5?" deserves the ledger that makes it 4.5.
 */
export default function LeaveScreen({ navigation }: StackScreenProps<"Leave">) {
  const t = useTheme()
  const [bal, setBal] = React.useState<LeaveBalance[] | null>(null)
  const [requests, setRequests] = React.useState<LeaveRequest[] | null>(null)
  const [hols, setHols] = React.useState<Holiday[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(async () => {
    const today = todayIST()
    try {
      const [b, r] = await Promise.all([loadBalances(), myRequests()])
      setBal(b)
      setRequests(r)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your leave.")
      setBal((b) => b ?? [])
      setRequests((r) => r ?? [])
    }
    setHols(await loadHolidays({ from: today, to: addDays(today, 365) }).catch(() => []))
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  const today = todayIST()
  const upcoming = (requests || [])
    .filter((r) => r.status === "approved" && r.to_day >= today)
    .sort((a, b) => (a.from_day < b.from_day ? -1 : 1))
  const loading = bal === null || requests === null

  const apply = () => {
    feedback.tap()
    navigation.navigate("LeaveApply", {})
  }

  return (
    <AppScreen
      title="Leave"
      subtitle="Balances, requests and holidays"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      list={{
        data: [],
        renderItem: () => null,
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
      {loading ? (
        <>
          <SkeletonPanel lines={2} block={150} />
          <SkeletonPanel lines={3} />
        </>
      ) : (
        <>
          <Panel title="Balances">
            {bal!.length === 0 ? (
              <Text style={[textVariants.small, styles.pad, { color: t.textTertiary }]}>
                No leave types are set up yet.
              </Text>
            ) : (
              <View style={styles.grid}>
                {bal!.map((b) => (
                  <View key={b.code} style={styles.tileWrap}>
                    <Card
                      inset
                      padding={spacing.md}
                      accessibilityLabel={`${b.name}, ${b.accrual === "none" ? "unpaid" : `${b.available} days available`}`}
                      onPress={
                        b.accrual === "none"
                          ? undefined
                          : () => {
                              feedback.tap()
                              navigation.navigate("LeaveLedger", { code: b.code, name: b.name })
                            }
                      }
                    >
                      <Text style={[textVariants.caption, { color: t.textTertiary }]} numberOfLines={1}>
                        {b.name}
                      </Text>
                      {b.accrual === "none" ? (
                        <Text style={[styles.big, { color: t.textSecondary }]}>Unpaid</Text>
                      ) : (
                        <Text style={[styles.big, { color: b.available > 0 ? t.text : t.textTertiary }]}>
                          {Number.isInteger(b.available) ? b.available : b.available.toFixed(1)}
                        </Text>
                      )}
                      <Text style={[textVariants.caption, { color: t.textTertiary }]} numberOfLines={2}>
                        {b.accrual === "none"
                          ? "Loss of pay, no balance"
                          : `${daysWords(b.taken_year)} taken this year${b.pending ? `, ${daysWords(b.pending)} pending` : ""}`}
                      </Text>
                    </Card>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.applyWrap}>
              <Button label="Apply for leave" icon="add" fullWidth onPress={apply} />
            </View>
          </Panel>

          {upcoming.length > 0 && (
            <Panel title="Coming up" meta={`${upcoming.length}`}>
              {upcoming.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 && <RowSeparator />}
                  <ListRow
                    leadingIcon="calendar"
                    leadingTone="emerald"
                    title={leaveDatesWords(r)}
                    subtitle={`${bal!.find((b) => b.code === r.type_code)?.name || r.type_code} · ${daysWords(r.days)}`}
                    onPress={() => navigation.navigate("LeaveRequest", { id: r.id })}
                  />
                </React.Fragment>
              ))}
            </Panel>
          )}

          <Panel title="My requests" meta={requests!.length ? `${requests!.length}` : undefined}>
            {requests!.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No leave requests yet"
                hint="Apply for leave here. An admin approves it, and your balance and attendance update on their own."
              />
            ) : (
              requests!.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 && <RowSeparator />}
                  <ListRow
                    title={bal!.find((b) => b.code === r.type_code)?.name || r.type_code}
                    subtitle={leaveDatesWords(r)}
                    value={daysWords(r.days)}
                    valueSub={<LeaveStatusPill status={r.status} />}
                    onPress={() => {
                      feedback.tap()
                      navigation.navigate("LeaveRequest", { id: r.id })
                    }}
                  />
                </React.Fragment>
              ))
            )}
          </Panel>

          <Panel title="Holidays" meta={hols.length ? `${hols.length}` : undefined}>
            {hols.length === 0 ? (
              <Text style={[textVariants.small, styles.pad, { color: t.textTertiary }]}>
                No holidays in the next year yet. The Super Admin adds them.
              </Text>
            ) : (
              hols.map((h, i) => (
                <React.Fragment key={h.id}>
                  {i > 0 && <RowSeparator />}
                  <ListRow
                    leadingIcon="calendar"
                    leadingTone={h.kind === "national" ? "primary" : "violet"}
                    title={h.name}
                    subtitle={`${dayLabel(h.day)}${h.kind === "optional" ? " · Optional" : h.kind === "national" ? " · National" : ""}`}
                    chevron={false}
                  />
                </React.Fragment>
              ))
            )}
          </Panel>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter - spacing.xs, paddingBottom: spacing.sm },
  tileWrap: { width: "50%", padding: spacing.xs },
  big: { fontFamily: font.bold, fontSize: 28, lineHeight: 34, fontVariant: ["tabular-nums"], marginVertical: 2 },
  applyWrap: { paddingHorizontal: gutter, paddingBottom: spacing.md, paddingTop: spacing.xs },
})
