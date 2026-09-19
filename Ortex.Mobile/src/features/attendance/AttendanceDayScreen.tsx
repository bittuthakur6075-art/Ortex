import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import {
  clockIST,
  durationWords,
  effectiveStatus,
  flagWords,
  REGULARISATION_LABEL,
  STATUS_LABEL,
  summarizeDay,
  type AttendanceDay,
  type DaySummary,
} from "@/domain/attendance"
import { StatusPill } from "@/features/attendance/attendanceUi"
import { clock12, istHHMM } from "@/features/attendance/format"
import PunchRow from "@/features/attendance/PunchRow"
import { feedback } from "@/lib/feedback"
import { cancelCorrection, monthLocked, myCorrections, myDays, myPunches, type Correction } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Badge, Button, DataNotice, ImageViewer, Panel, SkeletonPanel, useToast } from "@/ui"

const TITLE = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

/**
 * One day: what it counts as (the server's status, or the Super Admin's
 * override and why), what it added up to, every punch with its selfie, and the
 * corrections asked for it. "Request correction" is here, on the day it is
 * about, until the month is locked for payroll.
 */
export default function AttendanceDayScreen({ navigation, route }: StackScreenProps<"AttendanceDay">) {
  const { day } = route.params
  const t = useTheme()
  const toast = useToast()
  const [summary, setSummary] = React.useState<DaySummary | null>(null)
  const [row, setRow] = React.useState<AttendanceDay | null>(null)
  const [corrections, setCorrections] = React.useState<Correction[]>([])
  const [locked, setLocked] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<string | null>(null)
  const [cancelling, setCancelling] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const punches = await myPunches({ from: day, to: day })
      setSummary(summarizeDay(day, punches))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this day.")
    }
    // The phase 2 pieces fail soft: before 0034 the day simply has no status.
    const [days, mine, isLocked] = await Promise.all([
      myDays({ from: day, to: day }).catch(() => [] as AttendanceDay[]),
      myCorrections({ from: day, to: day }).catch(() => [] as Correction[]),
      monthLocked(day),
    ])
    setRow(days[0] ?? null)
    setCorrections(mine)
    setLocked(isLocked)
  }, [day])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  const cancel = async (id: string) => {
    setCancelling(id)
    try {
      await cancelCorrection(id)
      feedback.tap()
      toast.show({ message: "Correction cancelled", tone: "success" })
      await load()
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "Could not cancel it.", tone: "danger" })
    }
    setCancelling(null)
  }

  const status = row ? effectiveStatus(row) : null
  const pending = corrections.some((c) => c.status === "pending")
  const canCorrect = !locked && !pending

  const facts = summary
    ? [
        ["First in", summary.firstIn ? clockIST(summary.firstIn) : "None"],
        ["Last out", summary.open ? "Still on duty" : summary.lastOut ? clockIST(summary.lastOut) : "None"],
        ["Worked", durationWords(row?.worked_min ?? summary.workedMin)],
        ["Where", summary.field ? "Field visit" : summary.site || "Office"],
      ]
    : []
  const ordered = summary ? [...summary.punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : []
  const dayFlags = flagWords(row?.flags)

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
            {status && (
              <View style={styles.status}>
                <StatusPill status={status} />
                {row?.override_status ? (
                  <Text style={[textVariants.small, { color: t.textSecondary }]}>
                    {`Set by the Super Admin${row.override_reason ? `: ${row.override_reason}` : ""}`}
                  </Text>
                ) : null}
                {row?.late ? (
                  <Text style={[textVariants.small, { color: t.warningText }]}>
                    {`Late by ${durationWords(row.late_min || 0)}`}
                  </Text>
                ) : null}
                {dayFlags.length > 0 && (
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>{dayFlags.join(" · ")}</Text>
                )}
              </View>
            )}
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
            {ordered.length === 0 ? (
              <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>
                {status ? `No punches. This day counts as ${STATUS_LABEL[status].toLowerCase()}.` : "No punches on this day."}
              </Text>
            ) : (
              <View style={{ paddingTop: spacing.xs }}>
                {ordered.map((p, i) => (
                  <PunchRow key={p.id} punch={p} last={i === ordered.length - 1} onOpenPhoto={setPhoto} />
                ))}
              </View>
            )}
          </Panel>

          {corrections.length > 0 && (
            <Panel title="Corrections" meta={`${corrections.length}`}>
              <View style={styles.corrections}>
                {corrections.map((c) => (
                  <View key={c.id} style={[styles.correction, { backgroundColor: t.surfaceInset }]}>
                    <View style={styles.correctionHead}>
                      <Text style={[textVariants.listTitle, { color: t.text, flex: 1 }]}>
                        {[c.in_at ? `In ${clock12(istHHMM(c.in_at))}` : null, c.out_at ? `Out ${clock12(istHHMM(c.out_at))}` : null]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                      <Badge
                        label={REGULARISATION_LABEL[c.status] || c.status}
                        tone={c.status === "approved" ? "accent" : c.status === "rejected" ? "danger" : c.status === "pending" ? "warning" : "neutral"}
                      />
                    </View>
                    <Text style={[textVariants.small, { color: t.textSecondary }]}>{c.reason}</Text>
                    {!!c.decision_note && (
                      <Text style={[textVariants.caption, { color: t.textTertiary }]}>Admin note: {c.decision_note}</Text>
                    )}
                    {c.status === "pending" && (
                      <Button
                        label="Cancel request"
                        variant="outline"
                        size="sm"
                        loading={cancelling === c.id}
                        onPress={() => void cancel(c.id)}
                      />
                    )}
                  </View>
                ))}
              </View>
            </Panel>
          )}

          {canCorrect ? (
            <View style={styles.action}>
              <Button
                label="Request correction"
                variant={status === "MP" || status === "A" || status === "HD" ? "primary" : "secondary"}
                icon="edit"
                fullWidth
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("AttendanceCorrection", {
                    day,
                    inAt: summary.firstIn,
                    outAt: summary.open ? null : summary.lastOut,
                  })
                }}
              />
            </View>
          ) : (
            <Panel padded>
              <Text style={[textVariants.small, { color: t.textTertiary }]}>
                {locked
                  ? "This month is locked for payroll. Ask an admin if something is wrong."
                  : "A correction for this day is waiting for an admin."}
              </Text>
            </Panel>
          )}

          <Panel padded>
            <Text style={[textVariants.small, { color: t.textTertiary }]}>
              Times are from the Ortex server, in India time.
            </Text>
          </Panel>
        </>
      )}
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  status: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: 4 },
  facts: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter, paddingBottom: spacing.md, rowGap: spacing.md },
  fact: { width: "50%", gap: 2 },
  empty: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  corrections: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  correction: { borderRadius: radius.card, padding: spacing.md, gap: 6 },
  correctionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  action: { paddingHorizontal: gutter, paddingTop: spacing.md },
})
