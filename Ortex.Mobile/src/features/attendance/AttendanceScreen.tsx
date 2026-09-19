import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, durationWords } from "@/domain/attendance"
import PunchRow from "@/features/attendance/PunchRow"
import { useAttendanceToday, useStartClock } from "@/features/attendance/useAttendance"
import { feedback } from "@/lib/feedback"
import { shiftClock } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, ImageViewer, ListRefreshControl, Panel, Section, SectionRow, SkeletonPanel } from "@/ui"
import SlideToConfirm from "@/ui/SlideToConfirm"

const TODAY = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })

/**
 * Attendance, the page: today in full (the state in words, the one slide, every
 * punch with its selfie), then the way to past days. Marking attendance happens
 * only here and on the Home card, and only through the camera flow.
 */
export default function AttendanceScreen({ navigation }: StackScreenProps<"Attendance">) {
  const t = useTheme()
  const startClock = useStartClock()
  const { settings, summary, onDutySince, loading, error, reload } = useAttendanceToday()
  const [photo, setPhoto] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  const todays = [...summary.punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const shift =
    settings.shift?.start && settings.shift?.end
      ? `${shiftClock(settings.shift.start)} to ${shiftClock(settings.shift.end)}`
      : "Not set"

  return (
    <AppScreen
      title="Attendance"
      subtitle={TODAY.format(new Date())}
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
              await reload()
              setRefreshing(false)
            }}
          />
        ),
      }}
    >
      <DataNotice error={error} onRetry={() => void reload()} />
      {loading ? (
        <>
          <SkeletonPanel lines={2} block={60} />
          <SkeletonPanel lines={3} />
        </>
      ) : (
        <>
          <Panel title="Today">
            <View style={styles.today}>
              <Text style={[textVariants.title, { color: t.text }]}>
                {onDutySince
                  ? `On duty since ${clockIST(onDutySince)}`
                  : summary.lastOut
                    ? `Clocked out at ${clockIST(summary.lastOut)}`
                    : "Not clocked in yet"}
              </Text>
              <Text style={[textVariants.body, { color: t.textSecondary }]}>
                {summary.punches.length ? `${durationWords(summary.workedMin)} worked today` : `Shift ${shift}`}
              </Text>
              <SlideToConfirm
                label={onDutySince ? "Slide to clock out" : "Slide to clock in"}
                tone={onDutySince ? "danger" : "primary"}
                hint="Takes a selfie and your location"
                onConfirm={() => void startClock(navigation, onDutySince ? "out" : "in")}
              />
            </View>
          </Panel>

          <Panel title="Today's punches" meta={todays.length ? `${todays.length}` : undefined}>
            {todays.length === 0 ? (
              <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>
                Nothing yet. Your clock-ins and clock-outs appear here, each with its selfie.
              </Text>
            ) : (
              <View style={{ paddingTop: spacing.xs }}>
                {todays.map((p, i) => (
                  <PunchRow key={p.id} punch={p} last={i === todays.length - 1} onOpenPhoto={setPhoto} />
                ))}
              </View>
            )}
          </Panel>

          <Section title="More">
            <SectionRow
              leadingIcon="calendar"
              title="My attendance"
              subtitle="Every day, with hours and selfies"
              onPress={() => {
                feedback.tap()
                navigation.navigate("AttendanceHistory")
              }}
            />
          </Section>

          <Panel padded>
            <Text style={[textVariants.small, { color: t.textTertiary }]}>
              {`Shift ${shift}${settings.graceMin ? `, ${settings.graceMin} min grace` : ""}. Attendance is marked only in this app, with a selfie and your location at that moment. Your location is never tracked at other times.`}
            </Text>
          </Panel>
        </>
      )}
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  today: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  empty: { paddingHorizontal: gutter, paddingBottom: spacing.md },
})
