import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { BlurView } from "expo-blur"
import React from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { feedback } from "@/lib/feedback"
import { blurTargetRef } from "@/navigation/blurTarget"
import { useIsDark, useTheme } from "@/store/ThemeContext"
import { radius, size as sizes } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

/**
 * The bottom navigation.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\navigation\UserNavigator.jsx
 * (its `TabBar`): a FLOATING GLASS CAPSULE rather than a bar welded to the screen
 * edge — detached 18dp from each side, lifted clear of the home indicator, real
 * backdrop blur behind a translucent wash, a bright specular rim, and a springing
 * filled tile behind the active tab.
 *
 * It carries the ONLY shadow in the app (`colors.barShadow`, two layers: contact
 * + ambient), applied through the `boxShadow` style prop rather than native
 * elevation — elevation cannot coexist with the `overflow: "hidden"` the blur
 * needs in order to be clipped to the capsule.
 *
 * Unselected tabs use full text ink rather than a muted grey: a destination you
 * can go to reads as available.
 */

const BAR_INSET_X = 18
const BAR_LIFT = 10
/** Inset of the active tile from the capsule's own edges. */
const INNER_PADDING = 6

export const TAB_BAR_HEIGHT = sizes.tabBar

const ICONS: Record<string, IconName> = {
  Quotes: "quote",
  Leads: "enquiry",
  Products: "product",
  Contacts: "customer",
}

export default function OneUiTabBar({ state: navState, descriptors, navigation }: BottomTabBarProps) {
  const c = useTheme()
  const isDark = useIsDark()
  const insets = useSafeAreaInsets()
  const count = navState.routes.length
  const [width, setWidth] = React.useState(0)
  const slide = React.useRef(new Animated.Value(navState.index)).current

  React.useEffect(() => {
    Animated.spring(slide, {
      toValue: navState.index,
      damping: 16,
      stiffness: 180,
      mass: 0.7,
      useNativeDriver: true,
    }).start()
  }, [navState.index, slide])

  const inner = Math.max(width - INNER_PADDING * 2, 0)
  const slot = count > 0 ? inner / count : 0
  const translateX = slide.interpolate({
    inputRange: navState.routes.map((_, i) => i),
    outputRange: navState.routes.map((_, i) => i * slot),
    extrapolate: "clamp",
  })

  // A flat wash over the blur, so the capsule still reads as a surface where the
  // backdrop happens to be plain.
  const wash = isDark ? "rgba(20,20,20,0.74)" : "rgba(255,255,255,0.66)"
  const tileFill = isDark ? "rgba(76,134,245,0.22)" : c.primary10

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + BAR_LIFT }]}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          styles.bar,
          {
            height: TAB_BAR_HEIGHT,
            borderRadius: radius.pill,
            boxShadow: c.barShadow,
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 90 : 100}
          tint={isDark ? "dark" : "light"}
          blurReductionFactor={1}
          // Android cannot blur its own siblings, so the backend is pointed at a
          // target view wrapping the whole navigator subtree (see Tabs.tsx).
          blurMethod="dimezisBlurView"
          blurTarget={blurTargetRef}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} />
        {/* Specular rim — the edge that makes the capsule read as glass. */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius.pill }]}
        />

        {slot > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tile,
              {
                width: slot,
                left: INNER_PADDING,
                top: INNER_PADDING,
                bottom: INNER_PADDING,
                borderRadius: radius.pill,
                backgroundColor: tileFill,
                transform: [{ translateX }],
              },
            ]}
          />
        )}

        {navState.routes.map((route, index) => {
          const focused = navState.index === index
          const { options } = descriptors[route.key]
          const label = (options.title ?? route.name) as string
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
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
              <Icon
                name={ICONS[route.name] ?? "quote"}
                size={22}
                color={focused ? c.primary : c.text}
                variant={focused ? "Bold" : "Linear"}
              />
              <Text style={[textVariants.tab, styles.label, { color: focused ? c.primary : c.text }]}>
                {label}
              </Text>
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
    left: BAR_INSET_X,
    right: BAR_INSET_X,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    // Clips the blur to the capsule.
    overflow: "hidden",
  },
  rim: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },
  tile: {
    position: "absolute",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  label: {
    marginTop: 3,
    alignSelf: "stretch",
    textAlign: "center",
  },
})
