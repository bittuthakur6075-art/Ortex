import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, durationWords, summarizeDay, type DaySummary } from "@/domain/attendance"
import PunchRow from "@/features/attendance/PunchRow"
import { myPunches } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, ImageViewer, Panel, SkeletonPanel } from "@/ui"

const TITLE = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

/** One day: what it added up to, then every punch with its selfie, site and flags. */
export default function AttendanceDayScreen({ navigation, route }: StackScreenProps<"AttendanceDay">) {
  const { day } = route.params
  const t = useTheme()
  const [summary, setSummary] = React.useState<DaySummary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const punches = await myPunches({ from: day, to: day })
      setSummary(summarizeDay(day, punches))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this day.")
    }
  }, [day])

  React.useEffect(() => {
    void load()
  }, [load])

  const facts = summary
    ? [
        ["First in", summary.firstIn ? clockIST(summary.firstIn) : "None"],
        ["Last out", summary.open ? "Still on duty" : summary.lastOut ? clockIST(summary.lastOut) : "None"],
        ["Worked", durationWords(summary.workedMin)],
        ["Where", summary.field ? "Field visit" : summary.site || "Office"],
      ]
    : []
  const ordered = summary ? [...summary.punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : []

  return (
    <AppScreen
      title={TITLE.format(new Date(`${day}T00:00:00Z`)).replace(",", "")}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
    >
      <DataNotice error={error} onRetry={() => void load()} />
      {!summary ? (
        <>
          <SkeletonPanel lines={2} />
          <SkeletonPanel lines={4} />
        </>
      ) : (
        <>
          <Panel title="The day">
            <View style={styles.facts}>
              {facts.map(([label, value]) => (
                <View key={label} style={styles.fact}>
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
                  <Text style={[textVariants.bodyStrong, { color: t.text }]}>{value}</Text>
                </View>
              ))}
            </View>
          </Panel>
          <Panel title="Punches" meta={`${ordered.length}`}>
            <View style={{ paddingTop: spacing.xs }}>
              {ordered.map((p, i) => (
                <PunchRow key={p.id} punch={p} last={i === ordered.length - 1} onOpenPhoto={setPhoto} />
              ))}
            </View>
          </Panel>
          <Panel padded>
            <Text style={[textVariants.small, { color: t.textTertiary }]}>
              Times are from the Ortex server, in India time. Something wrong? Speak to an admin; corrections come with the
              next update of attendance.
            </Text>
          </Panel>
        </>
      )}
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  facts: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter, paddingBottom: spacing.md, rowGap: spacing.md },
  fact: { width: "50%", gap: 2 },
})
