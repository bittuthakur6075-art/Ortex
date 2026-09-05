import React, { useEffect, useRef, useState } from "react"
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

export type MenuItem = {
  key: string
  label: string
  icon?: IconName
  destructive?: boolean
  disabled?: boolean
  onPress: () => void
}

type Props = {
  visible: boolean
  onClose: () => void
  items: MenuItem[]
  /** Distance from the top of the screen — usually just under the header. */
  top?: number
}

/**
 * Overflow menu anchored to the top-right. It scales out of its anchor corner
 * rather than plain-fading, which is how One UI menus open.
 */
export default function PopupMenu({ visible, onClose, items, top = 56 }: Props) {
  const t = useTheme()
  const progress = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
        mass: 0.7,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false)
    })
  }, [visible, progress])

  if (!mounted) return null

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1],
  })

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.menu,
            {
              top,
              backgroundColor: t.sheetBg,
              borderColor: t.cardBorder,
              opacity: progress,
              // Anchor the growth to the top-right corner.
              transform: [
                { translateX: 76 },
                { translateY: -22 },
                { scale },
                { translateX: -76 },
                { translateY: 22 },
              ],
            },
          ]}
        >
          {items.map((item) => (
            <Pressable
              key={item.key}
              disabled={item.disabled}
              android_ripple={{ color: t.ripple }}
              onPress={() => {
                onClose()
                item.onPress()
              }}
              style={({ pressed }) => [styles.item, { opacity: item.disabled ? 0.35 : pressed ? 0.6 : 1 }]}
            >
              {item.icon && (
                <View style={styles.icon}>
                  <Icon name={item.icon} size={18} color={item.destructive ? t.danger : t.textSecondary} />
                </View>
              )}
              <Text style={[styles.label, { color: item.destructive ? t.danger : t.text }]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(7,20,55,0.20)",
  },
  menu: {
    position: "absolute",
    right: 10,
    minWidth: 214,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: "#071437",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  icon: {
    marginRight: 12,
    width: 20,
  },
  label: {
    fontSize: 15,
    fontFamily: font.medium,
  },
})
