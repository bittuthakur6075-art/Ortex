import React from "react"
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native"

import { formatCurrency, relativeTime } from "@/domain/format"
import { QUOTATION_STATUS, type Quotation } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import {
  ChipGroup,
  EmptyState,
  Fab,
  IconButton,
  ScreenHeader,
  SearchField,
  Skeleton,
  StatusBadge,
} from "@/ui"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"

// The tab the app exists for. Everything else feeds it.

const FILTERS = [
  { key: "all", label: "All" },
  ...QUOTATION_STATUS.map((s) => ({ key: s.id, label: s.label })),
]

export default function QuotationsScreen({ navigation }: TabScreenProps<"Quotes">) {
  const t = useTheme()
  const { items, loading } = useCollection<Quotation>("quotations")
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState("all")

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((doc) => {
        if (filter !== "all" && doc.status !== filter) return false
        if (!q) return true
        return [doc.number, doc.customer?.name, doc.customer?.company, doc.customer?.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      })
      .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
  }, [items, query, filter])

  // Open value is what a salesperson is actually managing: everything still
  // live, excluding the ones already decided.
  const openValue = React.useMemo(
    () =>
      items
        .filter((q) => q.status === "draft" || q.status === "sent")
        .reduce((s, q) => s + (q.totals?.grandTotal || 0), 0),
    [items],
  )

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <ScreenHeader
        title="Quotes"
        subtitle={
          loading
            ? "Loading…"
            : `${formatCurrency(openValue, { compact: true })} open · ${items.length} total`
        }
        trailing={
          <IconButton
            name="profile"
            onPress={() => navigation.navigate("Profile")}
            accessibilityLabel="Profile"
          />
        }
      >
        <SearchField value={query} onChangeText={setQuery} placeholder="Number, customer or company" />
        <View style={styles.rail}>
          <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
        </View>
      </ScreenHeader>

      {loading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={70} radius={20} />
          ))}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(q) => q.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="quote"
              title={query || filter !== "all" ? "Nothing matches" : "No quotations yet"}
              hint={
                query || filter !== "all"
                  ? "Try clearing the filter above."
                  : "Tap + to raise one, or start from a lead."
              }
              actionLabel={query || filter !== "all" ? undefined : "New quotation"}
              onAction={query || filter !== "all" ? undefined : () => navigation.navigate("QuotationEditor")}
            />
          }
          renderItem={({ item }) => (
            <QuotationRow
              quotation={item}
              onPress={() => {
                feedback.tap()
                navigation.navigate("QuotationDetail", { id: item.id })
              }}
            />
          )}
        />
      )}

      <Fab accessibilityLabel="New quotation" onPress={() => navigation.navigate("QuotationEditor")} />
    </View>
  )
}

function QuotationRow({ quotation, onPress }: { quotation: Quotation; onPress: () => void }) {
  const t = useTheme()
  const who = quotation.customer?.company || quotation.customer?.name || "No customer"
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.ripple }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: t.text }]}>
          {who}
        </Text>
        <Text numberOfLines={1} style={[styles.rowSub, { color: t.textTertiary }]}>
          {quotation.number} · {relativeTime(quotation.createdAt)}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.amount, { color: t.text }]}>
          {formatCurrency(quotation.totals?.grandTotal || 0)}
        </Text>
        <StatusBadge list={QUOTATION_STATUS} id={quotation.status} small />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rail: { marginTop: 12 },
  list: { paddingTop: 4, paddingBottom: TAB_BAR_HEIGHT + 96 },
  skeletons: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13 },
  rowBody: { flex: 1, marginRight: 10 },
  rowTitle: { fontSize: 15.5, fontFamily: font.semibold },
  rowSub: { marginTop: 3, fontSize: 12.5, fontFamily: font.regular },
  rowEnd: { alignItems: "flex-end" },
  amount: { fontSize: 15, fontFamily: font.bold, marginBottom: 4 },
})
