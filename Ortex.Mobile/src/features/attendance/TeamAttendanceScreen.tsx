import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { clockIST } from "@/domain/attendance"
import { dayLabel, SECTION_TITLE } from "@/features/attendance/format"
import { ShiftBar } from "@/features/attendance/LiveProgress"
import { shiftMinutes } from "@/features/attendance/progress"
import {
  boardCounts,
  boardRow,
  boardSections,
  type BoardRow,
  type BoardSection,
  type BoardStatus,
} from "@/features/attendance/teamBoard"

import { todayIST } from "@/features/leave/leaveFormat"
import { teamToday, type TeamDay } from "@/lib/attendance"
import { callNumber } from "@/lib/contact"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter } from "@/theme/tokens"
import { fontFamily } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  DataNotice,
  EmptyState,
  ListRefreshControl,
  RowRule,
  RowSeparator,
  SkeletonList,
} from "@/ui"
import Icon from "@/ui/Icon"
import { SubHeader, Tag, useOneTone, type OneTone } from "@/ui/OneUi"

const DOT: Record<BoardStatus, OneTone> = {
  working: "success",
  auto: "success",
  done: "neutral",
  notIn: "warning",
  expected: "neutral",
  leave: "violet",
  off: "neutral",
}

/** Today's live view moves on its own: a minute is fine-grained enough for check-ins. */
const REFRESH_MS = 60000

/**
 * Admins: who is in today, the phone's copy of the console's Attendance → Today.
 * Edge to edge like the Quotations list: three counts as pills, then
 * the people in the order an admin acts on them (Not in yet, with a Call
 * button; Working now; Checked out; On leave). The status rules are pure, in
 * teamBoard.ts (tested).
 */
export default function TeamAttendanceScreen({ navigation }: StackScreenProps<"TeamAttendance">) {
  const t = useTheme()
  const [data, setData] = React.useState<TeamDay | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())

  const load = React.useCallback(async () => {
    try {
      setData(await teamToday())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load today's attendance.")
    } finally {
      setNow(Date.now())
    }
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
      const timer = setInterval(() => void load(), REFRESH_MS)
      return () => clearInterval(timer)
    }, [load]),
  )

  const today = todayIST()
  const settings = data?.settings
  const rows = React.useMemo(
    () =>
      (data?.people ?? []).map((p) =>
        boardRow(p, {
          day: today,
          now,
          shiftStart: settings?.shift?.start,
          graceMin: settings?.graceMin,
          off: data?.off ?? null,
        }),
      ),
    [data, settings, today, now],
  )
  const counts = boardCounts(rows)
  const sections = React.useMemo(() => boardSections(rows), [rows])
  const shiftMin = settings ? shiftMinutes(settings, today) : 0

  const loading = !data && !error
  const updated = data ? `Updated ${clockIST(now)}` : "Loading…"

  return (
    <AppScreen
      title="Team attendance"
      subtitle={`${dayLabel(today)} · ${updated}`}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      sections={{
        sections: loading ? [] : sections,
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
        keyExtractor: (r: unknown) => (r as BoardRow).userId,
        stickySectionHeadersEnabled: false,
        renderSectionHeader: ({ section }: { section: unknown }) => {
          const s = section as BoardSection
          const overdue = s.key === "notIn" ? s.data.filter((r) => r.status === "notIn").length : 0
          return (
            <SubHeader
              flush
              titleStyle={SECTION_TITLE}
              title={s.title}
              right={
                <Tag
                  label={String(overdue || s.data.length)}
                  tone={overdue ? "warning" : "neutral"}
                  dot={!!overdue}
                />
              }
            />
          )
        },
        ItemSeparatorComponent: () => <RowRule />,
        renderSectionFooter: () => <RowSeparator />,
        ListEmptyComponent: loading ? (
          <SkeletonList count={6} leading="avatar" />
        ) : error && !data ? (
          <EmptyState
            icon="warning"
            title="Could not load today"
            hint={error}
            actionLabel="Try again"
            onAction={() => void load()}
          />
        ) : (
          <EmptyState icon="team" title="Nobody on the team yet" hint="Active accounts appear here." />
        ),
        renderItem: ({ item }: { item: unknown }) => {
          const r = item as BoardRow
          return (
            <TeamRow
              r={r}
              shiftMin={shiftMin}
              onPress={() => navigation.navigate("UserDetail", { id: r.userId })}
            />
          )
        },
      }}
    >
      <DataNotice error={data ? error : null} onRetry={() => void load()} />
      {data ? (
        <>
          <View style={styles.tiles}>
            <Tile
              label="Present"
              value={`${counts.present}/${counts.total - counts.leave}`}
              bg={t.successBg}
              fg={t.successText}
            />
            <Tile
              label="Not In"
              value={`${counts.notIn}`}
              bg={counts.notIn ? t.warningBg : t.surfaceInset}
              fg={counts.notIn ? t.warningText : t.text}
            />
            <Tile label="On Leave" value={`${counts.leave}`} bg={t.tones.violet.bg} fg={t.tones.violet.fg} />
          </View>
          {data.off ? (
            <View style={[styles.offNote, { backgroundColor: t.surfaceInset }]}>
              <Icon name="calendar" size={18} color={t.textSecondary} variant="Bulk" />
              <Text style={[styles.offText, { color: t.textSecondary }]}>
                {`${data.off} today. Nobody is expected, so no one is marked late or missing.`}
              </Text>
            </View>
          ) : null}
          <RowSeparator />
        </>
      ) : null}
    </AppScreen>
  )
}

