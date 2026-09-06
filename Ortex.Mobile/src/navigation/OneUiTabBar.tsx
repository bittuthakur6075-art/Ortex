import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { BlurView } from "expo-blur"
import { LinearGradient } from "expo-linear-gradient"
import React from "react"
import { Animated, Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { feedback } from "@/lib/feedback"
import { blurTargetRef } from "@/navigation/blurTarget"
import { useIsDark, useTheme } from "@/store/ThemeContext"
import { radius } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

/**
 * The bottom navigation — a LIQUID GLASS capsule of four labelled icons.
 *
 * Structurally still the floating bar ported from
 * C:\code\capnix\Capnix.Mobile.Partner\src\navigation\UserNavigator.jsx: detached
 * from the screen edges, lifted clear of the home indicator, and carrying the ONLY
 * shadow in the app (`colors.barShadow`, contact + ambient) through the
 * `boxShadow` prop rather than native elevation — elevation cannot coexist with
 * the `overflow: "hidden"` the blur needs in order to be clipped to the capsule.
 *
 * The MATERIAL is Apple's iOS-26 idiom, built from four stacked layers because
 * React Native has no single "glass" primitive:
 *   1. `BlurView` — the real backdrop sample.
 *   2. a thin wash — barely opaque, just enough that the capsule still reads as a
 *      surface where the backdrop behind it happens to be flat.
 *   3. a vertical sheen — bright at the top, clear by the middle, faintly back at
 *      the bottom. This is light refracting THROUGH the slab, and it is what
 *      separates glass from a frosted rectangle.
 *   4. a rim: a hairline all the way round, plus a brighter inset specular line
 *      along the top edge where a real bevel would catch the light.
 * The wash stays thin deliberately: opacity here buys legibility and costs the
 * whole effect, so contrast is bought with the sheen and rim instead.
 *
 * EACH TAB IS A GLYPH OVER ITS NAME (10/medium, 2dp under the icon), and ONLY
 * THE SELECTED TAB IS FILLED: idle tabs are a bare Linear glyph on the glass, the
 * current one a light brand-tint disc under a Bold brand glyph. Icon and label
 * are both stacked pairs cross-faded on the same `near` value, because neither an
 * Iconsax variant nor a text colour is a property the native driver can animate.
 *
 * One consequence worth knowing before editing:
 *   - An idle glyph has nothing but blurred backdrop behind it, so its contrast
 *     is whatever happens to be scrolling underneath. That is the price of the
 *     bare look; if idle tabs ever read as unavailable, the fix is to put a chip
 *     back under them, not to darken the glyph.
 *
 * The press bounce is a `scale`, native-driven, on the chip itself.
 */

/**
 * Minimum side margin, NOT the capsule's width — the capsule hugs its chips and
 * is centred. At 80dp chips the row is already 340dp wide, so this is down to 8:
 * a 360dp phone has only 20dp to spare and half of it goes each side.
 */
const BAR_INSET_X = 8
const BAR_LIFT = 10
/** Inset of the tabs from the capsule's own edges, on all four. */
const INNER_PADDING = 4
/**
 * The chip each glyph sits in — a stadium, wider than it is tall, painted only
 * under the selected tab.
 *
 * The width is a BUDGET as much as a look: the row must fit
 * 4 * CHIP_W + 3 * TAB_GAP + 2 * INNER_PADDING = 340dp inside the 344dp a 360dp
 * screen leaves after BAR_INSET_X. There is 4dp of headroom left. A wider chip, a
 * bigger gap or a fifth tab overflows a narrow phone, and the row is clipped by
 * the capsule's `overflow: "hidden"` rather than wrapping visibly.
 */
const CHIP_W = 80
const CHIP_H = 60
/** Space between two chips. */
const TAB_GAP = 4
/** Distance the travelling chip covers between two neighbouring tabs. */
const SLOT_PITCH = CHIP_W + TAB_GAP

/**
 * The capsule HUGS its chips in both axes: this is the row height plus the inset,
 * not `size.tabBar`. Screens still reserve `size.tabBar` for their bottom
 * clearance (via the `TAB_BAR_HEIGHT` exported from ui/Fab), which is now
 * slightly more room than the bar needs — deliberate slack, not drift.
 */
export const TAB_BAR_HEIGHT = CHIP_H + INNER_PADDING * 2

const ICONS: Record<string, IconName> = {
  Quotes: "quote",
  Leads: "leads",
  Products: "product",
  Contacts: "customer",
}

/** The two glass recipes. Everything tonal about the bar is in here. */
const GLASS = {
  light: {
    wash: "rgba(255,255,255,0.52)",
    sheen: ["rgba(255,255,255,0.70)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.22)"] as const,
    rim: "rgba(255,255,255,0.70)",
    specular: ["rgba(255,255,255,0)", "rgba(255,255,255,0.95)", "rgba(255,255,255,0)"] as const,
    activeChip: "#EAEDFC",
    // The idle chip is WHITE, not the grey wash: the tint stays reserved for the
    // one selected tab, so what is filled and what is merely a seat read apart.
    chip: "#FFFFFF",
  },
  dark: {
    wash: "rgba(18,18,20,0.58)",
    sheen: ["rgba(255,255,255,0.20)", "rgba(255,255,255,0.02)", "rgba(255,255,255,0.07)"] as const,
    rim: "rgba(255,255,255,0.22)",
    specular: ["rgba(255,255,255,0)", "rgba(255,255,255,0.45)", "rgba(255,255,255,0)"] as const,
    // The light tint would blow out on a dark backdrop; the brand at low alpha
    // gives the same "lit from within" reading there.
    activeChip: "rgba(76,134,245,0.26)",
    // Near-white would glare against a dark capsule; this is the same "a shade
    // lifted off the glass" reading in the other direction.
    chip: "rgba(255,255,255,0.07)",
  },
}

export default function OneUiTabBar({ state: navState, descriptors, navigation }: BottomTabBarProps) {
  const c = useTheme()
  const isDark = useIsDark()
  const insets = useSafeAreaInsets()
  const g = isDark ? GLASS.dark : GLASS.light

  const press = React.useRef<Animated.Value[]>([]).current
  navState.routes.forEach((_, i) => {
    if (!press[i]) press[i] = new Animated.Value(1)
  })

  /**
   * Where the travelling chip is, in TAB INDEX units — a continuous position, so
   * 1.5 means halfway between the second and third tab. Everything else about the
   * transition is interpolated off this one value, which is why the chip, its
   * stretch and both glyph fades can never disagree with each other mid-flight.
   */
  const slide = React.useRef(new Animated.Value(navState.index)).current
  /** 0 at rest, 1 at full travel — the liquid part. */
  const travel = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(slide, {
        toValue: navState.index,
        // Underdamped on purpose: it overshoots a hair and settles. Critically
        // damped (damping >= 2 * sqrt(stiffness * mass)) arrives correctly and
        // reads as mechanical.
        damping: 17,
        stiffness: 190,
        mass: 0.9,
        useNativeDriver: true,
      }),
      // Out fast, back slow: the chip stretches the instant it leaves and
      // relaxes as it lands, which is what sells it as one liquid body rather
      // than a rectangle being translated.
      Animated.sequence([
        Animated.timing(travel, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.spring(travel, {
          toValue: 0,
          damping: 15,
          stiffness: 150,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }, [navState.index, slide, travel])

  const translateX = slide.interpolate({
    inputRange: navState.routes.map((_, i) => i),
    outputRange: navState.routes.map((_, i) => i * SLOT_PITCH),
    // A single-tab bar would give interpolate a degenerate range.
    extrapolate: "clamp",
  })
  // Volume is conserved: what it gains along the travel it gives up across it.
  const stretch = travel.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] })
  const squash = travel.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] })

  const bounce = (i: number, to: number) => {
    Animated.spring(press[i], {
      toValue: to,
      damping: 14,
      stiffness: 320,
      mass: 0.6,
      useNativeDriver: true,
    }).start()
  }

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + BAR_LIFT }]}>
      <View
        style={[
          styles.bar,
          {
            height: TAB_BAR_HEIGHT,
            borderRadius: radius.pill,
            boxShadow: c.barShadow,
            padding: INNER_PADDING,
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 70 : 85}
          tint={isDark ? "dark" : "light"}
          blurReductionFactor={1}
          // Android cannot blur its own siblings, so the backend is pointed at a
          // target view wrapping the whole navigator subtree (see Tabs.tsx).
          blurMethod="dimezisBlurView"
          blurTarget={blurTargetRef}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: g.wash }]} />
        {/* Refraction through the slab: bright top, clear middle, a lift at the foot. */}
        <LinearGradient
          pointerEvents="none"
          colors={g.sheen}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* The bevel catching light along the top edge. */}
        <LinearGradient
          pointerEvents="none"
          colors={g.specular}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.specular}
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius.pill, borderColor: g.rim }]}
        />

        {/*
          ONE chip travels; it is not four chips taking turns being painted. That
          is what makes the move read as a single object sliding rather than a
          crossfade, and it is why the fill lives here instead of on each tab.
        */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              backgroundColor: g.activeChip,
              transform: [{ translateX }, { scaleX: stretch }, { scaleY: squash }],
            },
          ]}
        />

        {navState.routes.map((route, index) => {
          const focused = navState.index === index
          const { options } = descriptors[route.key]
          const label = (options.title ?? route.name) as string
          // Proximity of the travelling chip to THIS tab: 1 under it, 0 a slot
          // away. Driving both glyphs off the same value means the swap happens
          // where the chip actually is mid-flight, not when the route changed.
          const near = slide.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [0, 1, 0],
            extrapolate: "clamp",
          })
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPressIn={() => bounce(index, 0.92)}
              onPressOut={() => bounce(index, 1)}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                })
                if (focused || event.defaultPrevented) return
                feedback.select()
                navigation.navigate(route.name)
              }}
              style={styles.tab}
            >
              <Animated.View style={[styles.chip, { transform: [{ scale: press[index] }] }]}>
                {/*
                  The idle fill. It FADES OUT as the travelling chip arrives —
                  painted flat it would sit on top of the indicator (the tabs are
                  drawn after it) and hide the very thing that marks the tab. Tying
                  it to the same `near` value means the handover happens exactly
                  where the indicator is, not when the route changed.
                */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.chipFill,
                    { backgroundColor: g.chip, opacity: Animated.subtract(1, near) },
                  ]}
                />
                {/*
                  Both glyphs are mounted and cross-faded by opacity. Iconsax takes
                  its colour and variant as props on an SVG, neither of which the
                  native driver can drive — swapping them on `focused` would snap a
                  Linear grey glyph to a Bold blue one in one frame under a chip
                  that is still moving.
                */}
                <View style={styles.iconBox}>
                  <Animated.View style={[styles.glyph, { opacity: Animated.subtract(1, near) }]}>
                    <Icon name={ICONS[route.name] ?? "quote"} size={24} color={c.text} variant="Linear" />
                  </Animated.View>
                  <Animated.View style={[styles.glyph, styles.glyphOver, { opacity: near }]}>
                    <Icon name={ICONS[route.name] ?? "quote"} size={24} color={c.primary} variant="Bulk" />
                  </Animated.View>
                </View>

                {/* The destination in words, 2dp under its glyph. Stacked and
                    cross-faded for the same reason the glyphs are: a text colour
                    is not a native-driver property, so swapping it on `focused`
                    would snap grey to blue under a chip still in flight. */}
                <View style={styles.labelBox}>
                  <Animated.Text
                    numberOfLines={1}
                    style={[styles.label, { color: c.text, opacity: Animated.subtract(1, near) }]}
                  >
                    {label}
                  </Animated.Text>
                  <Animated.Text
                    numberOfLines={1}
                    style={[styles.label, styles.labelOver, { color: c.primary, opacity: near }]}
                  >
                    {label}
                  </Animated.Text>
                </View>
              </Animated.View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    // Centre a capsule that is only as wide as its chips, rather than stretching
    // one across the screen. BAR_INSET_X is now a floor on the side margin for a
    // phone too narrow to fit the row, not the capsule's width.
    alignItems: "center",
    paddingHorizontal: BAR_INSET_X,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    // The chips are a fixed-width GROUP centred in the capsule, not four stretched
    // columns: an exact 4dp gap and "flex: 1" tabs are mutually exclusive, since
    // flex would hand each tab a slot wider than its chip and the visible gap
    // would become whatever was left over.
    justifyContent: "center",
    gap: TAB_GAP,
    // Clips the blur and the sheens to the capsule.
    overflow: "hidden",
  },
  rim: {
    borderWidth: 1,
  },
  specular: {
    position: "absolute",
    top: 1,
    left: "12%",
    right: "12%",
    height: 1,
  },
  indicator: {
    position: "absolute",
    left: INNER_PADDING,
    top: INNER_PADDING,
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: radius.pill,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
  },
  chipFill: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
  },
  // The icon and its label are a column now, so the glyph pair needs a box of
  // its own to stack inside.
  iconBox: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  glyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  labelBox: { marginTop: 2, alignItems: "center", justifyContent: "center" },
  label: { ...textVariants.microLabel, textAlign: "center" },
  labelOver: { position: "absolute", left: 0, right: 0 },
  // The Bulk glyph is stacked ON the Linear one so the pair cross-fade in place;
  // laid out normally they would sit side by side and double the chip's width.
  glyphOver: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  chip: {
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
})
