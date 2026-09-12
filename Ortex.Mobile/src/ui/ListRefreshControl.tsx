import React from "react"
import { RefreshControl, type RefreshControlProps } from "react-native"

import { useTheme } from "@/store/ThemeContext"

/**
 * Pull-to-refresh for the tab lists, themed once.
 *
 * Realtime covers changes while the app is open, but a rep walking out of a
 * dead zone has no way to say "now go and check" — and the store's `refreshing`
 * flag is exactly the spinner state this control needs. Pass the element as the
 * `refreshControl` of an `AppScreen` `list` / `sections`.
 *
 * IT MUST FORWARD `style` AND `children`, and that is not a nicety.
 *
 * On Android — and only on Android — `ScrollView` does not render this element
 * inside itself. It renders the WHOLE scroll view inside THIS one:
 *
 *     cloneElement(refreshControl, {style}, <NativeScrollView>…</NativeScrollView>)
 *
 * (react-native/Libraries/Components/ScrollView/ScrollView.js, the
 * AndroidSwipeRefreshLayout branch). So a wrapper that names only its own two
 * props and drops the rest throws the scroll view away, and every list using it
 * renders its app bar and nothing else: no header, no rows, not even the empty
 * state — which is exactly what all four tabs did. iOS puts the control inside
 * the ScrollView as a sibling of the content, so it hides the fault completely.
 */
export default function ListRefreshControl({
  refreshing,
  onRefresh,
  ...rest
}: {
  refreshing: boolean
  onRefresh: () => void | Promise<void>
} & Partial<RefreshControlProps>) {
  const t = useTheme()
  return (
    <RefreshControl
      {...rest}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      tintColor={t.primary}
      colors={[t.primary]}
      progressBackgroundColor={t.surface}
    />
  )
}
