import React from "react"
import { Pressable, StyleSheet, TextInput, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Icon from "@/ui/Icon"

/**
 * The filled 40px search pill that sits under a ScreenHeader title. Distinct
 * from TextField on purpose: this is chrome, not a form control, so it has no
 * label, no focus ring and a fully rounded shape.
 */
export default function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
}: {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
}) {
  const t = useTheme()
  return (
    <View style={[styles.root, { backgroundColor: t.searchBg }]}>
      <Icon name="search" size={18} color={t.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textTertiary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={[styles.input, { color: t.text }]}
      />
      {value.length > 0 && (
        <Pressable hitSlop={10} onPress={() => onChangeText("")} accessibilityLabel="Clear search">
          <Icon name="close" size={18} color={t.textTertiary} variant="Bulk" />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 12,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    padding: 0,
    fontSize: 15,
    fontFamily: font.regular,
  },
})
