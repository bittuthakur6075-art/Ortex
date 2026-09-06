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
 * So we measure the focused field against the top of the keyboard and scroll by
 * exactly the overlap plus a margin. The caller also gets `keyboard` — its height
 * — to add as bottom padding, without which the LAST field in a form cannot be
 * scrolled to at all.
 *
 * TWO THINGS THIS GETS RIGHT, both of which it got wrong before:
 *
 *   IT RUNS ON FOCUS, NOT JUST ON THE KEYBOARD APPEARING. Only `keyboardDidShow`
 *   fired the correction, so the FIRST field you tapped was lifted and every one
 *   after it was not: tapping a second field while the keyboard is already up
 *   raises no keyboard event, so nothing moved. On a form like New Contact that
 *   is most of the fields. `TextField` reports its focus through the context
 *   below, which is why every input in the app inherits this.
 *
 *   IT MEASURES IN WINDOW COORDINATES against the keyboard's own `screenY`,
 *   rather than measuring the input against the scroll view. `measureLayout`
 *   wants a ref to a host component; under the New Architecture it warns and
 *   measures nothing when handed anything else, and the failure is silent — the
 *   callback simply never runs. Window coordinates need no such ref, and the
 *   keyboard event already says where its top edge is on both platforms.
 *
 * Every measurement is guarded: a view can be detached mid-measure, and a form
 * that scrolls imperfectly is a far smaller problem than a crash halfway through
 * a quotation.
 */

/** Breathing room between the focused field and the top of the keyboard. */
const MARGIN = 24

type Scrollable = { scrollTo: (opts: { y: number; animated?: boolean }) => void }

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }

/**
 * Lets `TextField` tell the scroll view above it that focus moved, without
 * either of them importing the other. Absent by default, so an input rendered
 * outside a keyboard-aware scroll view simply does nothing.
 */
const FocusRelay = React.createContext<(() => void) | null>(null)

export const KeyboardAwareFocusProvider = FocusRelay.Provider

/** Called by inputs on focus. A no-op when there is no aware scroll view above. */
export function useReportFocus() {
  return React.useContext(FocusRelay)
}

export function useKeyboardAwareScroll<T extends Scrollable>() {
  const ref = React.useRef<T | null>(null)
  const [keyboard, setKeyboard] = React.useState(0)
  // Tracked rather than read back: the correction is applied against where the
  // user has already scrolled to.
  const offsetY = React.useRef(0)
  const viewportHeight = React.useRef(0)
  // Where the keyboard's top edge sits, in window coordinates. Kept from the
  // last keyboard event so a focus change can be corrected without waiting for
  // another one — there will not be another one.
  const keyboardTop = React.useRef(0)

  const scrollFocusedIntoView = React.useCallback(() => {
    const scroll = ref.current
    const input = TextInput.State.currentlyFocusedInput() as unknown as Measurable | null
    if (!scroll || !input?.measureInWindow || !keyboardTop.current) return

    try {
      input.measureInWindow((_x, y, _w, h) => {
        // Guard against a measure that lands after the view is gone: RN reports
        // zeroes rather than failing, and acting on them would scroll the form
        // to a position nothing asked for.
        if (!h) return
        const overlap = y + h + MARGIN - keyboardTop.current
        if (overlap > 0) scroll.scrollTo({ y: offsetY.current + overlap, animated: true })
      })
    } catch {
      // The view went away between focus and measure. Nothing to scroll to.
    }
  }, [])

  React.useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      const height = e.endCoordinates?.height ?? 0
      // `screenY` is the top of the keyboard. Taking it from the event rather
      // than deriving it from the window height keeps this correct with a
      // floating or split keyboard, and on Android where the window has already
      // been resized by the time this fires.
      keyboardTop.current = e.endCoordinates?.screenY ?? 0
      setKeyboard(height)
      // One frame's grace, so the resized viewport and the new bottom padding
      // are both in place before anything is measured against them.
      requestAnimationFrame(scrollFocusedIntoView)
    })
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = 0
      setKeyboard(0)
    })

    return () => {
      show.remove()
      hide.remove()
    }
  }, [scrollFocusedIntoView])

  /**
   * What an input calls when it takes focus. Deferred a frame because the field
   * that has just been tapped is not yet the "currently focused input" when its
   * own onFocus runs.
   */
  const reportFocus = React.useCallback(() => {
    requestAnimationFrame(scrollFocusedIntoView)
  }, [scrollFocusedIntoView])

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    viewportHeight.current = e.nativeEvent.layout.height
  }, [])

  const onScrollOffset = React.useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y
  }, [])

  return { ref, keyboard, onLayout, onScrollOffset, reportFocus }
}
