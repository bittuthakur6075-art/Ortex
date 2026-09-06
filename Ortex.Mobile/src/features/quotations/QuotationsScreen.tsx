import React from "react"
import { View } from "react-native"

import { formatCurrency, shortAge } from "@/domain/format"
import { QUOTATION_STATUS, type Quotation } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import {
  AppScreen,
  ChipGroup,
  EmptyState,
  Fab,
  IconButton,
  ListRow,
  ProfileAvatarButton,
  RowSeparator,
  Skeleton,
  StatusBadge,
} from "@/ui"

// The tab the app exists for. Everything else feeds it.
//
// Presentation follows the full-bleed row idiom (see ui/ListRow.tsx): each
// quotation is a flat plane separated from the next by a 2px band, carrying the
// customer, its number and age, and the figure with its status beneath — the
// console's seven-column table with the columns turned into lines.

const FILTERS = [
  { key: "all", label: "All" },
  ...QUOTATION_STATUS.map((s) => ({ key: s.id, label: s.label })),
]

export default function QuotationsScreen({ navigation }: TabScreenProps<"Quotes">) {
  const c = useTheme()
  const { items, loading } = useCollection<Quotation>("quotations")
  // Search moved to the app bar as a GLOBAL search (features/search) — a per-tab
  // field could only find what you were already looking at.
  const [filter, setFilter] = React.useState("all")

  const visible = React.useMemo(() => {
    return items
      .filter((doc) => {
        if (filter !== "all" && doc.status !== filter) return false
        return true
      })
      .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
  }, [items, filter])

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppScreen
        title="Quotations"
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <IconButton
            name="search"
            onPress={() => navigation.navigate("Search")}
            accessibilityLabel="Search everything"
          />
        }
        list={{
          data: loading ? [] : visible,
          keyExtractor: (q: unknown) => (q as Quotation).id,
          // A row's 2px band is its own edge, so one is drawn after the last row as
          // well as between every pair (the leading one is in the header below).
          ItemSeparatorComponent: RowSeparator,
          ListFooterComponent: visible.length ? <RowSeparator /> : null,
          ListEmptyComponent: loading ? (
            <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={72} radius={12} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="quote"
              title={filter !== "all" ? "Nothing matches" : "No quotations yet"}
              hint={
                filter !== "all"
                  ? "Try clearing the filter above."
                  : "Tap + to raise one, or start from a lead."
              }
              actionLabel={filter !== "all" ? undefined : "New quotation"}
              onAction={filter !== "all" ? undefined : () => navigation.navigate("QuotationEditor")}
            />
          ),
          renderItem: ({ item }: { item: unknown }) => {
            const doc = item as Quotation
            return (
              <ListRow
                leadingIcon="quote"
                title={doc.customer?.company || doc.customer?.name || "No customer"}
                subtitle={`${doc.number} · ${shortAge(doc.createdAt)}`}
                value={formatCurrency(doc.totals?.grandTotal || 0)}
                valueSub={<StatusBadge list={QUOTATION_STATUS} id={doc.status} small />}
                chevron={false}
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("QuotationDetail", { id: doc.id })
                }}
              />
            )
          },
        }}
      >
        <View style={{ marginBottom: spacing.sm }}>
          <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
        </View>
        {visible.length ? <RowSeparator /> : null}
      </AppScreen>

      <Fab accessibilityLabel="New quotation" onPress={() => navigation.navigate("QuotationEditor")} />
    </View>
  )
}
