import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"
import React from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { feedback } from "@/lib/feedback"
import Icon, { type IconName } from "@/ui/Icon"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"

// The One UI bottom bar: opaque, anchored to the bottom edge, a hairline rule
// above it, icon over label, and a soft "lens" that springs between tabs.
//
// The kit this was ported from ships a floating blurred glass bar instead. That
// is an iOS-26 idiom rather than a Samsung one, and its Android blur backend is
// switched on by an Expo config plugin — which never runs in a bare project. So
// the bar is rewritten here: closer to the design system the app is asked to
// follow, and with one fewer thing that silently no-ops on Android.

const ICONS: Record<string, IconName> = {
  Quotes: "quote",
  Leads: "enquiry",
  Products: "product",
  Contacts: "customer",
}

export default function OneUiTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const count = state.routes.length
  const [width, setWidth] = React.useState(0)
  const lens = React.useRef(new Animated.Value(state.index)).current

  React.useEffect(() => {
    Animated.spring(lens, {
      toValue: state.index,
      damping: 16,
      stiffness: 180,
      mass: 0.9,
      useNativeDriver: true,
    }).start()
  }, [state.index, lens])

  const slot = count > 0 ? width / count : 0
  const translateX = lens.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => i * slot),
  })

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.bar,
        {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: t.headerBg,
          borderTopColor: t.divider,
        },
      ]}
    >
      {slot > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lens,
            {
              width: slot,
              backgroundColor: t.accentSoft,
              // scaleX insets the lens from the slot edges so it reads as a pill
              // behind the icon rather than a full-width band.
              transform: [{ translateX }, { scaleX: 0.62 }],
            },
          ]}
        />
      )}
      {state.routes.map((route, index) => {
        const focused = state.index === index
        const { options } = descriptors[route.key]
        const label = (options.title ?? route.name) as string
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true })
              if (focused || event.defaultPrevented) return
              feedback.select()
              navigation.navigate(route.name)
            }}
            style={styles.tab}
          >
            <Icon
              name={ICONS[route.name] ?? "quote"}
              size={22}
              color={focused ? t.accent : t.textTertiary}
              variant={focused ? "Bold" : "Linear"}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  color: focused ? t.accent : t.textTertiary,
                  fontFamily: focused ? font.semibold : font.medium,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lens: {
    position: "absolute",
    top: 6,
    height: TAB_BAR_HEIGHT - 12,
    borderRadius: 18,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  label: {
    fontSize: 11,
    marginTop: 3,
  },
})
