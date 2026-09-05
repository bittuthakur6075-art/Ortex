import React, { forwardRef, memo, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

type Props = Omit<TextInputProps, "placeholderTextColor" | "style"> & {
  label?: string
  helperText?: string
  error?: string
  leadingIcon?: IconName
  trailingIcon?: IconName
  onTrailingPress?: () => void
}

/**
 * Labeled text input. Usage:
 * `<TextField label="Title" value={title} onChangeText={setTitle} helperText="Required" />`
 */
function TextField(
  { label, helperText, error, leadingIcon, trailingIcon, onTrailingPress, multiline, ...inputProps }: Props,
  ref: React.Ref<TextInput>,
) {
  const t = useTheme()
  const [focused, setFocused] = useState(false)

  const borderColor = error ? t.danger : focused ? t.accent : "transparent"

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={[styles.label, { color: t.textSecondary }]}>{label}</Text>}
      <View
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          { backgroundColor: t.searchBg, borderColor },
        ]}
      >
        {leadingIcon && (
          <View style={styles.leading}>
            <Icon name={leadingIcon} size={18} color={t.textTertiary} />
          </View>
        )}
        <TextInput
          ref={ref}
          multiline={multiline}
          placeholderTextColor={t.textTertiary}
          style={[styles.input, multiline && styles.inputMultiline, { color: t.text }]}
          onFocus={(e) => {
            setFocused(true)
            inputProps.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            inputProps.onBlur?.(e)
          }}
          {...inputProps}
        />
        {trailingIcon && (
          <Pressable
            hitSlop={8}
            disabled={!onTrailingPress}
            onPress={onTrailingPress}
            style={styles.trailing}
            accessibilityRole={onTrailingPress ? "button" : undefined}
          >
            <Icon name={trailingIcon} size={18} color={t.textTertiary} />
          </Pressable>
        )}
      </View>
      {!!(error || helperText) && (
        <Text style={[styles.helper, { color: error ? t.danger : t.textTertiary }]}>
          {error ?? helperText}
        </Text>
      )}
    </View>
  )
}

export default memo(forwardRef(TextField))

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  label: {
    fontSize: 13,
    fontFamily: font.medium,
    marginBottom: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  fieldMultiline: {
    alignItems: "flex-start",
    paddingVertical: 12,
  },
  leading: {
    marginRight: 10,
  },
  trailing: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: font.regular,
    paddingVertical: 12,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingVertical: 0,
  },
  helper: {
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 6,
    marginLeft: 2,
  },
})
