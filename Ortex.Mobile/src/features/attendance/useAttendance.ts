import AsyncStorage from "@react-native-async-storage/async-storage"
import { useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"

import {
  dayKey,
  effectiveStatus,
  missedCheckout,
  onDutySince,
  summarizeDay,
  type AttendanceDay,
  type DayStatus,
  type DaySummary,
  type Punch,
} from "@/domain/attendance"
import { canAccess, isAdmin } from "@/domain/modules"
import { daysFromPunches } from "@/features/attendance/days"
import { countFromFor, punchWindowClosed, weekStart } from "@/features/attendance/progress"
import {
  holidays,
  loadSettings,
  myDays,
  learnServerClock,
  myPunches,
  pendingApprovalsCount,
  serverNow,
  type AttendanceSettings,
  type Holiday,
} from "@/lib/attendance"
import type { RootStackParamList } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useToast } from "@/ui"

const DAY_MS = 86400000

/** One day of this week, as both the strip and the legend read it. */
export type WeekRow = { day: string; worked_min: number; status: DayStatus | null }

/**
 * Today, for the Home card and the Attendance page: the settings (shift, notice),
 * the last two days of this person's punches, whether they are on duty now, and
 * a clock that ticks every 30 s so "On duty 2h 14m" stays true. Reloads when the
 * screen regains focus, which is how it learns about a punch just made.
 */
export function useAttendanceToday() {
  const [settings, setSettings] = React.useState<AttendanceSettings>({})
  const [serverPunches, setPunches] = React.useState<Punch[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  // False until the settings have been read once: until then "Shift not set"
  // would be a guess, not a fact.
  const [settingsLoaded, setSettingsLoaded] = React.useState(false)
  const [now, setNow] = React.useState(() => serverNow())
  // Days off this week and next that are real holidays (optional ones are
  // working days), so hours on a holiday count whole, as the server counts them.
  const [holidayDays, setHolidayDays] = React.useState<string[]>([])

  const reload = React.useCallback(async () => {
    try {
      const from = dayKey(serverNow() - DAY_MS)
      const [s, p, h] = await Promise.all([
        loadSettings(),
        myPunches({ from }),
        holidays({ from, to: dayKey(serverNow() + DAY_MS) }).catch(() => [] as Holiday[]),
        learnServerClock(),
      ])
      setSettings(s)
      setHolidayDays(h.filter((x) => x.kind !== "optional").map((x) => x.day))
      setSettingsLoaded(true)
      setPunches(p)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your attendance.")
    } finally {
      setLoading(false)
      setNow(serverNow())
    }
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void reload()
    }, [reload]),
  )

  React.useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 30000)
    return () => clearInterval(id)
  }, [])

  // There is no offline queue any more (lib/attendance.ts says why), so what
  // the server holds is the whole truth about today.
  const punches = serverPunches

  const today = dayKey(now)
  const since = onDutySince(punches, now)
  const countFrom = countFromFor(settings, today, holidayDays.includes(today))
  const summary: DaySummary = React.useMemo(
    () => summarizeDay(today, punches.filter((p) => (p.day || dayKey(p.at)) === today), now, countFrom),
    [punches, today, now, countFrom],
  )

  return { settings, settingsLoaded, punches, summary, onDutySince: since, loading, error, reload, now, countFrom }
}

/**
 * What the Home card and the Attendance page say beyond today (phase 2):
 * yesterday's missed clock-out (with a one-tap correction), the next holiday
 * (optional holidays are not days off, so they are not it), and, for an admin,
 * how many decisions wait. Every piece fails soft: before migration 0034 is
 * applied these are simply absent.
 */
