import * as Notifications from "expo-notifications"
import React from "react"
import { Platform } from "react-native"

import { supabase } from "@/data/supabase"
import { money, monthLabel, type PayslipData } from "@/features/pay/payFormat"
import { useNotificationStore } from "@/lib/notificationStore"
import { CHANNEL_REMINDERS } from "@/lib/push"
import { useAuth } from "@/store/AuthContext"

/**
 * "Your September payslip is ready", posted the moment payroll records the
 * payment, while the app is running (the same local-push approach as
 * AttendanceApprovalAlerts). Payslips are in supabase_realtime (migration
 * 0040) and RLS only lets an employee see their own row once `released_at` is
 * set, so the release itself is what arrives here. Mounted once in
 * RootNavigator's authenticated branch.
 */

type Row = { id?: string; user_id?: string; released_at?: string | null; net_pay?: number | string; data?: PayslipData }

// A release is announced once per app run, whatever later event touches the row.
const announced = new Set<string>()

export default function PayslipAlerts() {
  const { session } = useAuth()
  const uid = session?.user?.id
  const { prefs } = useNotificationStore()
  const enabled = prefs.enabled

  React.useEffect(() => {
    if (!uid || !enabled) return
    const channel = supabase
      .channel(`ortex-payslips-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payslips", filter: `user_id=eq.${uid}` }, (e) => {
        const before = e.old as Row
        const row = e.new as Row
        if (!row?.id || row.user_id !== uid || !row.released_at) return
        // Only the moment of release. The old row carries released_at only under
        // REPLICA IDENTITY FULL; otherwise the per-run Set below is the guard.
        if (e.eventType === "UPDATE" && before?.released_at) return
        void announce(row)
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [uid, enabled])

  return null
}

async function announce(row: Row) {
  const id = row.id!
  if (announced.has(id)) return
  announced.add(id)
  const month = row.data?.month ? monthLabel(row.data.month) : "This month's"
  const net = row.data?.netPay ?? row.net_pay
  const tag = `payslip-${id}`
  await Notifications.scheduleNotificationAsync({
    identifier: tag,
    content: {
      title: `Your ${month} payslip is ready`,
      body: net != null ? `Net pay ${money(net)}. Tap to see the breakup or download the PDF.` : "Tap to see it.",
      color: "#2F50E4",
      data: { id: tag, targetScreen: "Payslip", targetId: id, phone: "", title: "Payslip" },
    },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_REMINDERS } : null,
  }).catch(() => {})
}
