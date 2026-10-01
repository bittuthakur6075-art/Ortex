import { useNavigation } from "@react-navigation/native"
import React from "react"
import { Animated, StyleSheet, View } from "react-native"

import { useChatInbox } from "@/features/chat/useChat"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import IconButton from "@/ui/IconButton"

/**
 * Team chat in the app bar, beside search and the bell (it left the tab bar,
 * owner 2026-09-27). Drawn like the bell: a Linear glyph, and a dot, not a
 * count, while any unmuted chat is unread.
 */
export default function ChatButton() {
  const t = useTheme()
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()
  const { unread } = useChatInbox()
  const { profile } = useAuth()
  const dot = React.useRef(new Animated.Value(unread ? 1 : 0)).current
  React.useEffect(() => {
    Animated.spring(dot, { toValue: unread ? 1 : 0, stiffness: 320, damping: 24, mass: 0.6, useNativeDriver: true }).start()
  }, [unread, dot])
  // Staff have Chat as a tab (navigation/tabAccess.ts).
  if (profile?.role === "staff") return null

  return (
    <View>
      <IconButton
        name="chat"
        variant="Linear"
        accessibilityLabel={unread ? `Team chat, ${unread} unread` : "Team chat"}
        onPress={() => {
          feedback.tap()
          navigation.navigate("Chat")
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.dot, { backgroundColor: t.primary, borderColor: t.appBar, opacity: dot, transform: [{ scale: dot }] }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  dot: { position: "absolute", top: 9, right: 9, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
})
