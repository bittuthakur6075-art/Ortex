import React from "react"

import MonthAttendance from "@/features/attendance/MonthAttendance"
import type { StackScreenProps } from "@/navigation/types"
import { AppScreen, ListRefreshControl } from "@/ui"

/**
 * My attendance, a month at a time: the same month Zoho People shows under its
 * check-in screen (MonthAttendance: the switcher, List / Calendar, the colour
 * legend, a timeline row per day and the month's counts), on a page of its own
 * for the links that open it directly (the Home card, notifications). A day
 * opens its detail.
 */
export default function AttendanceHistoryScreen({ navigation }: StackScreenProps<"AttendanceHistory">) {
  const [refreshing, setRefreshing] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [now] = React.useState(() => Date.now())

  return (
    <AppScreen
      title="My attendance"
      subtitle="Your days and hours"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      list={{
        data: [],
        renderItem: () => null,
        refreshControl: (
          <ListRefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              setRefreshKey((k) => k + 1)
            }}
          />
        ),
      }}
    >
      <MonthAttendance
        now={now}
        refreshKey={refreshKey}
        onLoaded={() => setRefreshing(false)}
        onOpen={(day) => navigation.navigate("AttendanceDay", { day })} />
    </AppScreen>
  )
}
