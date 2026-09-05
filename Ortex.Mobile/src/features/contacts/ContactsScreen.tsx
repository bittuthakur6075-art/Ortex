import React from "react"
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native"

import type { Customer, Row } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { callNumber, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Avatar, EmptyState, Icon, IconButton, ScreenHeader, SearchField, Skeleton } from "@/ui"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"

export type CustomerRow = Customer & Row

// A `customers` document holds exactly one contact — name, company, one phone,
// one email. There is no contacts array in the schema, and the console matches
// records on email-then-phone rather than on company, so one firm legitimately
// has several rows: the buyer, the accounts person, the site engineer.
//
// So the directory groups rows by company and treats each row under a heading as
// a contact of that company. People with no company get their own single-row
// section, which is exactly what they are.

const UNGROUPED = "Individuals"

export default function ContactsScreen({ navigation }: TabScreenProps<"Contacts">) {
  const t = useTheme()
  const { items, loading } = useCollection<CustomerRow>("customers")
  const [query, setQuery] = React.useState("")

  const sections = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = items.filter((c) => {
      if (!q) return true
      return [c.name, c.company, c.email, c.phone, c.gstin]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })

    const byCompany = new Map<string, CustomerRow[]>()
    for (const c of matched) {
      const key = (c.company || "").trim() || UNGROUPED
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key)!.push(c)
    }

    return (
      [...byCompany.entries()]
        .map(([title, data]) => ({
          title,
          data: data.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
        }))
        // Individuals last; everything else alphabetical.
        .sort((a, b) => {
          if (a.title === UNGROUPED) return 1
          if (b.title === UNGROUPED) return -1
          return a.title.localeCompare(b.title)
        })
    )
  }, [items, query])

  const total = sections.reduce((n, s) => n + s.data.length, 0)

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <ScreenHeader
        title="Contacts"
        subtitle={loading ? "Loading…" : `${total} contacts · ${sections.length} companies`}
        trailing={
          <IconButton
            name="profile"
            onPress={() => navigation.navigate("Profile")}
            accessibilityLabel="Profile"
          />
        }
      >
        <SearchField value={query} onChangeText={setQuery} placeholder="Name, company or number" />
      </ScreenHeader>

      {loading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={62} radius={18} />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="customer"
              title={query ? "No matching contacts" : "No customers yet"}
              hint={
                query
                  ? "Try their company or the last few digits of their number."
                  : "A customer is added automatically the first time you quote them."
              }
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <Icon
                name={section.title === UNGROUPED ? "customer" : "company"}
                size={14}
                color={t.textTertiary}
              />
              <Text style={[styles.sectionTitle, { color: t.textTertiary }]} numberOfLines={1}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ContactRow
              customer={item}
              onOpen={() => navigation.navigate("CustomerDetail", { id: item.id })}
            />
          )}
        />
      )}
    </View>
  )
}

function ContactRow({ customer, onOpen }: { customer: CustomerRow; onOpen: () => void }) {
  const t = useTheme()
  const label = customer.name || customer.company || "Unnamed contact"
  const hasPhone = !!String(customer.phone || "").replace(/\D/g, "")

  return (
    <Pressable
      onPress={() => {
        feedback.tap()
        onOpen()
      }}
      android_ripple={{ color: t.ripple }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Avatar name={label} size="md" />
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: t.text }]}>
          {label}
        </Text>
        <Text numberOfLines={1} style={[styles.rowSub, { color: t.textTertiary }]}>
          {hasPhone ? prettyPhone(customer.phone) : customer.email || "No phone or email"}
        </Text>
      </View>
      {/* The two actions this whole screen exists for, one tap from the list —
          not buried behind opening the record first. */}
      <View style={styles.actions}>
        <QuickAction
          icon="call"
          disabled={!hasPhone}
          label={`Call ${label}`}
          onPress={() => void callNumber(customer.phone)}
        />
        <QuickAction
          icon="whatsapp"
          disabled={!hasPhone}
          label={`WhatsApp ${label}`}
          tint={t.success}
          onPress={() => void whatsapp(customer.phone)}
        />
      </View>
    </Pressable>
  )
}

function QuickAction({
  icon,
  onPress,
  label,
  disabled,
  tint,
}: {
  icon: "call" | "whatsapp"
  onPress: () => void
  label: string
  disabled?: boolean
  tint?: string
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: t.searchBg, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} size={18} color={tint ?? t.accent} variant="Bold" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingBottom: TAB_BAR_HEIGHT + 24, paddingTop: 6 },
  skeletons: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionTitle: {
    marginLeft: 6,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: font.semibold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  rowBody: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 15, fontFamily: font.semibold },
  rowSub: { marginTop: 2, fontSize: 12.5, fontFamily: font.regular },
  actions: { flexDirection: "row", marginLeft: 8 },
  action: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
})
