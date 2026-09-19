import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { type LeaveBalance, type LeaveRequest } from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { addDays, todayIST } from "@/features/leave/leaveFormat"
import {
  BalanceTile,
  BalanceTileSkeleton,
  DateBadge,
  LeaveRow,
  LeaveRowSkeleton,
} from "@/features/leave/leaveUi"
import { TILE } from "@/features/leave/leaveLook"
import { feedback } from "@/lib/feedback"
import { holidays as loadHolidays, type Holiday } from "@/lib/attendance"
import { balances as loadBalances, myRequests, whoIsOut, type NamedLeave } from "@/lib/leave"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  Button,
  DataNotice,
  EmptyState,
  ListRefreshControl,
  Panel,
  RowSeparator,
  SegmentedControl,
  Skeleton,
} from "@/ui"

type Tab = "upcoming" | "history"

/** Holidays shown before "Show all", so the requests are not pushed off the page. */
const HOLIDAYS_SHOWN = 4

/**
 * Leave, the page (Zoho People's Leave Tracker): a rail of balance tiles, one
 * per leave type, with what is AVAILABLE as the big figure and what is booked
 * under it; who else is out this week; then my requests behind an Upcoming /
 * History switch; then the holidays. "Apply leave" is pinned at the foot, the
 * one action this page exists for. A tile opens that type's ledger, because
 * "why is it 4.5?" deserves the history that makes it 4.5.
 */
