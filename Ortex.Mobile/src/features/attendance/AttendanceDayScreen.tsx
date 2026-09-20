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
  type Punch,
} from "@/domain/attendance"
import { DateBadge, InfoChip, StatusPill } from "@/features/attendance/attendanceUi"
import { clock12, hoursShort, istHHMM } from "@/features/attendance/format"
import { DayTimelineBar } from "@/features/attendance/LiveProgress"
import { dayTimeline, shiftMinutes } from "@/features/attendance/progress"
import PunchRow from "@/features/attendance/PunchRow"
import { feedback } from "@/lib/feedback"
import {
  cancelCorrection,
  loadSettings,
  monthLocked,
  myCorrections,
  myDays,
  myPunches,
  type AttendanceSettings,
  type Correction,
} from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, Badge, Button, DataNotice, ImageViewer, Panel, ProgressBar, SkeletonPanel, useToast } from "@/ui"
import Icon from "@/ui/Icon"

const TITLE = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

type Session = { in: Punch | null; out: Punch | null }

/** Punches in time order → in/out pairs, as Zoho People's day timeline shows them. */
function sessionsOf(ordered: Punch[]): Session[] {
  const out: Session[] = []
  for (const p of ordered) {
    const last = out[out.length - 1]
    if (p.kind === "in") out.push({ in: p, out: null })
    else if (last && last.in && !last.out) last.out = p
    else out.push({ in: null, out: p })
  }
  return out
}

/**
 * One day, Zoho People's day view: the date and what it counts as (the
 * server's status, or the Super Admin's override and why), the hours worked
 * against the shift, the day as a timeline bar across the shift, check-in and
 * check-out, then the punches as in/out
 * sessions, each punch with the station it was scanned at (and, for a punch made
 * said. The corrections asked for it, and "Request correction", on the day it
 * is about, until the month is locked for payroll.
 */
