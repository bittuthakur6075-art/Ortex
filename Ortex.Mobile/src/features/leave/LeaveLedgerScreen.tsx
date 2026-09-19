import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { LEDGER_REASON_LABEL } from "@/domain/attendance"
import { TypeWell } from "@/features/leave/leaveUi"
import { feedback } from "@/lib/feedback"
import { myLedger, type LedgerRow } from "@/lib/leave"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  DataNotice,
  EmptyState,
  Icon,
  type IconName,
  ListRefreshControl,
  Panel,
  RowSeparator,
  SegmentedControl,
  Skeleton,
  SkeletonList,
} from "@/ui"

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0$/, ""))

type Filter = "all" | "in" | "out"

/** Each kind of transaction's glyph and tone, so a column of them scans by colour. */
const REASON_LOOK: Record<LedgerRow["reason"], { icon: IconName; tone: StatusTone }> = {
  accrual: { icon: "add", tone: "emerald" },
  grant: { icon: "star", tone: "emerald" },
  reversal: { icon: "refresh", tone: "blue" },
  taken: { icon: "calendar", tone: "amber" },
  lapse: { icon: "clock", tone: "rose" },
  adjust: { icon: "edit", tone: "slate" },
}

/**
 * One leave type's ledger (Zoho People's leave transactions): the balance as
 * the headline with what was credited, availed and lapsed beside it, then every
 * accrual, grant, day taken, day given back, lapse and adjustment, newest
 * first, each with the running balance after it. The balance on the Leave page
 * is the last line of this list, so any figure there can be explained here.
 */
export default function LeaveLedgerScreen({ navigation, route }: StackScreenProps<"LeaveLedger">) {
  const t = useTheme()
  const [rows, setRows] = React.useState<(LedgerRow & { after: number })[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [filter, setFilter] = React.useState<Filter>("all")

  const load = React.useCallback(async () => {
    try {
      const list = await myLedger(route.params.code)
      // Running balance, oldest first, then shown newest first.
      const asc = [...list].sort((a, b) => (a.at < b.at ? -1 : 1))
      let running = 0
      const withAfter = asc.map((r) => {
        running = Math.round((running + r.delta) * 100) / 100
        return { ...r, after: running }
      })
      setRows(withAfter.reverse())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the history.")
      setRows((r) => r ?? [])
    }
  }, [route.params.code])

  React.useEffect(() => {
    void load()
  }, [load])

  const balance = rows?.[0]?.after ?? 0
  const round = (n: number) => Math.round(n * 100) / 100
  const credited = round((rows || []).filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0))
  const availed = round(-(rows || []).filter((r) => r.reason === "taken").reduce((s, r) => s + r.delta, 0))
  const lapsed = round(-(rows || []).filter((r) => r.reason === "lapse").reduce((s, r) => s + r.delta, 0))
  const shown = (rows || []).filter((r) => (filter === "in" ? r.delta > 0 : filter === "out" ? r.delta < 0 : true))
  const name = route.params.name || route.params.code

  return (
    <AppScreen
      title={name}
      subtitle="Leave history"
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
      {rows === null ? (
        <>
          <Panel>
            <View style={styles.hero}>
              <View style={styles.heroHead}>
                <Skeleton width={44} height={44} radius={22} />
                <View style={{ gap: 8 }}>
                  <Skeleton width={70} height={11} radius={5} />
                  <Skeleton width={110} height={26} radius={8} />
                </View>
              </View>
              <View style={styles.stats}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.stat, { backgroundColor: t.surfaceInset }]}>
                    <Skeleton width="60%" height={10} radius={5} />
                    <Skeleton width="40%" height={18} radius={7} style={{ marginTop: 6 }} />
                  </View>
                ))}
              </View>
            </View>
          </Panel>
          <SkeletonList count={6} value />
        </>
      ) : (
        <>
          <Panel>
            <View style={styles.hero}>
              <View style={styles.heroHead}>
                <TypeWell code={route.params.code} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={[textVariants.tileLabel, { color: t.textTertiary }]}>BALANCE</Text>
                  <Text style={[textVariants.stat, { color: t.text }]}>
                    {fmt(balance)}
                    <Text style={[textVariants.small, { color: t.textTertiary }]}>{balance === 1 || balance === 0.5 ? " day" : " days"}</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.stats}>
                <Stat label="Credited" value={credited} />
                <Stat label="Availed" value={availed} />
                <Stat label="Lapsed" value={lapsed} />
              </View>
            </View>
          </Panel>

          {rows.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing yet"
              hint="Accruals, grants and leave you take appear here, each with the balance after it."
            />
          ) : (
            <Panel title="Transactions" meta={`${shown.length}`}>
              <View style={styles.switchWrap}>
                <SegmentedControl<Filter>
                  options={[
                    { key: "all", label: "All" },
                    { key: "in", label: "Credited" },
                    { key: "out", label: "Used" },
                  ]}
                  value={filter}
                  onChange={(v) => {
                    feedback.select()
                    setFilter(v)
                  }}
                />
              </View>
              {shown.length === 0 ? (
                <Text style={[textVariants.small, styles.pad, { color: t.textTertiary }]}>
                  {filter === "in" ? "Nothing credited yet." : "Nothing used yet."}
                </Text>
              ) : (
                shown.map((r, i) => {
                  const plus = r.delta > 0
                  const look = REASON_LOOK[r.reason] || REASON_LOOK.adjust
                  const tone = t.tones[look.tone]
                  return (
                    <React.Fragment key={r.id}>
                      {i > 0 && <RowSeparator />}
                      <View style={styles.row}>
                        <View style={[styles.well, { backgroundColor: tone.bg }]}>
                          <Icon name={look.icon} size={18} color={tone.fg} variant="Bulk" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[textVariants.listTitle, { color: t.text }]}>{LEDGER_REASON_LABEL[r.reason] || r.reason}</Text>
                          <Text style={[textVariants.listSubtitle, { color: t.textTertiary, marginTop: 2 }]} numberOfLines={2}>
                            {[r.note, WHEN.format(new Date(r.at))].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <View style={styles.right}>
                          <Text style={[styles.delta, { color: plus ? t.successText : t.dangerText }]}>
                            {`${plus ? "+" : "−"}${fmt(Math.abs(r.delta))}`}
                          </Text>
                          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{`Balance ${fmt(r.after)}`}</Text>
                        </View>
                      </View>
                    </React.Fragment>
                  )
                })
              )}
            </Panel>
          )}
        </>
      )}
    </AppScreen>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  const t = useTheme()
  return (
    <View style={[styles.stat, { backgroundColor: t.surfaceInset }]} accessible accessibilityLabel={`${label}: ${fmt(value)} days`}>
      <Text style={[textVariants.tileLabel, { color: t.textTertiary }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, { color: t.text }]}>{fmt(value)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  heroHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  statValue: { fontFamily: font.bold, fontSize: 18, lineHeight: 24, fontVariant: ["tabular-nums"] },
  switchWrap: { paddingHorizontal: gutter, paddingBottom: spacing.sm },
  pad: { paddingHorizontal: gutter, paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingVertical: spacing.md },
  well: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  right: { alignItems: "flex-end", gap: 2 },
  delta: { fontFamily: font.bold, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
})
