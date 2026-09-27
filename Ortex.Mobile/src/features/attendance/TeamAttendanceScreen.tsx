import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, durationWords } from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { teamToday, type TeamMember } from "@/lib/attendance"
import { todayIST } from "@/features/leave/leaveFormat"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { textVariants } from "@/theme/typography"
import { AppScreen, Avatar, DataNotice, EmptyState, ListRefreshControl, SkeletonPanel } from "@/ui"
import { Card, CardRow, CardRows, SubHeader, Tag } from "@/ui/OneUi"

/**
 * Admins: who is in today, the phone's copy of the console's Attendance → Today.
 * On duty, clocked in, not in yet; then one row per person with their times.
 */
export default function TeamAttendanceScreen({ navigation }: StackScreenProps<"TeamAttendance">) {
  const t = useTheme()
  const [data, setData] = React.useState<{ people: TeamMember[]; notIn: TeamMember[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setData(await teamToday())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load today's attendance.")
      setData((d) => d ?? { people: [], notIn: [] })
    }
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  const people = data?.people ?? []
  const counts = [
    { label: "On duty", value: people.filter((p) => p.onDuty).length },
    { label: "Clocked in", value: people.filter((p) => p.summary.firstIn).length },
    { label: "Not in yet", value: data?.notIn.length ?? 0 },
  ]

  const times = (p: TeamMember) => {
    const s = p.summary
    const parts = [s.firstIn ? `In ${clockIST(s.firstIn)}` : null, s.lastOut && !p.onDuty ? `Out ${clockIST(s.lastOut)}` : null]
    return [...parts, durationWords(s.workedMin)].filter(Boolean).join(" · ")
  }

  return (
    <AppScreen
      title="Team attendance"
      subtitle={`Today, ${dayLabel(todayIST())}`}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      inset
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
      {!data ? (
        <>
          <SkeletonPanel lines={1} head={false} />
          <SkeletonPanel lines={4} block={40} />
        </>
      ) : (
        <>
          <Card>
            <View style={styles.counts}>
              {counts.map((c) => (
                <View key={c.label} style={[styles.count, { backgroundColor: t.surfaceInset }]} accessibilityLabel={`${c.label}: ${c.value}`}>
                  <Text style={[textVariants.title, { color: t.text }]}>{c.value}</Text>
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>{c.label}</Text>
                </View>
              ))}
            </View>
          </Card>

          <SubHeader title="In today" />
          {people.length === 0 ? (
            <EmptyState icon="clock" title="Nobody has clocked in yet today" hint="Check-ins appear here as they happen." />
          ) : (
            <Card>
              <CardRows>
                {people.map((p) => (
                  <CardRow
                    key={p.userId}
                    leading={<Avatar name={p.name} uri={p.avatarUrl || undefined} size="md" />}
                    title={p.name}
                    subtitle={times(p)}
                    trailing={
                      p.summary.flagged ? (
                        <Tag label="Flagged" tone="warning" />
                      ) : p.onDuty ? (
                        <Tag label={p.summary.field ? "Field" : "On duty"} tone="success" dot />
                      ) : (
                        <Tag label="Done" />
                      )
                    }
                  />
                ))}
              </CardRows>
            </Card>
          )}

          {data.notIn.length > 0 && (
            <>
              <SubHeader title="Not in yet" />
              <Card>
                <CardRows>
                  {data.notIn.map((p) => (
                    <CardRow
                      key={p.userId}
                      leading={<Avatar name={p.name} uri={p.avatarUrl || undefined} size="md" />}
                      title={p.name}
                      subtitle="No check-in today"
                    />
                  ))}
                </CardRows>
              </Card>
            </>
          )}
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  counts: { flexDirection: "row", gap: 8, padding: 16 },
  count: { flex: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
})
