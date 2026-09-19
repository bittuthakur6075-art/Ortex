import AsyncStorage from "@react-native-async-storage/async-storage"
import { useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"

import { dayKey, onDutySince, summarizeDay, type DaySummary, type Punch } from "@/domain/attendance"
import { loadSettings, myPunches, type AttendanceSettings } from "@/lib/attendance"
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
