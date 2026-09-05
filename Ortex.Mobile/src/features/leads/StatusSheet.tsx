import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { ENQUIRY_STATUS } from "@/domain/schema"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Icon, Sheet } from "@/ui"

/**
 * One UI puts short choice lists in a bottom sheet rather than a dialog, so
 * changing a lead's status is a sheet everywhere it appears.
 */
export default function StatusSheet({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean
  current?: string
  onClose: () => void
  onPick: (id: string) => void
}) {
  const t = useTheme()
  return (
    <Sheet visible={visible} onClose={onClose} title="Set status">
      {ENQUIRY_STATUS.map((s) => {
        const active = s.id === current
        const tone = t.tones[s.tone]
        return (
          <Pressable
            key={s.id}
            onPress={() => onPick(s.id)}
            android_ripple={{ color: t.ripple }}
            style={styles.row}
          >
            <View style={[styles.dot, { backgroundColor: tone.fg }]} />
            <Text
              style={[styles.label, { color: t.text, fontFamily: active ? font.semibold : font.regular }]}
            >
              {s.label}
            </Text>
            {active && <Icon name="tick" size={20} color={t.accent} variant="Bold" />}
          </Pressable>
        )
      })}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 },
  label: { flex: 1, fontSize: 16 },
})
