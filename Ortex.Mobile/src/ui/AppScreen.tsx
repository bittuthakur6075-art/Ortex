import React from "react"
import {
  Animated,
  Pressable,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { KeyboardAwareFocusProvider, useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll"
import { useTheme } from "@/store/ThemeContext"
import { border, gutter, size as sizes, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon from "@/ui/Icon"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"
import { arrivalStyle, useArrival } from "@/ui/motion"

/**
 * The page shell, and the One UI signature.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\AppScreen.jsx.
 *
 * One UI's defining screen behaviour is the COLLAPSING LARGE TITLE: a page opens
 * with its name set large in the body of the screen, and as you scroll the large
 * title slides away while the same words fade into the compact app bar. It is not
 * decoration — it is what keeps a phone's most valuable band (the top, under the
 * status bar) empty until the navigation chrome is actually needed.
 *
 * This owns all of it, so a screen only declares WHAT it is. It also owns the
 * things every screen would otherwise re-implement and get subtly different:
 * safe-area insets, the floating tab bar's bottom reserve, and the back
 * affordance.
 *
 * Pass FlatList/SectionList props via `list` rather than children when the screen
 * IS a list: wrapping a virtualised list in a ScrollView would break
 * virtualisation, which on hundreds of quotations is the difference between a
 * smooth list and a stutter.
 */

/** The band the large title occupies, and the distance the bar title fades over. */
const COLLAPSE_DISTANCE = 48

/** How far the page has to move before the app bar draws its bottom rule. */
const RULE_DISTANCE = 8

/**
 * How far each app-bar slot's DRAWN mark sits inside its own 44dp touch box. The
 * bar subtracts these so the back arrow and the avatar begin on the same 16dp
 * line the large title and the rows below use.
 */
const SLOT_INSET = { avatar: 4, back: 10, icon: 10 }

/**
 * What an external scroller (the Contacts alphabet rail) needs from the list
 * underneath it. Structural rather than the concrete SectionList/FlatList
 * instance, because `list` and `sections` mount different components and a screen
 * only ever drives the one it passed.
 */
export type ScrollableList = {
  scrollToLocation?: (opts: {
    sectionIndex: number
    itemIndex: number
    animated?: boolean
    viewOffset?: number
    viewPosition?: number
  }) => void
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void
}

type Props = {
  title: string
  subtitle?: string
  /** The app bar's right slot. */
  headerRight?: React.ReactNode
  /**
   * The app bar's left slot on a TAB ROOT — the profile avatar, typically.
   * Ignored when `back` is set: a pushed screen owns that slot outright, and the
   * back arrow always wins it.
   */
  headerLeft?: React.ReactNode
  /** Show the back arrow; the left slot is its outright. */
  back?: boolean
  onBack?: () => void
  /** Pinned under the title — a search field, a segmented control. */
  children?: React.ReactNode
  /** Renders a virtualised list whose scroll drives the collapse. */
  list?: React.ComponentProps<typeof Animated.FlatList>
  /** The grouped counterpart of `list`, for a SectionList screen. */
  sections?: React.ComponentProps<typeof Animated.SectionList>
  /** A ref onto the underlying list, so a fast scroller can drive it. */
  listRef?: React.Ref<ScrollableList>
  /** Drawn over the list: a fast-scroll rail, a selection action bar. */
  overlay?: React.ReactNode
  /** The screen sits inside the tab navigator, so content clears the tab capsule. */
  inTabs?: boolean
  /**
   * Stand the page on the RECESSED plane rather than the surface. A page whose
   * groups are separate cards needs it: card and page are both #FFFFFF, so on
   * the default ground the cards would have no edge to be separate at.
   */
  inset?: boolean
  contentStyle?: StyleProp<ViewStyle>
  /**
   * A control that PINS under the app bar once the content has carried its
   * in-list twin out of view — the Catalogue's underline tabs standing in for
   * its segmented control. Pass the pill in `children` and this copy here; both
   * read the same state, so touching either moves both.
   */
  stickyBar?: React.ReactNode
  /**
   * The content offset at which the handover happens: the bottom edge of the
   * in-list twin, MEASURED by the screen (`onLayout` y + height) rather than
   * guessed, because it moves with the subtitle and any notice above it.
   */
  stickyThreshold?: number
  /**
   * Changes when the content under the sticky bar is swapped (a new segment).
   * If the page is scrolled past `stickyThreshold` at that moment, the shell
   * scrolls back to exactly the threshold: the bar stays pinned and the new
   * collection starts at its first row instead of mid-way down.
   */
  stickyKey?: string
}

export default function AppScreen({
  title,
  subtitle,
  headerRight,
  headerLeft,
  back = false,
  onBack,
  children,
  list,
  sections,
  listRef,
  overlay,
  inTabs = true,
  inset = false,
  contentStyle,
  stickyBar,
  stickyThreshold = 0,
  stickyKey,
}: Props) {
  const c = useTheme()
  const ground = inset ? c.surfaceInset : c.background
  const insets = useSafeAreaInsets()
  const scrollY = React.useRef(new Animated.Value(0)).current
  const keyboardAware = useKeyboardAwareScroll<ScrollView>()

  // THE ARRIVAL. The native stack slides the page in; One UI then lets its
  // content SETTLE: the large title and each section below it fade up a few dp,
  // one step after another, so the page lands top to bottom as one wave. A list
  // settles as one piece instead (its rows are virtualised, and staggering them
  // would replay on every recycle). Once per mount, native, and skipped under
  // reduced motion. The styles are built once: a form re-renders on every
  // keystroke, and a fresh interpolation each time would re-attach the nodes.
  const arrival = useArrival()
  const isList = Boolean(list || sections)
  const arrivalStyles = React.useMemo(
    () => Array.from({ length: 8 }, (_, i) => arrivalStyle(arrival, i)),
    [arrival],
  )
  const arrivalAt = (i: number) => arrivalStyles[Math.min(i, arrivalStyles.length - 1)]

  // The shell holds the list itself, because it owns the scroll and so owns
  // putting it back (`stickyKey`); a screen's `listRef` is a proxy onto it.
  const innerListRef = React.useRef<ScrollableList | null>(null)
  React.useImperativeHandle(
    listRef,
    () => ({
      scrollToLocation: (opts) => innerListRef.current?.scrollToLocation?.(opts),
      scrollToOffset: (opts) => innerListRef.current?.scrollToOffset?.(opts),
    }),
    [],
  )
  const offsetY = React.useRef(0)
  const [viewportHeight, setViewportHeight] = React.useState(0)

  // The large title occupies its own band; the compact bar title cross-fades in
  // over exactly that distance, so the two never both read as the page heading.
  const barTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_DISTANCE * 0.4, COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })
  const largeTitleOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE * 0.8],
    outputRange: [1, 0],
    extrapolate: "clamp",
  })
  const largeTitleShift = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [0, -12],
    extrapolate: "clamp",
  })
  // The bar's rule (1dp of `divider`) is drawn ONLY once the page has moved
  // under it. At rest the bar and the canvas are one unbroken white plane and
  // there is nothing to separate — a rule there is a line drawn across nothing,
  // and it cuts the large title off from the bar it belongs to. The moment
  // content slides beneath the bar, that same rule is the only thing saying
  // where the chrome stops and the page begins, so it fades in over the first
  // few dp of scroll: fast enough to be there before anything reaches it, slow
  // enough not to blink.
  const barRuleOpacity = scrollY.interpolate({
    inputRange: [0, RULE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })

  /**
   * The sticky bar's handover, over the last 16dp before its in-list twin slides
   * under the bar. Short on purpose: this is a SWAP, not a reveal — the same
   * switch in two costumes, and the eye should read one replacing the other.
   *
   * `stuck` mirrors the threshold in React state because `pointerEvents` cannot
   * be animated: at opacity 0 an `auto` overlay would still swallow every tap in
   * a band across the top of the list, and the taps it eats are the first rows.
   */
  const HANDOVER = 16
  const stickyOpacity = scrollY.interpolate({
    inputRange: [stickyThreshold - HANDOVER, stickyThreshold],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })
  const stickyShift = scrollY.interpolate({
    inputRange: [stickyThreshold - HANDOVER, stickyThreshold],
    outputRange: [-8, 0],
    extrapolate: "clamp",
  })
  const [stuck, setStuck] = React.useState(false)
  const stuckRef = React.useRef(false)

  const trackOffset = React.useCallback(
    (y: number) => {
      offsetY.current = y
      if (!stickyBar) return
      const next = stickyThreshold > 0 && y >= stickyThreshold
      if (next !== stuckRef.current) {
        stuckRef.current = next
        setStuck(next)
      }
    },
    [stickyBar, stickyThreshold],
  )

  // A new segment under a pinned bar: return to the threshold, not to the top,
  // so the bar stays where the thumb just was. Unpinned, the page is already
  // showing the start of the list and nothing moves.
  const lastStickyKey = React.useRef(stickyKey)
  React.useEffect(() => {
    if (lastStickyKey.current === stickyKey) return
    lastStickyKey.current = stickyKey
    if (!stickyBar || stickyThreshold <= 0 || offsetY.current <= stickyThreshold) return
    innerListRef.current?.scrollToOffset?.({ offset: stickyThreshold, animated: false })
    scrollY.setValue(stickyThreshold)
    trackOffset(stickyThreshold)
  }, [stickyKey, stickyBar, stickyThreshold, scrollY, trackOffset])

  const appBar = (
    <View style={[styles.bar, { height: sizes.appBar, backgroundColor: c.appBar }]}>
      <View style={styles.barLeft}>
        {back ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={[styles.slot, { marginLeft: gutter - SLOT_INSET.back }]}
          >
            <Icon name="back" size={24} color={c.text} />
          </Pressable>
        ) : headerLeft ? (
          // The avatar's own drawn inset (4, against the arrow's 10), so its edge
          // begins on the same 16dp line the large title and the rows below use.
          <View style={{ marginLeft: gutter - SLOT_INSET.avatar }}>{headerLeft}</View>
        ) : (
          <View style={{ width: gutter }} />
        )}
      </View>

      {/* Present in the tree from the start rather than mounted on scroll, so its
          fade is a pure opacity animation and never a layout change. */}
      <Animated.View style={[styles.barTitle, { opacity: barTitleOpacity }]} pointerEvents="none">
        <Text
          numberOfLines={1}
          style={[
            back ? textVariants.appBarTitleBack : textVariants.appBarTitle,
            // Android pads ascent and descent asymmetrically, which drops the
            // title a couple of dp below the slot's optical centre.
            { color: c.text, includeFontPadding: false, textAlignVertical: "center" },
          ]}
        >
          {title}
        </Text>
      </Animated.View>

      <View style={[styles.barRight, { marginRight: gutter - SLOT_INSET.icon }]}>{headerRight}</View>

      {/* While a sticky bar is pinned it brings its own bottom rule, and two
          rules 30dp apart read as a box drawn around the tabs. So this one hands
          its job over on exactly the curve the sticky bar arrives on. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.barRule,
          {
            opacity: stickyBar
              ? Animated.multiply(
                  barRuleOpacity,
                  stickyOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                )
              : barRuleOpacity,
            backgroundColor: c.divider,
          },
        ]}
      />
    </View>
  )

  const largeTitle = (
    <Animated.View
      style={{
        paddingHorizontal: gutter,
        paddingTop: spacing.xs,
        paddingBottom: subtitle ? spacing.sm : spacing.md,
        // The scroll collapse and the arrival compose: one is the page moving
        // under the bar, the other the page landing. A list arrives as a whole,
        // so its title rides that instead of arriving twice.
        opacity: isList ? largeTitleOpacity : Animated.multiply(largeTitleOpacity, arrivalAt(0).opacity),
        transform: [
          {
            translateY: isList
              ? largeTitleShift
              : Animated.add(largeTitleShift, arrivalAt(0).transform[0].translateY),
          },
        ],
      }}
    >
      <Text accessibilityRole="header" style={[textVariants.largeTitle, { color: c.text }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[textVariants.screenSubtitle, { color: c.textSecondary, marginTop: 2 }]}>
          {subtitle}
        </Text>
      ) : null}
    </Animated.View>
  )

  // The floating capsule is drawn over the content, so the list reserves its
  // height plus the lift rather than the navigator reserving space.
  const bottomReserve = inTabs ? insets.bottom + TAB_BAR_HEIGHT + spacing.lg : insets.bottom + spacing.lg

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    // The native driver still forwards the event to a JS listener, which is how
    // the keyboard helper knows where the user has scrolled to.
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      keyboardAware.onScrollOffset(e)
      trackOffset(e.nativeEvent.contentOffset.y)
    },
  })

  return (
    // The status bar and the app bar are always white (owner, 2026-09-27); on an
    // inset page the grey canvas is painted by the scroller alone, so no grey
    // band shows between the status bar and the bar.
    <View style={[styles.root, { backgroundColor: c.appBar, paddingTop: insets.top }]}>
      {appBar}
      {sections ? (
        <Animated.SectionList
          ref={innerListRef as never}
          {...sections}
          style={[{ backgroundColor: ground }, sections.style, arrivalAt(1)]}
          // Cards live in the list header; Android detaching "off-screen" views
          // crops their drawn corners mid-scroll.
          removeClippedSubviews={inset ? false : sections.removeClippedSubviews}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              {largeTitle}
              {children}
            </>
          }
          contentContainerStyle={[
            { paddingBottom: bottomReserve },
            sections.contentContainerStyle,
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
        />
      ) : list ? (
        <Animated.FlatList
          ref={innerListRef as never}
          {...list}
          style={[{ backgroundColor: ground }, list.style, arrivalAt(1)]}
          removeClippedSubviews={inset ? false : list.removeClippedSubviews}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              {largeTitle}
              {children}
              {list.ListHeaderComponent as React.ReactElement}
            </>
          }
          onLayout={(e) => {
            setViewportHeight(e.nativeEvent.layout.height)
            list.onLayout?.(e)
          }}
          contentContainerStyle={[
            { paddingBottom: bottomReserve },
            // With a sticky bar the list is never shorter than one screen past
            // the threshold, so a switch to a SHORT collection (an empty gallery)
            // can still sit at the threshold. Without it the offset clamps to 0,
            // the pill is back on screen, and the pinned copy is drawn over it.
            stickyBar && viewportHeight > 0 ? { minHeight: viewportHeight + stickyThreshold } : null,
            list.contentContainerStyle,
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        // The non-list branch is where every FORM in this app lives, so it is
        // keyboard-aware: the focused field is lifted clear of the keyboard, and
        // the keyboard's height is added below the content so the last field can
        // be reached at all. See hooks/useKeyboardAwareScroll.ts.
        <Animated.ScrollView
          ref={keyboardAware.ref as never}
          style={{ backgroundColor: ground }}
          onScroll={onScroll}
          onLayout={keyboardAware.onLayout}
          scrollEventThrottle={16}
          contentContainerStyle={[{ paddingBottom: bottomReserve + keyboardAware.keyboard }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {largeTitle}
          {/* Fields inside report their focus, so moving between them corrects
              the scroll — the keyboard only announces itself once. */}
          <KeyboardAwareFocusProvider value={keyboardAware.reportFocus}>
            {React.Children.toArray(children).map((child, i) => (
              <Animated.View
                key={React.isValidElement(child) && child.key != null ? child.key : i}
                style={arrivalAt(i + 1)}
              >
                {child}
              </Animated.View>
            ))}
          </KeyboardAwareFocusProvider>
        </Animated.ScrollView>
      )}
      {/* An OVERLAY, not a layout row: inserting real height mid-scroll would
          shove the list by that height at the moment someone is reading it. */}
      {stickyBar ? (
        <Animated.View
          pointerEvents={stuck ? "auto" : "none"}
          style={[
            styles.sticky,
            {
              top: insets.top + sizes.appBar,
              backgroundColor: c.appBar,
              borderBottomColor: c.divider,
              opacity: stickyOpacity,
              transform: [{ translateY: stickyShift }],
            },
          ]}
        >
          {stickyBar}
        </Animated.View>
      ) : null}
      {overlay}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
  },
  barLeft: { flexDirection: "row", alignItems: "center" },
  slot: {
    width: sizes.touchMin,
    height: sizes.touchMin,
    alignItems: "center",
    justifyContent: "center",
  },
  barTitle: { flex: 1, justifyContent: "center" },
  // 2dp between trailing actions. Each IconButton already carries its own 44dp
  // touch slot around a 24dp glyph, so this is the gap between those slots — the
  // glyphs themselves still read about 22dp apart.
  barRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  // 1dp, not `StyleSheet.hairlineWidth`: a hairline is 0.33dp on a 3x phone, one
  // physical pixel of `divider`, which is invisible in the hand.
  barRule: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: border.hairline,
  },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: border.hairline,
  },
})
