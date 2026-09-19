import React from "react"
import { Image, Pressable, StyleSheet, Text, View } from "react-native"

import {
  balanceAfter,
  daysWords,
  leaveDaysBetween,
  monthBounds,
  monthGrid,
  type FromHalf,
  type LeaveBalance,
  type LeaveRequest,
  type ToHalf,
} from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { addDays, todayIST, useLeaveRules } from "@/features/leave/leaveFormat"
import { feedback } from "@/lib/feedback"
import {
  apply,
  balances as loadBalances,
  myRequests,
  pickAttachment,
  types as loadTypes,
  type Attachment,
  type LeaveType,
} from "@/lib/leave"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  DataNotice,
  IconButton,
  Panel,
  SegmentedControl,
  Sheet,
  SkeletonPanel,
  Switch,
  TextField,
  useToast,
} from "@/ui"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
type SingleHalf = "full" | "morning" | "afternoon"

/**
 * Apply for leave (Remote "Requesting a time off", Gusto's question headings).
 * The day count and "balance after" are worked out here with the server's own
 * counting rule so the answer is on screen before Submit; the server counts
 * again and its count is the one saved. Its refusals are written for people,
 * so they are shown as they come.
 */
export default function LeaveApplyScreen({ navigation, route }: StackScreenProps<"LeaveApply">) {
  const t = useTheme()
  const toast = useToast()
  const { rules } = useLeaveRules()
  const today = todayIST()

  const [types, setTypes] = React.useState<LeaveType[] | null>(null)
  const [bal, setBal] = React.useState<LeaveBalance[]>([])
  const [mine, setMine] = React.useState<LeaveRequest[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const [code, setCode] = React.useState<string | null>(route.params?.type ?? null)
  const [from, setFrom] = React.useState<string | null>(null)
  const [to, setTo] = React.useState<string | null>(null)
  const [single, setSingle] = React.useState<SingleHalf>("full")
  const [startsAfterLunch, setStartsAfterLunch] = React.useState(false)
  const [endsAtLunch, setEndsAtLunch] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [attachment, setAttachment] = React.useState<Attachment | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<number | null>(null)
  const [ym, setYm] = React.useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))

  React.useEffect(() => {
    void (async () => {
      try {
        const [ty, b, r] = await Promise.all([loadTypes(), loadBalances(), myRequests()])
        setTypes(ty)
        setBal(b)
        setMine(r)
        setError(null)
        if (!code && ty.length) setCode(ty[0].code)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load leave.")
        setTypes([])
      }
    })()
    // Once: the lists do not change while the form is open.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const type = types?.find((x) => x.code === code) || null
  const balance = bal.find((b) => b.code === code) || null
  const last = to ?? from
  const isSingle = !!from && (!to || to === from)

  // The halves in the server's vocabulary.
  const fromHalf: FromHalf = !type?.half_day
    ? "full"
    : isSingle
      ? single === "afternoon"
        ? "second"
        : "full"
      : startsAfterLunch
        ? "second"
        : "full"
  const toHalf: ToHalf = !type?.half_day
    ? "full"
    : isSingle
      ? single === "morning"
        ? "first"
        : "full"
      : endsAtLunch
        ? "first"
        : "full"

  const holidayDays = React.useMemo(() => rules.holidays.filter((h) => h.kind !== "optional").map((h) => h.day), [rules])
  const holidayName = React.useMemo(() => new Map(rules.holidays.map((h) => [h.day, h.name])), [rules])
  const offSet = React.useMemo(() => new Set(rules.weeklyOff), [rules])
  const isOff = React.useCallback(
    (d: string) => offSet.has(new Date(`${d}T00:00:00Z`).getUTCDay()) || holidayDays.includes(d),
    [offSet, holidayDays],
  )

  const days = from && last ? leaveDaysBetween(from, last, fromHalf, toHalf, { ...rules, holidays: holidayDays }) : 0
  const plainDays = from && last ? leaveDaysBetween(from, last, fromHalf, toHalf, { ...rules, holidays: holidayDays, sandwich: false }) : 0

  // Which off days fall inside the range, for "(Sunday not counted)".
  const offInside = React.useMemo(() => {
    if (!from || !last) return [] as string[]
    const out: string[] = []
    for (let d = from; d <= last; d = addDays(d, 1)) if (isOff(d)) out.push(d)
    return out
  }, [from, last, isOff])

  // With the sandwich rule on, only the off days at either end go uncounted.
  const excludedOff = rules.sandwich ? offInside.filter((d) => d === from || d === last) : offInside

  const after = balance && type ? balanceAfter(balance, days) : null
  const overBalance = after !== null && after < 0
  const docNeeded = !!type && type.doc_after_days !== null && days > type.doc_after_days
  const overRun = !!type && type.max_run !== null && days > type.max_run
  const noticeShort =
    !!type && !!from && type.notice_days > 0 && from > today && from < addDays(today, type.notice_days)

  // Leave I already have (pending or approved), dotted on the calendar.
  const taken = React.useMemo(() => {
    const s = new Set<string>()
    for (const r of mine) {
      if (r.status !== "pending" && r.status !== "approved") continue
      for (let d = r.from_day; d <= r.to_day; d = addDays(d, 1)) s.add(d)
    }
    return s
  }, [mine])

  const earliest = addDays(today, -30)
  const weeks = React.useMemo(() => monthGrid(ym.y, ym.m, []), [ym])
  const bounds = monthBounds(ym.y, ym.m)

  const tap = (d: string) => {
    feedback.select()
    if (!from || (from && to)) {
      setFrom(d)
      setTo(null)
    } else if (d < from) {
      setFrom(d)
    } else if (d === from) {
      setTo(null)
    } else {
      setTo(d)
    }
  }

  const shiftMonth = (delta: number) => {
    feedback.select()
    setYm(({ y, m }) => {
      const n = m + delta
      return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n }
    })
  }

  const blocker = !type
    ? "Choose a kind of leave"
    : !from
      ? "Choose your dates"
      : days <= 0
        ? "Those days are all weekly offs or holidays"
        : overBalance
          ? `Only ${daysWords(balance!.available)} of ${type.name.toLowerCase()} left`
          : reason.trim().length < 3
            ? "Add a reason"
            : docNeeded && !attachment
              ? "Attach a certificate"
              : null

  const pick = async (source: "camera" | "library") => {
    setPicking(false)
    try {
      const a = await pickAttachment(source)
      if (a) setAttachment(a)
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "Could not add the photo.", tone: "danger" })
    }
  }

  const submit = async () => {
    if (blocker || !type || !from) return
    setBusy(true)
    try {
      const res = await apply({
        type: type.code,
        from,
        to: last!,
        fromHalf,
        toHalf,
        reason,
        attachment,
      })
      feedback.created()
      setDone(res.days)
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "Your request was not sent.", tone: "danger" })
    }
    setBusy(false)
  }

  const inRange = (d: string) => !!from && !!last && d >= from && d <= last

  return (
    <AppScreen title="Apply for leave" back onBack={() => navigation.goBack()} inTabs={false}>
      <DataNotice error={error} />
      {types === null ? (
        <>
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={5} block={240} />
        </>
      ) : (
        <>
          <Panel title="What kind of leave?">
            <View style={styles.types}>
              {types.map((ty) => {
                const b = bal.find((x) => x.code === ty.code)
                const active = ty.code === code
                return (
                  <Pressable
                    key={ty.code}
                    onPress={() => {
                      feedback.select()
                      setCode(ty.code)
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.type,
                      {
                        backgroundColor: active ? t.primary10 : t.surfaceInset,
                        borderColor: active ? t.primary : "transparent",
                      },
                    ]}
                  >
                    <Text style={[textVariants.bodyStrong, { color: active ? t.primary : t.text }]}>{ty.name}</Text>
                    <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                      {ty.accrual === "none" ? "Unpaid" : b ? `${daysWords(b.available)} available` : "No balance yet"}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </Panel>

          <Panel title="When will you be away?" meta={from ? undefined : "Tap the first day, then the last"}>
            <View style={styles.switcher}>
              <IconButton
                name="back"
                onPress={() => shiftMonth(-1)}
                disabled={bounds.from <= earliest.slice(0, 8) + "01"}
                accessibilityLabel="Previous month"
              />
              <Text style={[textVariants.cardTitle, { color: t.text }]}>{bounds.label}</Text>
              <IconButton name="forward" onPress={() => shiftMonth(1)} accessibilityLabel="Next month" />
            </View>
            <View style={styles.calendar}>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={[styles.dow, { color: t.textTertiary }]}>
                    {w}
                  </Text>
                ))}
              </View>
              {weeks.map((week, i) => (
                <View key={i} style={styles.weekRow}>
                  {week.map((cell) => {
                    const off = isOff(cell.day)
                    const selected = inRange(cell.day)
                    const edge = cell.day === from || cell.day === last
                    const disabled = !cell.inMonth || cell.day < earliest
                    const had = taken.has(cell.day)
                    const hol = holidayName.get(cell.day)
                    return (
                      <Pressable
                        key={cell.day}
                        disabled={disabled}
                        onPress={() => tap(cell.day)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${dayLabel(cell.day)}${hol ? `, ${hol}` : off ? ", weekly off" : ""}${had ? ", you already have leave" : ""}`}
                        style={[
                          styles.cell,
                          {
                            backgroundColor: edge
                              ? t.primary
                              : selected
                                ? t.primary10
                                : off && cell.inMonth
                                  ? t.surfaceInset
                                  : "transparent",
                          },
                          had && !edge && { borderWidth: 1.5, borderStyle: "dashed", borderColor: t.tones.violet.fg },
                          cell.day === today && !edge && { borderWidth: 2, borderColor: t.primary },
                          !cell.inMonth && { opacity: 0 },
                          cell.inMonth && cell.day < earliest && { opacity: 0.3 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.date,
                            { color: edge ? t.textOnPrimary : off ? t.textTertiary : t.text },
                          ]}
                        >
                          {cell.date}
                        </Text>
                        {hol ? <View style={[styles.dot, { backgroundColor: edge ? t.textOnPrimary : t.tones.violet.fg }]} /> : null}
                      </Pressable>
                    )
                  })}
                </View>
              ))}
              <View style={styles.key}>
                <KeyItem swatch={t.surfaceInset} label="Weekly off" />
                <KeyItem dot={t.tones.violet.fg} label="Holiday" />
                <KeyItem dashed={t.tones.violet.fg} label="Already on leave" />
              </View>
            </View>

            {from && type?.half_day ? (
              isSingle ? (
                <View style={styles.pad}>
                  <Text style={[textVariants.small, { color: t.textSecondary, marginBottom: spacing.xs }]}>Half day?</Text>
                  <SegmentedControl<SingleHalf>
                    options={[
                      { key: "full", label: "Full day" },
                      { key: "morning", label: "Morning" },
                      { key: "afternoon", label: "Afternoon" },
                    ]}
                    value={single}
                    onChange={setSingle}
                  />
                </View>
              ) : (
                <View style={styles.pad}>
                  <HalfRow label={`Starts after lunch on ${dayLabel(from)}`} value={startsAfterLunch} onChange={setStartsAfterLunch} />
                  <HalfRow label={`Ends at lunch on ${dayLabel(last!)}`} value={endsAtLunch} onChange={setEndsAtLunch} />
                </View>
              )
            ) : null}

            {from ? (
              <View style={[styles.count, { backgroundColor: overBalance ? t.dangerBg : t.iconWell }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[textVariants.bodyStrong, { color: overBalance ? t.dangerText : t.primary }]}>
                    {daysWords(days)}
                    {excludedOff.length ? ` (${offWords(excludedOff, holidayName)} not counted)` : ""}
                  </Text>
                  {days > plainDays ? (
                    <Text style={[textVariants.caption, { color: t.textSecondary }]}>
                      Includes the weekly off or holiday between your leave days (the sandwich rule).
                    </Text>
                  ) : null}
                  {after !== null ? (
                    <Text style={[textVariants.caption, { color: overBalance ? t.dangerText : t.textSecondary }]}>
                      {`Balance after this: ${daysWords(after)}`}
                    </Text>
                  ) : (
                    <Text style={[textVariants.caption, { color: t.textSecondary }]}>Unpaid: this does not use a balance.</Text>
                  )}
                </View>
              </View>
            ) : null}
            {overRun ? <Warn text={`${type!.name} can be at most ${daysWords(type!.max_run!)} in a row.`} /> : null}
            {noticeShort ? <Warn text={`${type!.name} needs ${type!.notice_days} days' notice.`} /> : null}
          </Panel>

          <Panel title="Anything the approver should know?">
            <View style={styles.pad}>
              <TextField
                value={reason}
                onChangeText={setReason}
                placeholder="For example: family function in Jaipur"
                multiline
                maxLength={500}
              />
            </View>
            <View style={styles.pad}>
              <Text style={[textVariants.small, { color: docNeeded ? t.warningText : t.textSecondary, marginBottom: spacing.xs }]}>
                {docNeeded
                  ? `A certificate is needed for ${type!.name.toLowerCase()} longer than ${daysWords(type!.doc_after_days!)}.`
                  : "Certificate or document (optional)"}
              </Text>
              {attachment ? (
                <View style={styles.attachment}>
                  <Image source={{ uri: attachment.uri }} style={styles.thumb} />
                  <Text style={[textVariants.small, { color: t.textSecondary, flex: 1 }]}>Photo attached</Text>
                  <Button label="Remove" variant="ghost" size="sm" onPress={() => setAttachment(null)} />
                </View>
              ) : (
                <Button label="Add a photo" icon="camera" variant="secondary" size="md" onPress={() => setPicking(true)} />
              )}
            </View>
          </Panel>

          <View style={styles.submit}>
            {blocker ? (
              <Text style={[textVariants.small, { color: t.textTertiary, textAlign: "center" }]}>{blocker}</Text>
            ) : null}
            <Button label="Send request" fullWidth loading={busy} disabled={!!blocker} onPress={() => void submit()} />
          </View>
        </>
      )}

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Add a document">
        <View style={styles.sheet}>
          <Button label="Take a photo" icon="camera" fullWidth onPress={() => void pick("camera")} />
          <Button label="Choose from gallery" icon="image" variant="secondary" fullWidth onPress={() => void pick("library")} />
        </View>
      </Sheet>

      <Sheet
        visible={done !== null}
        onClose={() => {
          setDone(null)
          navigation.goBack()
        }}
        title="Request sent"
      >
        <View style={styles.sheet}>
          <Text style={[textVariants.body, { color: t.textSecondary }]}>
            {`${daysWords(done ?? 0)} of ${type?.name.toLowerCase() || "leave"} asked for. You'll be notified when an admin decides.`}
          </Text>
          <Button
            label="Done"
            fullWidth
            onPress={() => {
              setDone(null)
              navigation.goBack()
            }}
          />
        </View>
      </Sheet>
    </AppScreen>
  )
}

/** "Sunday" · "Sunday and Gandhi Jayanti" · "3 days off" */
function offWords(days: string[], names: Map<string, string>): string {
  if (days.length > 2) return `${days.length} days off`
  return days
    .map((d) => names.get(d) || WEEKDAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()])
    .join(" and ")
}

function HalfRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme()
  return (
    <View style={styles.halfRow}>
      <Text style={[textVariants.small, { color: t.text, flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => {
          feedback.toggle(v)
          onChange(v)
        }}
      />
    </View>
  )
}

function Warn({ text }: { text: string }) {
  const t = useTheme()
  return (
    <View style={[styles.warn, { backgroundColor: t.warningBg }]}>
      <Text style={[textVariants.small, { color: t.warningText }]}>{text}</Text>
    </View>
  )
}

function KeyItem({ swatch, dot, dashed, label }: { swatch?: string; dot?: string; dashed?: string; label: string }) {
  const t = useTheme()
  return (
    <View style={styles.keyItem}>
      <View
        style={[
          styles.keySwatch,
          swatch ? { backgroundColor: swatch } : null,
          dashed ? { borderWidth: 1.5, borderStyle: "dashed", borderColor: dashed } : null,
        ]}
      >
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      </View>
      <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  types: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  type: { borderRadius: radius.card, padding: spacing.md, borderWidth: 1.5, gap: 2 },
  switcher: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter - 10,
  },
  calendar: { paddingHorizontal: gutter, paddingBottom: spacing.sm, gap: 6 },
  weekRow: { flexDirection: "row", gap: 6 },
  dow: { flex: 1, textAlign: "center", fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: radius.card, alignItems: "center", justifyContent: "center", gap: 2 },
  date: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16, fontVariant: ["tabular-nums"] },
  dot: { width: 5, height: 5, borderRadius: 3 },
  key: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center", marginTop: spacing.xs },
  keyItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  keySwatch: { width: 14, height: 14, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  halfRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  count: {
    marginHorizontal: gutter,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
  },
  warn: { marginHorizontal: gutter, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.card },
  attachment: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: radius.card },
  submit: { paddingHorizontal: gutter, paddingVertical: spacing.lg, gap: spacing.sm },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
})
