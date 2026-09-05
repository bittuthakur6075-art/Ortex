import React from "react"
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { gutter, size as sizes, spacing } from "@/theme/tokens"
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
  /** The screen sits inside the tab navigator, so content clears the tab capsule. */
  inTabs?: boolean
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
  inTabs = true,
  contentStyle,
}: Props) {
  const c = useTheme()
  const insets = useSafeAreaInsets()
  const scrollY = React.useRef(new Animated.Value(0)).current

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
  // The bar's hairline only appears once the compact title has taken over —
  // before that the bar is empty chrome and a rule under nothing reads as debris.
  const barRuleOpacity = barTitleOpacity

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
  })

  return (
    <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {appBar}
      {sections ? (
        <Animated.SectionList
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
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[{ paddingBottom: bottomReserve }, contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {largeTitle}
          {children}
        </Animated.ScrollView>
      )}
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
  barRight: { flexDirection: "row", alignItems: "center" },
  barRule: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
})
