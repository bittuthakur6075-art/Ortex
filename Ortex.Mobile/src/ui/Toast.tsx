import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { palette } from "@/theme/theme"
import { font } from "@/theme/typography"
import { feedback } from "@/lib/feedback"
import Icon, { type IconName } from "@/ui/Icon"

export type ToastTone = "neutral" | "success" | "danger"

type ToastOptions = {
  message: string
  tone?: ToastTone
  icon?: IconName
  /** Shows an Undo button; the toast dismisses as soon as it is pressed. */
  onUndo?: () => void
  durationMs?: number
}

type ToastContextValue = { show: (options: ToastOptions) => void }

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current)
      setToast(options)
      timer.current = setTimeout(clear, options.durationMs ?? (options.onUndo ? 5000 : 2600))
    },
    [clear],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && <ToastBar toast={toast} onDismiss={clear} />}
    </ToastContext.Provider>
  )
}

function ToastBar({ toast, onDismiss }: { toast: ToastOptions; onDismiss: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const slide = useRef(new Animated.Value(0)).current

  useEffect(() => {
    slide.setValue(0)
    Animated.timing(slide, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [slide, toast])

  const tone = toast.tone ?? "neutral"
  const background =
    tone === "success"
      ? palette.successActive
      : tone === "danger"
      ? palette.errorActive
      : t.dark
      ? "#2A2A2A"
      : palette.heading

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + 78,
          opacity: slide,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: background }]}>
        {toast.icon && (
          <View style={styles.icon}>
            <Icon name={toast.icon} size={18} color={palette.white} variant="Bold" />
          </View>
        )}
        <Text numberOfLines={2} style={styles.message}>
          {toast.message}
        </Text>

        {toast.onUndo && (
          <Pressable
            hitSlop={8}
            onPress={() => {
              feedback.tap()
              toast.onUndo?.()
              onDismiss()
            }}
            style={({ pressed }) => [styles.undo, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.undoText}>UNDO</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>")
  return ctx
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    elevation: 8,
    shadowColor: "#071437",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  icon: {
    marginRight: 10,
  },
  message: {
    flex: 1,
    color: palette.white,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: font.medium,
  },
  undo: {
    marginLeft: 14,
    paddingHorizontal: 4,
  },
  undoText: {
    color: palette.white,
    fontSize: 13,
    letterSpacing: 0.6,
    fontFamily: font.extrabold,
  },
})
