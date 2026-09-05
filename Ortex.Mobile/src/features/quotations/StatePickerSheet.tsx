import React from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import { GST_STATE_OPTIONS } from "@/domain/gstStates"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Icon, Sheet } from "@/ui"

/**
 * The state code decides CGST+SGST vs IGST on the whole document, so it is a
 * picker rather than a text field — a typo here is a wrong tax invoice, not a
 * cosmetic slip.
 */
export default function StatePickerSheet({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean
  value?: string
  onClose: () => void
  onPick: (code: string) => void
}) {
  const t = useTheme()
  const [query, setQuery] = React.useState("")

  const options = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GST_STATE_OPTIONS
    return GST_STATE_OPTIONS.filter((o) => o.name.toLowerCase().includes(q) || o.code.includes(q))
  }, [query])

  return (
    <Sheet visible={visible} onClose={onClose} title="Place of supply">
      <View style={[styles.search, { backgroundColor: t.searchBg }]}>
        <Icon name="search" size={18} color={t.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="State or code"
          placeholderTextColor={t.textTertiary}
          autoCorrect={false}
          style={[styles.searchInput, { color: t.text }]}
        />
      </View>
      {options.map((o) => {
        const active = o.code === value
        return (
          <Pressable
            key={o.code}
            onPress={() => onPick(o.code)}
            android_ripple={{ color: t.ripple }}
            style={styles.row}
          >
            <Text style={[styles.code, { color: t.textTertiary }]}>{o.code}</Text>
            <Text style={[styles.name, { color: t.text, fontFamily: active ? font.semibold : font.regular }]}>
              {o.name}
            </Text>
            {active && <Icon name="tick" size={20} color={t.accent} variant="Bold" />}
          </Pressable>
        )
      })}
      {options.length === 0 && (
        <Text style={[styles.empty, { color: t.textTertiary }]}>No state matches “{query}”.</Text>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  searchInput: { flex: 1, marginLeft: 8, padding: 0, fontSize: 15, fontFamily: font.regular },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 4 },
  code: { width: 34, fontSize: 13, fontFamily: font.semibold },
  name: { flex: 1, fontSize: 15.5 },
  empty: { paddingVertical: 18, textAlign: "center", fontSize: 14, fontFamily: font.regular },
})
