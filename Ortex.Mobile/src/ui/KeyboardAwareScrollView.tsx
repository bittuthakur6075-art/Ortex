import React from "react"
import { ScrollView, type ScrollViewProps } from "react-native"

import { useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll"

/**
 * A ScrollView that lifts the focused field above the keyboard and reserves the
 * keyboard's height beneath its content.
 *
 * The mechanism, and why neither `adjustResize` nor `KeyboardAvoidingView` is
 * enough on its own, is in `hooks/useKeyboardAwareScroll.ts`. This is the plain
 * scroll view that wears it; `AppScreen` wears the same hook for every screen
 * built on the page shell.
 */
export default function KeyboardAwareScrollView({
  children,
  bottomOffset = 0,
  contentContainerStyle,
  ...rest
}: ScrollViewProps & {
  children: React.ReactNode
  /** Space kept below the content besides the keyboard — a sticky footer. */
  bottomOffset?: number
}) {
  const { ref, keyboard, onLayout, onScrollOffset } = useKeyboardAwareScroll<ScrollView>()

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      scrollEventThrottle={16}
      {...rest}
      // After the spread, so a caller passing its own handlers cannot quietly
      // disable the tracking these feed.
      ref={ref}
      onLayout={(e) => {
        onLayout(e)
        rest.onLayout?.(e)
      }}
      onScroll={(e) => {
        onScrollOffset(e)
        rest.onScroll?.(e)
      }}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: keyboard + bottomOffset }]}
    >
      {children}
    </ScrollView>
  )
}
