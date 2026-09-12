import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import Icon from "@/ui/Icon"
import Sheet from "@/ui/Sheet"
import { font } from "@/theme/typography"

/**
 * A short list of choices in a bottom sheet — the app's answer to a dropdown
 * (see the design notes: sheets, not dialogs, for a handful of options).
 *
 * `extra` is rendered above the options for the one thing a picker sometimes
 * has to offer that is not itself an option: "add a new one". It is pinned to
 * the top for the same reason the console pins "create new" first in its
 * combobox — the person who needs it already knows the list does not have what
 * they want, so making them scroll past every wrong answer is backwards.
 */
export type OptionSheetProps = {
  visible: boolean
  title: string
  options: string[]
  value?: string
  extra?: React.ReactNode
  onClose: () => void
  onPick: (value: string) => void
}

export default function OptionSheet({
  visible,
  title,
  options,
  value,
  extra,
  onClose,
  onPick,
}: OptionSheetProps) {
  const t = useTheme()
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {extra ? <View style={styles.extra}>{extra}</View> : null}
      {options.map((option) => {
        const active = option === value
        return (
          <Pressable
            key={option}
            onPress={() => {
              feedback.select()
              onPick(option)
            }}
            android_ripple={{ color: t.accentTint }}
            style={styles.optionRow}
          >
            <Text
              style={[
                styles.optionLabel,
                { color: t.text, fontFamily: active ? font.semibold : font.regular },
              ]}
            >
              {option}
            </Text>
            {active && <Icon name="tick" size={20} color={t.primary} variant="Bulk" />}
          </Pressable>
        )
      })}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  extra: { paddingBottom: 4 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  optionLabel: { fontSize: 15.5 },
})