export default function LeaveScreen({ navigation }: StackScreenProps<"Leave">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const [bal, setBal] = React.useState<LeaveBalance[] | null>(null)
  const [requests, setRequests] = React.useState<LeaveRequest[] | null>(null)
  const [hols, setHols] = React.useState<Holiday[]>([])
  const [team, setTeam] = React.useState<NamedLeave[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [tab, setTab] = React.useState<Tab>("upcoming")
  const [allHolidays, setAllHolidays] = React.useState(false)
  const [footerH, setFooterH] = React.useState(0)

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
    // Who else is out: RLS shows a colleague's leave only to someone with team
    // access, so for everyone else this is just their own and the panel hides.
    setTeam(await whoIsOut(today, addDays(today, 6)).catch(() => []))
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  const today = todayIST()
  const loading = bal === null || requests === null
  const typeName = (code: string) => bal?.find((b) => b.code === code)?.name || code

  const upcoming = (requests || [])
    .filter((r) => (r.status === "pending" || r.status === "approved") && r.to_day >= today)
    .sort((a, b) => (a.from_day < b.from_day ? -1 : 1))
  const history = (requests || [])
    .filter((r) => !upcoming.includes(r))
    .sort((a, b) => (a.from_day < b.from_day ? 1 : -1))
  const shown = tab === "upcoming" ? upcoming : history

  // One face per colleague, whoever has two requests in the week.
  const me = session?.user?.id
  const out = React.useMemo(() => {
    const seen = new Set<string>()
    return team.filter((r) => {
      if (r.user_id === me || seen.has(r.user_id)) return false
      seen.add(r.user_id)
      return true
    })
  }, [team, me])
  const outToday = out.filter((r) => r.from_day <= today && r.to_day >= today).length

  const visibleHols = allHolidays ? hols : hols.slice(0, HOLIDAYS_SHOWN)

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
        contentContainerStyle: { paddingBottom: footerH + spacing.lg },
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
      overlay={
        <View
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          style={[
            styles.footer,
            { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: insets.bottom + spacing.sm },
          ]}
        >
          <Button label="Apply leave" icon="add" fullWidth onPress={apply} />
        </View>
      }
    >
      <DataNotice error={error} onRetry={() => void load()} />
      {loading ? (
        <>
          <Panel title="Leave balance">
            <View style={styles.railSkeleton}>
              <BalanceTileSkeleton />
              <BalanceTileSkeleton />
              <BalanceTileSkeleton />
            </View>
          </Panel>
          <Panel title="My leave">
            <View style={styles.switchWrap}>
              <Skeleton height={44} radius={22} />
            </View>
            {[0, 1, 2].map((i) => (
              <React.Fragment key={i}>
                {i > 0 && <RowSeparator />}
                <LeaveRowSkeleton index={i} />
              </React.Fragment>
            ))}
          </Panel>
        </>
      ) : (
        <>
          <Panel title="Leave balance" meta={bal!.length ? "This year" : undefined}>
            {bal!.length === 0 ? (
              <Text style={[textVariants.small, styles.pad, { color: t.textTertiary }]}>
                No leave types are set up yet.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={TILE.width + spacing.sm}
                contentContainerStyle={styles.rail}
              >
                {bal!.map((b) => (
                  <BalanceTile
                    key={b.code}
                    b={b}
                    onPress={
                      b.accrual === "none"
                        ? undefined
                        : () => {
                            feedback.tap()
                            navigation.navigate("LeaveLedger", { code: b.code, name: b.name })
                          }
                    }
                  />
                ))}
              </ScrollView>
            )}
          </Panel>

          {out.length > 0 && (
            <Panel title="On leave this week" meta={outToday ? `${outToday} out today` : `${out.length}`}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.team}>
                {out.map((r) => {
                  const now = r.from_day <= today
                  return (
                    <View
                      key={r.user_id}
                      style={styles.person}
                      accessible
                      accessibilityLabel={`${r.person}, ${now ? `on leave until ${dayLabel(r.to_day)}` : `on leave from ${dayLabel(r.from_day)}`}`}
                    >
                      <Avatar name={r.person} uri={r.avatarUrl || undefined} size={48} />
                      <Text numberOfLines={1} style={[textVariants.captionStrong, { color: t.text, marginTop: 6 }]}>
                        {r.person.split(/\s+/)[0]}
                      </Text>
                      <Text numberOfLines={1} style={[textVariants.microLabel, { color: now ? t.warningText : t.textTertiary }]}>
                        {now ? (r.to_day === today ? "Today" : `Till ${dayLabel(r.to_day)}`) : dayLabel(r.from_day)}
                      </Text>
                    </View>
                  )
                })}
              </ScrollView>
            </Panel>
          )}

          <Panel title="My leave" meta={requests!.length ? `${requests!.length}` : undefined}>
            <View style={styles.switchWrap}>
              <SegmentedControl<Tab>
                options={[
                  { key: "upcoming", label: upcoming.length ? `Upcoming (${upcoming.length})` : "Upcoming" },
                  { key: "history", label: "History" },
                ]}
                value={tab}
                onChange={(v) => {
                  feedback.select()
                  setTab(v)
                }}
              />
            </View>
            {shown.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={tab === "upcoming" ? "Nothing coming up" : "No past leave"}
                hint={
                  tab === "upcoming"
                    ? "Leave you apply for shows here until it is over. An admin approves it, and your balance and attendance update on their own."
                    : "Leave that is over, rejected or cancelled is kept here."
                }
              />
            ) : (
              shown.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 && <RowSeparator />}
                  <LeaveRow
                    r={r}
                    typeName={typeName(r.type_code)}
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
              <>
                {visibleHols.map((h, i) => (
                  <React.Fragment key={h.id}>
                    {i > 0 && <RowSeparator />}
                    <View style={styles.holiday}>
                      <DateBadge day={h.day} tone={h.kind === "optional" ? "slate" : "violet"} />
                      <View style={styles.holidayBody}>
                        <Text numberOfLines={2} style={[textVariants.listTitle, { color: t.text }]}>
                          {h.name}
                        </Text>
                        <Text style={[textVariants.listSubtitle, { color: t.textTertiary, marginTop: 4 }]}>
                          {h.kind === "optional" ? "Optional holiday" : h.kind === "national" ? "National holiday" : "Festival"}
                        </Text>
                      </View>
                    </View>
                  </React.Fragment>
                ))}
                {hols.length > HOLIDAYS_SHOWN ? (
                  <View style={styles.more}>
                    <Button
                      label={allHolidays ? "Show fewer" : `Show all ${hols.length}`}
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        feedback.select()
                        setAllHolidays((v) => !v)
                      }}
                    />
                  </View>
                ) : null}
              </>
            )}
          </Panel>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  rail: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  railSkeleton: { flexDirection: "row", paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm, overflow: "hidden" },
  team: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  person: { width: 72, alignItems: "center" },
  switchWrap: { paddingHorizontal: gutter, paddingBottom: spacing.sm },
  holiday: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingVertical: spacing.md },
  holidayBody: { flex: 1, minWidth: 0 },
  more: { paddingHorizontal: gutter, paddingBottom: spacing.sm, alignItems: "flex-start" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