function Tile({ label, value, bg, fg }: { label: string; value: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }]} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.tileValue, { color: fg }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.tileLabel, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** Name and what stands out (late, to review) on top; times below; the shift bar for anyone who came in. */
function TeamRow({ r, shiftMin, onPress }: { r: BoardRow; shiftMin: number; onPress: () => void }) {
  const t = useTheme()
  const tone = useOneTone()
  const dot = tone(DOT[r.status]).solid
  const came = r.status === "working" || r.status === "done"
  const canCall = (r.status === "notIn" || r.status === "expected") && !!r.phone
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${r.name}, ${r.line}${r.lateMin ? `, late by ${r.lateMin} minutes` : ""}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View>
        <Avatar name={r.name} uri={r.avatarUrl || undefined} size="md" />
        <View style={[styles.dot, { backgroundColor: dot, borderColor: t.background }]} />
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
            {r.name}
          </Text>
          {r.lateMin ? <Tag label={`Late ${lateWords(r.lateMin)}`} tone="warning" /> : null}
          {r.review ? <Tag label="Review" tone="danger" /> : null}
        </View>
        <Text
          style={[
            styles.meta,
            r.status === "notIn"
              ? { color: t.warningText, fontFamily: fontFamily.medium }
              : { color: t.textTertiary },
          ]}
          numberOfLines={1}
        >
          {r.line}
        </Text>
        {came && shiftMin > 0 ? (
          <View style={styles.bar}>
            <ShiftBar
              fraction={r.summary.workedMin / shiftMin}
              color={r.status === "working" ? t.success : t.textFaint}
              height={4}
            />
          </View>
        ) : null}
      </View>
      {canCall ? (
        <Pressable
          onPress={() => void callNumber(r.phone)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Call ${r.name}`}
          style={[styles.call, { backgroundColor: t.successBg }]}
        >
          <Icon name="call" size={18} color={t.successText} variant="Bold" />
        </Pressable>
      ) : null}
    </Pressable>
  )
}

const lateWords = (min: number) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`)

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 8, paddingHorizontal: gutter, paddingBottom: 12 },
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  tileValue: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22, fontVariant: ["tabular-nums"] },
  tileLabel: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: 12.5, lineHeight: 16 },
  offNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: gutter,
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
  },
  offText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: gutter,
    paddingVertical: 14,
  },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  body: { flex: 1, minWidth: 0, gap: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontFamily: fontFamily.semibold, fontSize: 15.5, lineHeight: 20 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  bar: { marginTop: 4 },
  call: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
})