export function useAttendanceNotices() {
  const { profile } = useAuth()
  // Deciding needs the Team module as well as the role (0065), as the server checks.
  const admin = isAdmin(profile) && canAccess(profile, "attendance-team")
  const [missed, setMissed] = React.useState<{ day: string; inAt: string | null } | null>(null)
  const [nextHoliday, setNextHoliday] = React.useState<Holiday | null>(null)
  const [pending, setPending] = React.useState(0)

  const reload = React.useCallback(async () => {
    const now = serverNow()
    const yesterday = dayKey(now - DAY_MS)
    const today = dayKey(now)
    const soon = dayKey(now + 120 * DAY_MS)
    const [days, hols, count] = await Promise.all([
      myDays({ from: yesterday, to: yesterday }).catch(() => [] as AttendanceDay[]),
      holidays({ from: today, to: soon }).catch(() => [] as Holiday[]),
      admin ? pendingApprovalsCount().catch(() => 0) : Promise.resolve(0),
    ])
    const y = days[0]
    // Since 0056 an unclosed day is A flagged no_checkout (MP on older rows).
    setMissed(y && missedCheckout(y) ? { day: y.day, inAt: y.first_in ?? null } : null)
    setNextHoliday(hols.find((h) => h.kind !== "optional") ?? null)
    setPending(count)
  }, [admin])

  useFocusEffect(
    React.useCallback(() => {
      void reload()
    }, [reload]),
  )

  return { missedYesterday: missed?.day ?? null, missed, nextHoliday, pending, admin, reload }
}

const noticeKey = (uid: string) => `@ortex/attendance-notice/${uid}`

export async function noticeSeen(uid?: string | null): Promise<boolean> {
  if (!uid) return false
  try {
    return (await AsyncStorage.getItem(noticeKey(uid))) === "1"
  } catch {
    return false
  }
}

export async function markNoticeSeen(uid?: string | null): Promise<void> {
  if (!uid) return
  await AsyncStorage.setItem(noticeKey(uid), "1").catch(() => {})
}

/**
 * The one door into clocking in: the privacy notice (and permissions) the first
 * time on this handset for this person, the camera flow after that. Outside
 * the check-in window (8:30 AM to 9 PM by default; a check-out has none) it
 * says so instead.
 */
export function useStartClock() {
  const { session } = useAuth()
  const toast = useToast()
  const uid = session?.user?.id
  // A double tap would otherwise open the camera twice, one over the other.
  const lastTap = React.useRef(0)
  return React.useCallback(
    async (
      navigation: Pick<NativeStackNavigationProp<RootStackParamList>, "navigate">,
      kind: "in" | "out",
      settings: AttendanceSettings,
    ) => {
      if (Date.now() - lastTap.current < 1000) return
      lastTap.current = Date.now()
      const closed = punchWindowClosed(settings, serverNow(), kind)
      if (closed) return toast.show({ message: closed, tone: "danger" })
      if (await noticeSeen(uid)) navigation.navigate("AttendanceClock", { kind })
      else navigation.navigate("AttendanceNotice", { kind })
    },
    [uid, toast],
  )
}

/**
 * THIS WEEK, Monday to today, for the Home card and the Attendance page.
 *
 * Reads the day rows (migration 0034) and falls back to the raw punches until
 * they exist, so a project without the nightly job still draws a real week
 * rather than an empty strip. Extracted from AttendanceScreen when Home grew
 * the same strip: two copies of this would have drifted the first time the
 * fallback changed.
 */
export function useWeekDays(): { rows: WeekRow[]; loading: boolean; reload: () => Promise<void> } {
  const [rows, setRows] = React.useState<WeekRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    const from = weekStart(serverNow())
    const to = dayKey(serverNow())
    try {
      const days = await myDays({ from, to })
      if (days.length) {
        setRows(days.map((r) => ({ day: r.day, worked_min: r.worked_min || 0, status: effectiveStatus(r) })))
        setLoading(false)
        return
      }
    } catch {
      /* not set up yet: fall back to the punches below */
    }
    const p = await myPunches({ from, to }).catch(() => [])
    setRows(daysFromPunches(p, to).map((d) => ({ day: d.day, worked_min: d.worked_min || 0, status: d.status })))
    setLoading(false)
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  return { rows, loading, reload: load }
}
