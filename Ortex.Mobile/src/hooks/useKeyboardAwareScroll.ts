import React from "react"
import {
  Keyboard,
  Platform,
  TextInput,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"

/**
 * Keeps the field you are typing in above the keyboard, inside any scroll view.
 *
 * Neither of the two usual answers does this:
 *
 *   `android:windowSoftInputMode="adjustResize"` (set in AndroidManifest.xml)
 *   shrinks the activity, so the scroll view gets shorter — but its content does
 *   not move, and a field in the lower half of a form is simply covered.
 *
 *   `KeyboardAvoidingView` pads or translates the WHOLE view. On a scrolling form
 *   that is either a no-op (`behavior={undefined}`, which is what this app was
 *   passing on Android) or it pushes the top of the form off the screen.
 *
 * So when the keyboard appears we ask RN which input is focused, measure it
 * against the scroll view, and scroll by exactly the overlap plus a margin. The
 * caller also gets `keyboard` — its height — to add as bottom padding, without
 * which the LAST field in a form cannot be scrolled to at all on iOS.
 *
 * Every measurement is guarded: a view can be detached mid-measure, and a form
 * that scrolls imperfectly is a far smaller problem than a crash halfway through
 * a quotation.
 */

/** Breathing room between the focused field and the top of the keyboard. */
const MARGIN = 24

type Scrollable = { scrollTo: (opts: { y: number; animated?: boolean }) => void }

export function useKeyboardAwareScroll<T extends Scrollable>() {
  const ref = React.useRef<T | null>(null)
  const [keyboard, setKeyboard] = React.useState(0)
  // Tracked rather than read back: `measureLayout` reports a position in CONTENT
  // space, so the correction has to be applied against where the user has
  // already scrolled to.
  const offsetY = React.useRef(0)
  const viewportHeight = React.useRef(0)

  const scrollFocusedIntoView = React.useCallback((keyboardHeight: number) => {
    const scroll = ref.current
    const input = TextInput.State.currentlyFocusedInput()
    if (!scroll || !input) return

    // The HOST node, not a node handle. Under the New Architecture
    // `measureLayout` takes a ref to a native component and warns — "ref.measureLayout
    // must be called with a ref to a native component" — when handed the number
    // `findNodeHandle` returns, then measures nothing, so the focused field never
    // moves. `getNativeScrollRef` is what ScrollView exposes for exactly this;
    // the fallback covers a plain view that is already its own host node.
    const scrollNode =
      (scroll as unknown as { getNativeScrollRef?: () => unknown }).getNativeScrollRef?.() ?? scroll
    if (!scrollNode) return

    try {
      input.measureLayout(
        scrollNode as Parameters<typeof input.measureLayout>[0],
        (_x: number, y: number, _w: number, h: number) => {
          // On Android the window has ALREADY shrunk by the keyboard's height,
          // so subtracting it again would scroll twice as far as needed.
          const visible =
            Platform.OS === "ios" ? viewportHeight.current - keyboardHeight : viewportHeight.current
          const overlap = y + h - offsetY.current - visible + MARGIN
          if (overlap > 0) scroll.scrollTo({ y: offsetY.current + overlap, animated: true })
        },
        () => {},
      )
    } catch {
      // The view went away between focus and measure. Nothing to scroll to.
    }
  }, [])

  React.useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      const height = e.endCoordinates?.height ?? 0
      setKeyboard(height)
      // One frame's grace, so the resized viewport and the new bottom padding
      // are both in place before anything is measured against them.
      requestAnimationFrame(() => scrollFocusedIntoView(height))
    })
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0))

    return () => {
      show.remove()
      hide.remove()
    }
  }, [scrollFocusedIntoView])

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    viewportHeight.current = e.nativeEvent.layout.height
  }, [])

  const onScrollOffset = React.useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y
  }, [])

  return { ref, keyboard, onLayout, onScrollOffset }
}
