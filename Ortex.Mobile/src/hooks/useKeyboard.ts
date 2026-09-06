import React from "react"
import { Keyboard, Platform, type KeyboardEvent } from "react-native"

/**
 * How much of the screen the keyboard is currently covering, in dp.
 *
 * Android's `adjustResize` (set in AndroidManifest.xml) shrinks the ACTIVITY,
 * which is enough for a plain form — but it does nothing for content inside a
 * `Modal` (our bottom sheets are modals), and it never scrolls the field you are
 * typing in above the keyboard. Both of those need the height as a number, so
 * this is the one place that computes it.
 *
 * `keyboardWillShow` fires ahead of the animation on iOS and never fires on
 * Android, so the event names are chosen per platform rather than assuming one.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = React.useState(0)

  React.useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"

    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setHeight(e.endCoordinates?.height ?? 0)
    })
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0))

    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return height
}
