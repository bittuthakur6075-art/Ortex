import { Image } from "expo-image"
import React from "react"
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native"

import { formatCurrency } from "@/domain/format"
import { PRODUCT_STATUS, type Product } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import {
  ChipGroup,
  EmptyState,
  Icon,
  IconButton,
  ScreenHeader,
  SearchField,
  Sheet,
  Skeleton,
  StatusBadge,
  Button,
} from "@/ui"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"

// The catalogue you price from. Read-only on purpose: creating and editing
// products stays in the console, where the bulk import, the photo pipeline and
// the website-visibility flag live.

type Filter = "all" | "active" | "draft" | "archived"

const FILTERS = [
  { key: "all" as const, label: "All" },
  { key: "active" as const, label: "Active" },
  { key: "draft" as const, label: "Draft" },
  { key: "archived" as const, label: "Archived" },
]

export default function ProductsScreen({ navigation }: TabScreenProps<"Products">) {
  const t = useTheme()
  const { items, loading } = useCollection<Product>("products")
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("active")
  const [selected, setSelected] = React.useState<Product | null>(null)

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((p) => {
      if (filter !== "all" && (p.status || "active") !== filter) return false
      if (!q) return true
      return [p.name, p.sku, p.category, p.hsn, p.material]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [items, query, filter])

  const addToQuotation = (product: Product) => {
    setSelected(null)
    feedback.tap()
    navigation.navigate("QuotationEditor", {
      prefill: {
        lines: [
          {
            productId: product.id,
            description: product.name,
            hsn: product.hsn || "",
            // A product's MOQ is the smallest quantity it can be sold in, so it
            // is the only honest starting quantity.
            quantity: product.moq || 1,
            unit: product.unit || "pcs",
            rate: product.basePrice || 0,
            discountPercent: 0,
            gstRate: product.gstRate ?? 18,
          },
        ],
      },
    })
  }

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <ScreenHeader
        title="Products"
        subtitle={loading ? "Loading…" : `${visible.length} of ${items.length}`}
        trailing={
          <IconButton
            name="profile"
            onPress={() => navigation.navigate("Profile")}
            accessibilityLabel="Profile"
          />
        }
      >
        <SearchField value={query} onChangeText={setQuery} placeholder="Name, SKU or HSN" />
        <View style={styles.rail}>
          <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
        </View>
      </ScreenHeader>

      {loading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={74} radius={20} />
          ))}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="product"
              title={query ? "No matching products" : "No products yet"}
              hint={
                query
                  ? "Try the SKU, or clear the filter above."
                  : "Products are added in the Ortex admin console."
              }
            />
          }
          renderItem={({ item }) => (
            <ProductRow
              product={item}
              onPress={() => {
                feedback.tap()
                setSelected(item)
              }}
            />
          )}
        />
      )}

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetMeta}>
              <Meta label="Price" value={formatCurrency(selected.basePrice)} />
              <Meta label="GST" value={`${selected.gstRate ?? 18}%`} />
              <Meta label="MOQ" value={`${selected.moq || 1} ${selected.unit || "pcs"}`} />
            </View>
            <View style={styles.sheetMeta}>
              <Meta label="SKU" value={selected.sku || "-"} />
              <Meta label="HSN" value={selected.hsn || "-"} />
              <Meta label="Lead time" value={selected.leadTimeDays ? `${selected.leadTimeDays} days` : "-"} />
            </View>
            {!!selected.description && (
              <Text style={[styles.description, { color: t.textSecondary }]}>{selected.description}</Text>
            )}
            <View style={styles.sheetAction}>
              <Button
                label="Add to a quotation"
                icon="quote"
                onPress={() => addToQuotation(selected)}
                fullWidth
              />
            </View>
          </View>
        )}
      </Sheet>
    </View>
  )
}

function ProductRow({ product, onPress }: { product: Product; onPress: () => void }) {
  const t = useTheme()
  const image = product.images?.[0]
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.ripple }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.thumb, { backgroundColor: t.searchBg }]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.thumbImage} contentFit="cover" transition={120} />
        ) : (
          <Icon name="product" size={20} color={t.textTertiary} />
        )}
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: t.text }]}>
          {product.name || "Untitled product"}
        </Text>
        <Text numberOfLines={1} style={[styles.rowSub, { color: t.textTertiary }]}>
          {[product.sku, product.category].filter(Boolean).join(" · ") || "No SKU"}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.price, { color: t.text }]}>{formatCurrency(product.basePrice)}</Text>
        <StatusBadge list={PRODUCT_STATUS} id={product.status} small />
      </View>
    </Pressable>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={styles.meta}>
      <Text style={[styles.metaLabel, { color: t.textTertiary }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: t.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rail: { marginTop: 12 },
  list: { paddingBottom: TAB_BAR_HEIGHT + 24, paddingTop: 4 },
  skeletons: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
  rowBody: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 15, fontFamily: font.semibold },
  rowSub: { marginTop: 2, fontSize: 12.5, fontFamily: font.regular },
  rowEnd: { alignItems: "flex-end", marginLeft: 10 },
  price: { fontSize: 14, fontFamily: font.bold, marginBottom: 4 },
  sheet: { paddingHorizontal: 4 },
  sheetMeta: { flexDirection: "row", marginBottom: 14 },
  meta: { flex: 1 },
  metaLabel: { fontSize: 11.5, fontFamily: font.medium, textTransform: "uppercase", letterSpacing: 0.4 },
  metaValue: { marginTop: 3, fontSize: 15, fontFamily: font.semibold },
  description: { fontSize: 14, lineHeight: 20, marginBottom: 16, fontFamily: font.regular },
  sheetAction: { marginTop: 4 },
})
