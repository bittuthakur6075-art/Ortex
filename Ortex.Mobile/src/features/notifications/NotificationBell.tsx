import { useNavigation } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { useNotifications } from "@/features/notifications/useNotifications"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import IconButton from "@/ui/IconButton"

/**
 * The app bar's bell, with the unread count on it.
 *
 * It sits on every tab root rather than only on Leads, because the thing it
 * counts is not a tab's own backlog — it is everything that has happened while
 * the rep was looking at something else. Same reason the console puts it in the
 * header and not on the Enquiries page.
 *
 * The count is capped at 9+: the exact number stops mattering the moment there
 * is more than a handful, and a three-digit badge on a 40dp touch slot is a
 * blob, not a figure.
 */
export default function NotificationBell() {
  const t = useTheme()
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()
  const { unreadCount } = useNotifications()

  return (
    <View>
      <IconButton
        name="bell"
        variant={unreadCount ? "Bold" : "Linear"}
        color={unreadCount ? t.primary : t.text}
        accessibilityLabel={
          unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        onPress={() => {
          feedback.tap()
          navigation.navigate("Notifications")
        }}
      />
      {unreadCount > 0 && (
        <View
          pointerEvents="none"
          // The badge is drawn OVER the 40dp slot, ringed in the bar's own
          // colour so it reads as a chip on the glyph rather than a smudge
          // touching it.
          style={[styles.badge, { backgroundColor: t.danger, borderColor: t.appBar }]}
        >
          <Text style={[styles.count, { color: t.textOnPrimary }]}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 3,
    right: 2,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: font.bold,
    includeFontPadding: false,
  },
})
