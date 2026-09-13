import { useNavigation } from "@react-navigation/native"
import React from "react"
import { Animated, StyleSheet, View } from "react-native"

import { useNotifications } from "@/features/notifications/useNotifications"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import IconButton from "@/ui/IconButton"

/**
 * The app bar's bell. It sits at the RIGHT end of every tab root's bar, after
 * search, on every tab rather than only on Leads, because what it announces is
 * not a tab's own backlog: it is everything that happened while the rep was
 * looking at something else.
 *
 * It is drawn exactly like the search icon beside it (Linear glyph, the same
 * ink), so the two read as one quiet pair of tools. Unread news is a DOT, not a
 * count: the bar only needs to say "something is waiting", and the number is on
 * the Notifications page one tap away. The dot scales in when the first unread
 * arrives and out when the last is read, rather than blinking on and off.
 */
export default function NotificationBell() {
  const t = useTheme()
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()
  const { unreadCount } = useNotifications()
  const unread = unreadCount > 0

  const dot = React.useRef(new Animated.Value(unread ? 1 : 0)).current
  React.useEffect(() => {
    Animated.spring(dot, { toValue: unread ? 1 : 0, stiffness: 320, damping: 24, mass: 0.6, useNativeDriver: true }).start()
  }, [unread, dot])

  return (
    <View>
      <IconButton
        name="bell"
        variant="Linear"
        accessibilityLabel={unread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        onPress={() => {
          feedback.tap()
          navigation.navigate("Notifications")
        }}
      />
      <Animated.View
        pointerEvents="none"
        // Ringed in the bar's own colour, so the dot sits ON the glyph's
        // shoulder as a separate mark rather than merging into its stroke.
        style={[
          styles.dot,
          { backgroundColor: t.danger, borderColor: t.appBar, opacity: dot, transform: [{ scale: dot }] },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
})
