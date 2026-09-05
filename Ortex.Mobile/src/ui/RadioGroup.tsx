import React, { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Icon from "@/ui/Icon"

export type RadioOption<T extends string = string> = {
  key: T
  label: string
  description?: string
}

type Props<T extends string> = {
  options: RadioOption<T>[]
  value: T
  onChange: (next: T) => void
}

/**
 * Single-select list of rows with a trailing tick, like the sort options in
 * Sheet. Usage: `<RadioGroup options={SORT_OPTIONS} value={sortMode} onChange={setSortMode} />`
 */
function RadioGroup<T extends string>({ options, value, onChange }: Props<T>) {
  const t = useTheme()

  return (
    <View>
      {options.map((option) => {
        const active = option.key === value
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            android_ripple={{ color: t.ripple }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View style={styles.text}>
              <Text style={[styles.label, { color: t.text }]}>{option.label}</Text>
              {!!option.description && (
                <Text style={[styles.description, { color: t.textTertiary }]}>{option.description}</Text>
              )}
            </View>
            {active && <Icon name="tick" size={20} color={t.accent} variant="Bold" />}
          </Pressable>
        )
      })}
    </View>
  )
}

export default memo(RadioGroup) as typeof RadioGroup

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  text: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 15.5,
    fontFamily: font.medium,
  },
  description: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: font.regular,
  },
})
