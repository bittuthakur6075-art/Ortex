import React from "react"
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { SPRING, useReducedMotion } from "@/ui/motion"

/**
 * The alphabet rail down the right edge, and the bubble that follows your thumb:
 * One UI Contacts' fast scroller.
 *
 * Touch down anywhere on the rail and the list is already at that letter; drag
 * and it follows letter by letter, a selection tick on each, with no animation
 * on the list itself (One UI jumps, it does not glide, so the thumb and the list
 * never disagree). What moves smoothly is the chrome: a track fades in behind
 * the letters, and the bubble springs in and glides between letters.
 *
 * TWO THINGS MADE THE OLD RAIL MISS. `locationY` is measured from the view the
 * finger is over, and with tappable letter views inside, that was the LETTER, so
 * every touch read as "near the top of a 13dp box". The rail is now `box-only`,
 * so it is always the touch target and `locationY` is along the rail. And the
 * jump itself is an exact offset (ContactsScreen `jumpTo`), not scrollToLocation
 * into rows the list has never measured.
 *
 * The letters sit as a compact column centred on the rail rather than spread
 * over its whole height, so eight letters do not turn into a sparse ladder; a
 * touch above or below the column clamps to the first or last letter.
 */

const LETTER_MAX = 18
const RAIL_WIDTH = 30
const BUBBLE = 64

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
  const reduce = useReducedMotion()
  const [height, setHeight] = React.useState(0)
  const [active, setActive] = React.useState<number | null>(null)
  // What the bubble shows. Kept after release so it does not blank while fading.
  const [shown, setShown] = React.useState(0)

  const presence = React.useRef(new Animated.Value(0)).current
  const bubbleY = React.useRef(new Animated.Value(0)).current

  const count = letters.length
  const letterH = height && count ? Math.min(LETTER_MAX, height / count) : LETTER_MAX
  const blockTop = Math.max(0, (height - letterH * count) / 2)

  // The responder is built once; it reads everything current through this ref.
  const live = React.useRef({ count, letterH, blockTop, onPick, reduce, index: -1 })
  live.current = { ...live.current, count, letterH, blockTop, onPick, reduce }

  const show = React.useCallback(
    (on: boolean) => {
      if (live.current.reduce) presence.setValue(on ? 1 : 0)
      else Animated.spring(presence, { toValue: on ? 1 : 0, ...SPRING.pop, useNativeDriver: true }).start()
    },
    [presence],
  )

  const resolve = React.useCallback(
    (y: number, first: boolean) => {
      const { count: n, letterH: h, blockTop: b } = live.current
      if (!n) return
      const index = Math.min(n - 1, Math.max(0, Math.floor((y - b) / h)))
      if (index === live.current.index) return
      live.current.index = index
      setActive(index)
      setShown(index)
      const centre = b + index * h + h / 2 - BUBBLE / 2
      if (first || live.current.reduce) bubbleY.setValue(centre)
      else Animated.spring(bubbleY, { toValue: centre, ...SPRING.follow, useNativeDriver: true }).start()
      feedback.select()
      live.current.onPick(index)
    },
    [bubbleY],
  )

  const release = React.useCallback(() => {
    live.current.index = -1
    setActive(null)
    show(false)
  }, [show])

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // The list must never steal a drag that began on the rail.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          show(true)
          resolve(e.nativeEvent.locationY, true)
        },
        onPanResponderMove: (e) => resolve(e.nativeEvent.locationY, false),
        onPanResponderRelease: release,
        onPanResponderTerminate: release,
      }),
    [resolve, release, show],
  )

  if (count < 2) return null

  const scale = presence.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] })

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bubble,
          {
            top,
            backgroundColor: t.primary,
            opacity: presence,
            transform: [{ translateY: bubbleY }, { scale }],
          },
        ]}
      >
        <Text style={[styles.bubbleText, { color: t.textOnPrimary }]}>{letters[shown] ?? ""}</Text>
      </Animated.View>

      <View
        {...responder.panHandlers}
        // The rail, never a letter, is the touch target: see the note above.
        pointerEvents="box-only"
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        // The rail is chrome for a sighted thumb; a screen reader user scrolls
        // the list itself, so it stays out of the accessibility tree.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.rail, { top, bottom }]}
      >
        <Animated.View
          style={[
            styles.track,
            { top: blockTop - 6, height: letterH * count + 12, backgroundColor: t.surfaceInset, opacity: presence },
          ]}
        />
        <View style={{ marginTop: blockTop }}>
          {letters.map((letter, i) => (
            <View key={letter} style={[styles.cell, { height: letterH }]}>
              <Text
                style={[
                  styles.letter,
                  { color: i === active ? t.primary : t.textTertiary },
                  i === active && styles.letterActive,
                ]}
              >
                {letter}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  rail: {
    position: "absolute",
    right: 2,
    width: RAIL_WIDTH,
  },
  track: {
    position: "absolute",
    left: 5,
    right: 5,
    borderRadius: 10,
  },
  cell: { alignItems: "center", justifyContent: "center" },
  letter: {
    fontSize: 11,
    lineHeight: 13,
    textAlign: "center",
    fontFamily: font.semibold,
  },
  letterActive: { fontFamily: font.bold },
  bubble: {
    position: "absolute",
    right: RAIL_WIDTH + 14,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  bubbleText: { fontSize: 28, lineHeight: 34, fontFamily: font.bold },
})
