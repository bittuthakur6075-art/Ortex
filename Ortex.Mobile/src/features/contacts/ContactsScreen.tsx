import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import type { Customer, Row } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { callNumber, prettyPhone, whatsapp } from "@/lib/contact"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  ProfileAvatarButton,
  RowSeparator,
  Skeleton,
} from "@/ui"

export type CustomerRow = Customer & Row

// A `customers` document holds exactly one contact — name, company, one phone,
// one email. There is no contacts array in the schema, and the console matches
// records on email-then-phone rather than on company, so one firm legitimately
// has several rows: the buyer, the accounts person, the site engineer.
//
// So the directory groups rows by company and treats each row under a heading as
// a contact of that company. People with no company get their own single-row
// section, which is exactly what they are.
//
// Call and WhatsApp stay in the row itself rather than behind a tap: they are the
// reason this tab exists, and a directory that makes you open a record first is a
// directory that gets used once.

const UNGROUPED = "Individuals"

export default function ContactsScreen({ navigation }: TabScreenProps<"Contacts">) {
  const t = useTheme()
  const { items, loading } = useCollection<CustomerRow>("customers")

  const sections = React.useMemo(() => {
    const byCompany = new Map<string, CustomerRow[]>()
    for (const c of items) {
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
  }, [items])

  const total = sections.reduce((n, s) => n + s.data.length, 0)

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title="Contacts"
        subtitle={loading ? "Loading…" : `${total} contacts · ${sections.length} companies`}
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <IconButton
            name="search"
            onPress={() => navigation.navigate("Search")}
            accessibilityLabel="Search everything"
          />
        }
        sections={{
          sections: loading ? [] : sections,
          keyExtractor: (c: unknown) => (c as CustomerRow).id,
          stickySectionHeadersEnabled: false,
          ItemSeparatorComponent: RowSeparator,
          renderSectionHeader: ({ section }: { section: unknown }) => (
            <View style={styles.sectionHead}>
              <Icon
                name={(section as { title: string }).title === UNGROUPED ? "customer" : "company"}
                size={13}
                color={t.textTertiary}
              />
              <Text
                numberOfLines={1}
                style={[textVariants.sectionLabel, styles.sectionTitle, { color: t.textTertiary }]}
              >
                {(section as { title: string }).title.toUpperCase()}
              </Text>
            </View>
          ),
          ListEmptyComponent: loading ? (
            <View style={{ paddingHorizontal: gutter, gap: spacing.sm }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={64} radius={12} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="customer"
              title="No customers yet"
              hint="A customer is added automatically the first time you quote them."
            />
          ),
          renderItem: ({ item }: { item: unknown }) => {
            const customer = item as CustomerRow
            const label = customer.name || customer.company || "Unnamed contact"
            const hasPhone = !!String(customer.phone || "").replace(/\D/g, "")
            return (
              <ListRow
                leading={<Avatar name={label} size="md" />}
                title={label}
                subtitle={hasPhone ? prettyPhone(customer.phone) : customer.email || "No phone or email"}
                chevron={false}
                onPress={() => navigation.navigate("CustomerDetail", { id: customer.id })}
                trailing={
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
                }
              />
            )
          },
        }}
      />
    </View>
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
        {
          backgroundColor: t.surfaceInset,
          opacity: disabled ? 0.35 : pressed ? state.pressedOpacity : 1,
        },
      ]}
    >
      <Icon name={icon} size={18} color={tint ?? t.primary} variant="Bold" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { marginLeft: 6, flex: 1 },
  actions: { flexDirection: "row" },
  action: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
})
