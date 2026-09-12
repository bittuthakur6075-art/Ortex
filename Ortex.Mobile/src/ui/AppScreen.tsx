import React from "react"
import {
  Animated,
  Pressable,
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
}: Props) {
  const c = useTheme()
  const ground = inset ? c.surfaceInset : c.background
  const insets = useSafeAreaInsets()
  const scrollY = React.useRef(new Animated.Value(0)).current
  const keyboardAware = useKeyboardAwareScroll<ScrollView>()

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
  // The bar's rule (1dp of `divider`) is drawn ALWAYS, not only once the
  // compact title has taken over. Every AppScreen puts a white canvas under this
  // bar, and a white bar over a white page has no edge at all: the rule is the
  // only thing saying where the chrome stops. A header over a GREY plane needs no
  // rule and must not draw one.
  const barRuleOpacity = 1

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

      <Animated.View
        pointerEvents="none"
        style={[styles.barRule, { opacity: barRuleOpacity, backgroundColor: c.divider }]}
      />
    </View>
  )

  const largeTitle = (
    <Animated.View
      style={{
        paddingHorizontal: gutter,
        paddingTop: spacing.xs,
        paddingBottom: subtitle ? spacing.sm : spacing.md,
        opacity: largeTitleOpacity,
        transform: [{ translateY: largeTitleShift }],
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
    listener: keyboardAware.onScrollOffset,
  })

  return (
    <View style={[styles.root, { backgroundColor: ground, paddingTop: insets.top }]}>
      {appBar}
      {sections ? (
        <Animated.SectionList
          ref={listRef as never}
          {...sections}
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
          ref={listRef as never}
          {...list}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              {largeTitle}
              {children}
              {list.ListHeaderComponent as React.ReactElement}
            </>
          }
          contentContainerStyle={[{ paddingBottom: bottomReserve }, list.contentContainerStyle, contentStyle]}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        // The non-list branch is where every FORM in this app lives, so it is
        // keyboard-aware: the focused field is lifted clear of the keyboard, and
        // the keyboard's height is added below the content so the last field can
        // be reached at all. See hooks/useKeyboardAwareScroll.ts.
        <Animated.ScrollView
          ref={keyboardAware.ref as never}
          onScroll={onScroll}
          onLayout={keyboardAware.onLayout}
          scrollEventThrottle={16}
          contentContainerStyle={[
            { paddingBottom: bottomReserve + keyboardAware.keyboard },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {largeTitle}
          {/* Fields inside report their focus, so moving between them corrects
              the scroll — the keyboard only announces itself once. */}
          <KeyboardAwareFocusProvider value={keyboardAware.reportFocus}>{children}</KeyboardAwareFocusProvider>
        </Animated.ScrollView>
      )}
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
})
