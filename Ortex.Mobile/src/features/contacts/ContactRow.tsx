import React from "react"
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native"

import { callNumber, whatsapp } from "@/lib/contact"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { Avatar, Icon } from "@/ui"

/**
 * One person in the directory.
 *
 * Samsung's row is deliberately bare — a face, a name, and nothing else — because
 * the list is scanned, not read. The actions live in the SWIPE: drag right to
 * call, drag left to message, which is Samsung Contacts' "swipe to call or send
 * messages" gesture. Here "message" is WhatsApp, since that is how this business
 * actually reaches a customer.
 *
 * The gesture is a PanResponder rather than a Swipeable: it must only claim
 * horizontal movement, and hand every vertical drag straight back to the list, or
 * scrolling the directory becomes a fight. `onMoveShouldSetPanResponder` is where
 * that decision lives — nothing below 10dp of travel, and only when the drag is
 * clearly sideways.
 */

export const CONTACT_ROW_HEIGHT = 68

/** How far the row must travel before the lift fires its action. */
const TRIGGER = 96
const MAX_TRAVEL = 132

export type ContactRowData = {
  id: string
  name: string
  secondary?: string
  phone?: string
  favourite?: boolean
}

function ContactRow({
  contact,
  onPress,
  onLongPress,
  selecting,
  selected,
  swipeEnabled = true,
}: {
  contact: ContactRowData
  onPress: () => void
  onLongPress: () => void
  selecting: boolean
  selected: boolean
  swipeEnabled?: boolean
}) {
  const t = useTheme()
  const dx = React.useRef(new Animated.Value(0)).current
  const hasPhone = !!String(contact.phone || "").replace(/\D/g, "")
  // Refs so the responder, built once, still sees the current row state.
  const armed = React.useRef(false)
  armed.current = swipeEnabled && hasPhone && !selecting

  const settle = React.useCallback(() => {
    Animated.spring(dx, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 260 }).start()
  }, [dx])

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          armed.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderMove: (_e, g) => {
          const clamped = Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, g.dx))
          dx.setValue(clamped)
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dx > TRIGGER) void callNumber(contact.phone)
          else if (g.dx < -TRIGGER) void whatsapp(contact.phone)
          settle()
        },
        onPanResponderTerminate: settle,
      }),
    [contact.phone, dx, settle],
  )

  // Each rail only shows on its own side, and fades in with the travel so a
  // half-hearted drag reads as "not yet" rather than as a stuck panel.
  const callOpacity = dx.interpolate({ inputRange: [0, TRIGGER], outputRange: [0, 1], extrapolate: "clamp" })
  const chatOpacity = dx.interpolate({
    inputRange: [-TRIGGER, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  })

  return (
    <View style={styles.clip}>
      <Animated.View style={[styles.rail, styles.railLeft, { opacity: callOpacity }]}>
        <View style={[styles.railBadge, { backgroundColor: t.success }]}>
          <Icon name="call" size={20} color="#FFFFFF" variant="Bulk" />
        </View>
      </Animated.View>
      <Animated.View style={[styles.rail, styles.railRight, { opacity: chatOpacity }]}>
        <View style={[styles.railBadge, { backgroundColor: t.success }]}>
          <Icon name="whatsapp" size={20} color="#FFFFFF" variant="Bulk" />
        </View>
      </Animated.View>

      <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: dx }] }}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={280}
          accessibilityRole="button"
          accessibilityState={selecting ? { checked: selected } : undefined}
          accessibilityLabel={contact.name}
          android_ripple={{ color: t.accentTint }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: selected ? t.primary10 : t.surface,
              opacity: pressed && !selected ? 0.75 : 1,
            },
          ]}
        >
          {selecting && (
            <View style={styles.check}>
              <Icon
                name="tick"
                size={22}
                color={selected ? t.primary : t.textHint}
                variant={selected ? "Bold" : "Linear"}
              />
            </View>
          )}

          <Avatar name={contact.name} size="md" />

          <View style={styles.body}>
            <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
              {contact.name}
            </Text>
            {!!contact.secondary && (
              <Text numberOfLines={1} style={[styles.secondary, { color: t.textTertiary }]}>
                {contact.secondary}
              </Text>
            )}
          </View>

          {contact.favourite && !selecting && (
            <Icon name="star" size={16} color={t.warning} variant="Bold" />
          )}
        </Pressable>
      </Animated.View>
    </View>
  )
}

export default React.memo(ContactRow)

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: CONTACT_ROW_HEIGHT,
    paddingHorizontal: gutter,
  },
  check: { marginRight: spacing.sm, marginLeft: -2 },
  body: { flex: 1, minWidth: 0, marginLeft: 14 },
  name: { fontSize: 17, lineHeight: 22, fontFamily: font.medium },
  secondary: { marginTop: 1, fontSize: 13, lineHeight: 17, fontFamily: font.regular },
  rail: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  railLeft: { justifyContent: "flex-start" },
  railRight: { justifyContent: "flex-end" },
  railBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
})
