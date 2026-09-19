import AsyncStorage from "@react-native-async-storage/async-storage"
import { useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"

import {
  dayKey,
  effectiveStatus,
  onDutySince,
  summarizeDay,
  type AttendanceDay,
  type DaySummary,
  type Punch,
} from "@/domain/attendance"
import { isAdmin } from "@/domain/modules"
import {
  flaggedPunches,
  holidays,
  loadSettings,
  myDays,
  myPunches,
  pendingCorrections,
  type AttendanceSettings,
  type Holiday,
} from "@/lib/attendance"
import { pendingLeave } from "@/lib/leave"
import type { RootStackParamList } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"

const DAY_MS = 86400000

/**
 * Today, for the Home card and the Attendance page: the settings (shift, notice),
 * the last two days of this person's punches, whether they are on duty now, and
 * a clock that ticks every 30 s so "On duty 2h 14m" stays true. Reloads when the
 * screen regains focus, which is how it learns about a punch just made.
 */
export function useAttendanceToday() {
  const [settings, setSettings] = React.useState<AttendanceSettings>({})
  const [punches, setPunches] = React.useState<Punch[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(() => Date.now())

  const reload = React.useCallback(async () => {
    try {
      const from = dayKey(Date.now() - DAY_MS)
      const [s, p] = await Promise.all([loadSettings(), myPunches({ from })])
      setSettings(s)
      setPunches(p)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your attendance.")
    } finally {
      setLoading(false)
      setNow(Date.now())
    }
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void reload()
    }, [reload]),
  )

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const today = dayKey(now)
  const since = onDutySince(punches, now)
  const summary: DaySummary = React.useMemo(
    () => summarizeDay(today, punches.filter((p) => (p.day || dayKey(p.at)) === today), now),
    [punches, today, now],
  )

  return { settings, punches, summary, onDutySince: since, loading, error, reload, now }
}

/**
 * What the Home card and the Attendance page say beyond today (phase 2):
 * yesterday's missed clock-out (with a one-tap correction), the next holiday,
 * and, for an admin, how many corrections and flagged punches wait. Every
 * piece fails soft: before migration 0034 is applied these are simply absent.
 */
export function useAttendanceNotices() {
  const { profile } = useAuth()
  const admin = isAdmin(profile)
  const [missedYesterday, setMissedYesterday] = React.useState<string | null>(null)
  const [nextHoliday, setNextHoliday] = React.useState<Holiday | null>(null)
  const [pending, setPending] = React.useState(0)

  const reload = React.useCallback(async () => {
    const yesterday = dayKey(Date.now() - DAY_MS)
    const today = dayKey(Date.now())
    const soon = dayKey(Date.now() + 120 * DAY_MS)
    const [days, hols, corrections, flagged, leave] = await Promise.all([
      myDays({ from: yesterday, to: yesterday }).catch(() => [] as AttendanceDay[]),
      holidays({ from: today, to: soon }).catch(() => [] as Holiday[]),
      admin ? pendingCorrections().catch(() => []) : Promise.resolve([]),
      admin ? flaggedPunches().catch(() => []) : Promise.resolve([]),
      admin ? pendingLeave().catch(() => []) : Promise.resolve([]),
    ])
    const y = days[0]
    setMissedYesterday(y && effectiveStatus(y) === "MP" ? y.day : null)
    setNextHoliday(hols[0] ?? null)
    setPending(corrections.length + flagged.length + leave.length)
  }, [admin])

  useFocusEffect(
    React.useCallback(() => {
      void reload()
    }, [reload]),
  )

  return { missedYesterday, nextHoliday, pending, admin, reload }
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
 * time on this handset for this person, the camera flow after that.
 */
export function useStartClock() {
  const { session } = useAuth()
  const uid = session?.user?.id
  return React.useCallback(
    async (navigation: Pick<NativeStackNavigationProp<RootStackParamList>, "navigate">, kind: "in" | "out") => {
      if (await noticeSeen(uid)) navigation.navigate("AttendanceClock", { kind })
      else navigation.navigate("AttendanceNotice", { kind })
    },
    [uid],
  )
}