export default function AttendanceDayScreen({ navigation, route }: StackScreenProps<"AttendanceDay">) {
  const { day } = route.params
  const t = useTheme()
  const toast = useToast()
  const [summary, setSummary] = React.useState<DaySummary | null>(null)
  const [row, setRow] = React.useState<AttendanceDay | null>(null)
  const [corrections, setCorrections] = React.useState<Correction[]>([])
  const [locked, setLocked] = React.useState(false)
  const [settings, setSettings] = React.useState<AttendanceSettings | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<string | null>(null)
  const [cancelling, setCancelling] = React.useState<string | null>(null)
  // The moment this day was read: where an open session on today ends on the bar.
  const [now, setNow] = React.useState(() => Date.now())

  const load = React.useCallback(async () => {
    try {
      const punches = await myPunches({ from: day, to: day })
      setSummary(summarizeDay(day, punches))
      setNow(Date.now())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this day.")
    }
    // The phase 2 pieces fail soft: before 0034 the day simply has no status.
    // The shift (settings) only draws "of 9h shift"; without it, the hours stand alone.
    const [days, mine, isLocked, s] = await Promise.all([
      myDays({ from: day, to: day }).catch(() => [] as AttendanceDay[]),
      myCorrections({ from: day, to: day }).catch(() => [] as Correction[]),
      monthLocked(day),
      loadSettings().catch(() => null),
    ])
    setRow(days[0] ?? null)
    setCorrections(mine)
    setLocked(isLocked)
    setSettings(s)
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

  const ordered = summary ? [...summary.punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : []
  const sessions = sessionsOf(ordered)
  const dayFlags = flagWords(row?.flags)
  const workedMin = row?.worked_min ?? summary?.workedMin ?? 0
  const shiftMin = settings ? shiftMinutes(settings, day) : 0
  const where = summary ? (summary.field ? "Field visit" : summary.site || "") : ""
  const title = TITLE.format(new Date(`${day}T00:00:00Z`)).replace(",", "")

  return (
    <AppScreen title={title} back onBack={() => navigation.goBack()} inTabs={false}>
      <DataNotice error={error} onRetry={() => void load()} />
      {!summary ? (
        <>
          <SkeletonPanel lines={2} block={96} />
          <SkeletonPanel lines={4} />
        </>
      ) : (
        <>
          <Panel>
            <View style={styles.hero}>
              <View style={styles.heroHead}>
                <DateBadge day={day} />
                <View style={styles.heroWords}>
                  {status ? (
                    <StatusPill status={status} />
                  ) : (
                    <Text style={[textVariants.small, { color: t.textTertiary }]}>No status for this day yet</Text>
                  )}
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
                </View>
              </View>

              <View style={styles.hours}>
                <Text style={[styles.hoursFigure, { color: t.text }]}>{hoursShort(workedMin)}</Text>
                <Text style={[textVariants.small, { color: t.textTertiary }]}>
                  {shiftMin ? `worked of a ${hoursShort(shiftMin)} shift` : "worked"}
                </Text>
              </View>
              {ordered.length > 0 ? (
                <DayTimelineBar timeline={dayTimeline(day, summary.punches, settings || {}, now)} />
              ) : shiftMin > 0 ? (
                <ProgressBar progress={workedMin / shiftMin} color={workedMin >= shiftMin ? t.success : t.primary} />
              ) : null}

              <View style={styles.tiles}>
                <Tile
                  icon="forward"
                  tone="in"
                  label="Check-in"
                  value={summary.firstIn ? clockIST(summary.firstIn) : "None"}
                />
                <Tile
                  icon="back"
                  tone="out"
                  label="Check-out"
                  value={summary.open ? "Still on duty" : summary.lastOut ? clockIST(summary.lastOut) : "None"}
                />
              </View>

              {where || dayFlags.length ? (
                <View style={styles.chips}>
                  {where ? (
                    <InfoChip icon="address" align="start">
                      {where}
                    </InfoChip>
                  ) : null}
                  {dayFlags.map((f) => (
                    <InfoChip key={f} icon="warning" tone="warning" align="start">
                      {f}
                    </InfoChip>
                  ))}
                </View>
              ) : null}
            </View>
          </Panel>

          <Panel title="Timeline" meta={ordered.length ? `${ordered.length} ${ordered.length === 1 ? "punch" : "punches"}` : undefined}>
            {ordered.length === 0 ? (
              <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>
                {status ? `No punches. This day counts as ${STATUS_LABEL[status].toLowerCase()}.` : "No punches on this day."}
              </Text>
            ) : (
              <View style={{ paddingTop: spacing.xs }}>
                {sessions.map((s, i) => {
                  const counted = s.in && s.out && s.in.review !== "rejected" && s.out.review !== "rejected"
                  const mins = counted
                    ? Math.max(0, Math.round((new Date(s.out!.at).getTime() - new Date(s.in!.at).getTime()) / 60000))
                    : null
                  const range = s.in
                    ? `${clockIST(s.in.at)} to ${s.out ? clockIST(s.out.at) : summary.open && i === sessions.length - 1 ? "now" : "no clock-out"}`
                    : `Clock out at ${clockIST(s.out!.at)}`
                  const lastSession = i === sessions.length - 1
                  const punches = [s.in, s.out].filter(Boolean) as Punch[]
                  return (
                    <View key={(s.in || s.out)!.id}>
                      <View style={styles.sessionHead}>
                        <Text style={[textVariants.captionStrong, { color: t.textSecondary }]}>
                          {`Session ${i + 1} · ${range}`}
                        </Text>
                        {mins !== null && (
                          <Text style={[textVariants.captionStrong, { color: t.text }]}>{hoursShort(mins)}</Text>
                        )}
                      </View>
                      {punches.map((p, j) => (
                        <PunchRow
                          key={p.id}
                          punch={p}
                          last={j === punches.length - 1 && lastSession}
                          onOpenPhoto={setPhoto}
                        />
                      ))}
                    </View>
                  )
                })}
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
              <Text style={[textVariants.caption, styles.center, { color: t.textTertiary }]}>
                Forgot a punch or clocked the wrong time? An admin reviews every correction.
              </Text>
            </View>
          ) : (
            <Panel padded>
              <View style={styles.lockedRow}>
                <Icon name={locked ? "lock" : "clock"} size={18} color={t.textTertiary} variant="Bulk" />
                <Text style={[textVariants.small, { color: t.textTertiary, flex: 1 }]}>
                  {locked
                    ? "This month is locked for payroll. Ask an admin if something is wrong."
                    : "A correction for this day is waiting for an admin."}
                </Text>
              </View>
            </Panel>
          )}

          <Text style={[textVariants.caption, styles.footnote, { color: t.textTertiary }]}>
            Times are from the Ortex server, in India time.
          </Text>
        </>
      )}
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

/** First in / last out, on a nested rounded tile inside the hero panel. */
function Tile({ icon, tone, label, value }: { icon: "forward" | "back"; tone: "in" | "out"; label: string; value: string }) {
  const t = useTheme()
  const well = tone === "in" ? t.successBg : t.dangerBg
  const glyph = tone === "in" ? t.success : t.danger
  return (
    <View style={[styles.tile, { backgroundColor: t.surfaceInset }]}>
      <View style={[styles.tileWell, { backgroundColor: well }]}>
        <Icon name={icon} size={14} color={glyph} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
        <Text style={[textVariants.bodyStrong, { color: t.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: gutter, gap: spacing.md },
  heroHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroWords: { flex: 1, gap: 4 },
  hours: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" },
  hoursFigure: { fontFamily: font.bold, fontSize: 30, lineHeight: 36, fontVariant: ["tabular-nums"] },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.card },
  tileWell: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sessionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter,
    paddingBottom: spacing.sm,
  },
  empty: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  corrections: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  correction: { borderRadius: radius.card, padding: spacing.md, gap: 6 },
  correctionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  action: { paddingHorizontal: gutter, paddingTop: spacing.md, gap: spacing.sm },
  center: { textAlign: "center" },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footnote: { paddingHorizontal: gutter, paddingTop: spacing.md, textAlign: "center" },
})
