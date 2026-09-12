import { createNavigationContainerRef } from "@react-navigation/native"

import type { RootStackParamList } from "@/navigation/types"

/**
 * Navigation from outside React.
 *
 * A notification tapped in the shade arrives on the OS listener, not in a
 * component tree with a `navigation` prop — and on a cold start it arrives
 * before the container has even mounted. `navigateWhenReady` holds the last
 * such intent and replays it once the container is up, which is the difference
 * between "tapping a lead opens the lead" and "tapping a lead opens the app".
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>()

type Pending = { name: keyof RootStackParamList; params?: object } | null

let pending: Pending = null

export function navigateWhenReady<T extends keyof RootStackParamList>(
  name: T,
  params?: RootStackParamList[T],
) {
  if (navigationRef.isReady()) {
    // The container's navigate() is overloaded per route, and this helper is
    // deliberately route-agnostic — the cast is where that generality is paid for.
    ;(navigationRef.navigate as (n: string, p?: object) => void)(name, params as object)
    return
  }
  pending = { name, params: params as object }
}

/** Called by the container's onReady. */
export function flushPendingNavigation() {
  if (!pending || !navigationRef.isReady()) return
  const { name, params } = pending
  pending = null
  ;(navigationRef.navigate as (n: string, p?: object) => void)(name, params)
}
