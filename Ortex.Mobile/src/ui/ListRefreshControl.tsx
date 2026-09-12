import React from "react"
import { RefreshControl } from "react-native"

import { useTheme } from "@/store/ThemeContext"

/**
 * Pull-to-refresh for the tab lists, themed once.
 *
 * Realtime covers changes while the app is open, but a rep walking out of a
 * dead zone has no way to say "now go and check" — and the store's `refreshing`
 * flag is exactly the spinner state this control needs. Pass the element as the
 * `refreshControl` of an `AppScreen` `list` / `sections`.
 */
export default function ListRefreshControl({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean
  onRefresh: () => void | Promise<void>
}) {
  const t = useTheme()
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      tintColor={t.primary}
      colors={[t.primary]}
      progressBackgroundColor={t.surface}
    />
  )
}
