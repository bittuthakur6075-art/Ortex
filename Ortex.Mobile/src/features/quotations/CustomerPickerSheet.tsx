import React from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"

import { newCustomer, type Customer, type Row } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { prettyPhone } from "@/lib/contact"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Avatar, Icon, Sheet } from "@/ui"

/**
 * Searchable customer combobox, matching the console's CustomerPicker: it
 * searches name, company, email, phone and GSTIN, and "New customer" is always
 * the first option — most quotations on a phone are for someone who has just
 * rung in and is not in the master yet.
 *
 * Picking copies the seven fields onto the document. The quotation stores a
 * SNAPSHOT rather than a reference, exactly as the console does, so editing a
 * customer later never rewrites a quotation already sent.
 */
export default function CustomerPickerSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean
  onClose: () => void
  onPick: (customer: Customer) => void
}) {
  const t = useTheme()
  const { items } = useCollection<Customer & Row>("customers")
  const [query, setQuery] = React.useState("")

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = items
      .slice()
      .sort((a, b) => (a.company || a.name || "").localeCompare(b.company || b.name || ""))
    if (!q) return pool.slice(0, 40)
    return pool
      .filter((c) =>
        [c.name, c.company, c.email, c.phone, c.gstin]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 40)
  }, [items, query])

  const pick = (c: Customer) => {
    setQuery("")
    onPick({
      name: c.name || "",
      company: c.company || "",
      email: c.email || "",
      phone: c.phone || "",
      gstin: c.gstin || "",
      stateCode: c.stateCode || "",
      address: c.address || "",
    })
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Choose a customer">
      <View style={[styles.search, { backgroundColor: t.fieldBg }]}>
        <Icon name="search" size={18} color={t.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name, company, number or GSTIN"
          placeholderTextColor={t.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.searchInput, { color: t.text }]}
        />
      </View>

      <Pressable
        onPress={() => {
          setQuery("")
          // A blank customer opens the inline form on the editor; the name the
          // user was searching for is a better starting point than nothing.
          onPick(newCustomer({ name: query.trim() }))
        }}
        android_ripple={{ color: t.accentTint }}
        style={styles.newRow}
      >
        <View style={[styles.newIcon, { backgroundColor: t.primary10 }]}>
          <Icon name="add" size={20} color={t.primary} />
        </View>
        <Text style={[styles.newLabel, { color: t.primary }]}>
          {query.trim() ? `New customer “${query.trim()}”` : "New customer"}
        </Text>
      </Pressable>

      {matches.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => pick(c)}
          android_ripple={{ color: t.accentTint }}
          style={styles.row}
        >
          {/* 44, an explicit diameter rather than a step on the scale: the row
              now carries a 16/600 name over a 12/500 line, and `sm` (28) sat
              visibly short of that two-line block. */}
          <Avatar name={c.company || c.name} size={44} />
          <View style={styles.body}>
            <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
              {c.company || c.name || "Unnamed"}
            </Text>
            <Text numberOfLines={1} style={[styles.sub, { color: t.textTertiary }]}>
              {[c.company && c.name ? c.name : null, c.phone ? prettyPhone(c.phone) : c.email]
                .filter(Boolean)
                .join(" · ") || "No contact details"}
            </Text>
          </View>
        </Pressable>
      ))}

      {matches.length === 0 && query.trim().length > 0 && (
        <Text style={[styles.empty, { color: t.textTertiary }]}>
          Nobody matches “{query.trim()}”. Add them as a new customer above.
        </Text>
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
    marginBottom: 6,
  },
  searchInput: { flex: 1, marginLeft: 8, padding: 0, fontSize: 15, fontFamily: font.regular },
  newRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4 },
  newIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  newLabel: { marginLeft: 12, fontSize: 15.5, fontFamily: font.semibold },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4 },
  body: { flex: 1, marginLeft: 12 },
  // The name is what the list is scanned by, so it carries the weight; the line
  // under it is supporting detail and steps down in both size and weight.
  name: { fontSize: 16, lineHeight: 21, fontFamily: font.semibold },
  sub: { marginTop: 2, fontSize: 12, lineHeight: 16, fontFamily: font.medium },
  empty: { paddingVertical: 18, textAlign: "center", fontSize: 14, lineHeight: 20, fontFamily: font.regular },
})
