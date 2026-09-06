import React from "react"
import { PanResponder, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { feedback } from "@/lib/feedback"
import { font } from "@/theme/typography"

/**
 * The alphabet rail down the right edge, and the magnified bubble that follows
 * your thumb — Samsung Contacts' fast scroller.
 *
 * It is the reason an A–Z directory is usable at all on a phone: without it,
 * reaching "S" in four hundred contacts is a flick marathon. Dragging is
 * continuous (the list follows the thumb rather than waiting for a lift), and
 * each new letter ticks a selection haptic, which is what makes the rail feel
 * like a physical detent strip.
 *
 * PanResponder, not a gesture-handler Swipeable: this is a single vertical drag
 * on a fixed strip, and claiming the responder on touch start is exactly the
 * behaviour we want — the list underneath must NOT get the gesture.
 */

const LETTER_MIN_HEIGHT = 13
const RAIL_WIDTH = 26

export default function ContactIndexBar({
  letters,
  onPick,
  top,
  bottom,
}: {
  /** One entry per section, in list order. "★" is the favourites group. */
  letters: string[]
  /** Called with the section index the thumb is over. */
  onPick: (index: number) => void
  /** Insets so the rail clears the app bar and the floating tab capsule. */
  top: number
  bottom: number
}) {
  const t = useTheme()
  const [height, setHeight] = React.useState(0)
  const [active, setActive] = React.useState<number | null>(null)

  // Refs, because the PanResponder is created once and would otherwise close
  // over the first render's letters and height.
  const lettersRef = React.useRef(letters)
  const heightRef = React.useRef(0)
  const activeRef = React.useRef<number | null>(null)
  const onPickRef = React.useRef(onPick)
  lettersRef.current = letters
  onPickRef.current = onPick

  const resolve = React.useCallback((y: number) => {
    const count = lettersRef.current.length
    if (!count || !heightRef.current) return
    const step = heightRef.current / count
    const index = Math.min(count - 1, Math.max(0, Math.floor(y / step)))
    if (index === activeRef.current) return
    activeRef.current = index
    setActive(index)
    feedback.select()
    onPickRef.current(index)
  }, [])

  const release = React.useCallback(() => {
    activeRef.current = null
    setActive(null)
  }, [])

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // The list must never steal a drag that began on the rail.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => resolve(e.nativeEvent.locationY),
        onPanResponderMove: (e) => resolve(e.nativeEvent.locationY),
        onPanResponderRelease: release,
        onPanResponderTerminate: release,
      }),
    [resolve, release],
  )

  if (letters.length < 2) return null

  const step = height ? height / letters.length : 0
  const letterHeight = Math.max(LETTER_MIN_HEIGHT, step)

  return (
    <>
      {active !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.bubble,
            {
              backgroundColor: t.primary,
              top: top + Math.max(0, active * step + step / 2 - 34),
            },
          ]}
        >
          <Text style={[styles.bubbleText, { color: t.textOnPrimary }]}>{letters[active]}</Text>
        </View>
      )}

      <View
        {...responder.panHandlers}
        onLayout={(e) => {
          heightRef.current = e.nativeEvent.layout.height
          setHeight(e.nativeEvent.layout.height)
        }}
        // The rail is chrome for a sighted thumb; a screen reader user scrolls
        // the list itself, so it stays out of the accessibility tree.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.rail, { top, bottom }]}
      >
        {letters.map((letter, i) => (
          <View key={letter} style={{ height: letterHeight, justifyContent: "center" }}>
            <Text
              style={[
                styles.letter,
                { color: i === active ? t.primary : t.textFaint },
                i === active && styles.letterActive,
              ]}
            >
              {letter}
            </Text>
          </View>
        ))}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  rail: {
    position: "absolute",
    right: 0,
    width: RAIL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    fontSize: 10.5,
    lineHeight: 12,
    textAlign: "center",
    fontFamily: font.semibold,
  },
  letterActive: { fontSize: 12 },
  bubble: {
    position: "absolute",
    right: RAIL_WIDTH + 10,
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  bubbleText: { fontSize: 30, fontFamily: font.bold },
})
