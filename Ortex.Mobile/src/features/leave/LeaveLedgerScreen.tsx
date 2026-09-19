import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { LEDGER_REASON_LABEL } from "@/domain/attendance"
import { myLedger, type LedgerRow } from "@/lib/leave"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, EmptyState, ListRefreshControl, Panel, RowSeparator, SkeletonList } from "@/ui"

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0$/, ""))

/**
 * One leave type's history: every accrual, grant, day taken, day given back,
 * lapse and adjustment, newest first, with the balance after each. The balance
 * on the Leave page is the last line of this list, so any figure there can be
 * explained here.
 */
export default function LeaveLedgerScreen({ navigation, route }: StackScreenProps<"LeaveLedger">) {
  const t = useTheme()
  const [rows, setRows] = React.useState<(LedgerRow & { after: number })[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

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

  return (
    <AppScreen
      title={route.params.name || route.params.code}
      subtitle={rows ? `Balance ${fmt(balance)} days` : undefined}
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
        <SkeletonList count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nothing yet"
          hint="Accruals, grants and leave you take appear here, each with the balance after it."
        />
      ) : (
        <Panel title="History" meta={`${rows.length}`}>
          {rows.map((r, i) => {
            const plus = r.delta > 0
            return (
              <React.Fragment key={r.id}>
                {i > 0 && <RowSeparator />}
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[textVariants.listTitle, { color: t.text }]}>{LEDGER_REASON_LABEL[r.reason] || r.reason}</Text>
                    <Text style={[textVariants.listSubtitle, { color: t.textTertiary }]} numberOfLines={2}>
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
          })}
        </Panel>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingVertical: spacing.md },
  right: { alignItems: "flex-end", gap: 2 },
  delta: { fontFamily: font.bold, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
})
