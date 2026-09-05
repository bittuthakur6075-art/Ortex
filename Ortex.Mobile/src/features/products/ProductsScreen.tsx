import { Image } from "expo-image"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatCurrency } from "@/domain/format"
import { PRODUCT_STATUS, type Product } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  ChipGroup,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  ProfileAvatarButton,
  RowSeparator,
  Sheet,
  Skeleton,
  StatusBadge,
} from "@/ui"

// The catalogue you price from. Read-only on purpose: creating and editing
// products stays in the console, where the bulk import, the photo pipeline and
// the website-visibility flag live.
//
// Same shell and row idiom as Quotes — collapsing title, full-bleed rows with a
// 2px band between them. A product's leading slot is its photo where it has one,
// which is the one thing an icon well cannot say.

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
  const [filter, setFilter] = React.useState<Filter>("active")
  const [selected, setSelected] = React.useState<Product | null>(null)

  const visible = React.useMemo(
    () => items.filter((p) => filter === "all" || (p.status || "active") === filter),
    [items, filter],
  )

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
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title="Products"
        subtitle={loading ? "Loading…" : `${visible.length} of ${items.length}`}
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
          keyExtractor: (p: unknown) => (p as Product).id,
          ItemSeparatorComponent: RowSeparator,
          ListFooterComponent: visible.length ? <RowSeparator /> : null,
          ListEmptyComponent: loading ? (
            <View style={{ paddingHorizontal: gutter, gap: spacing.sm }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={72} radius={12} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="product"
              title={filter === "all" ? "No products yet" : "Nothing in this filter"}
              hint={
                filter === "all"
                  ? "Products are added in the Ortex admin console."
                  : "Try All, or search from the bar above."
              }
            />
          ),
          renderItem: ({ item }: { item: unknown }) => {
            const p = item as Product
            const image = p.images?.[0]
            return (
              <ListRow
                leading={
                  <View style={[styles.thumb, { backgroundColor: t.surfaceInset }]}>
                    {image ? (
                      <Image
                        source={{ uri: image }}
                        style={styles.thumbImage}
                        contentFit="cover"
                        transition={120}
                      />
                    ) : (
                      <Icon name="product" size={18} color={t.textTertiary} />
                    )}
                  </View>
                }
                title={p.name || "Untitled product"}
                subtitle={[p.sku, p.category].filter(Boolean).join(" · ") || "No SKU"}
                value={formatCurrency(p.basePrice)}
                valueSub={<StatusBadge list={PRODUCT_STATUS} id={p.status} small />}
                chevron={false}
                onPress={() => {
                  feedback.tap()
                  setSelected(p)
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

      {/* A short choice list is a bottom sheet, never a centred dialog. */}
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <View>
            <View style={styles.metaRow}>
              <Meta label="Price" value={formatCurrency(selected.basePrice)} />
              <Meta label="GST" value={`${selected.gstRate ?? 18}%`} />
              <Meta label="MOQ" value={`${selected.moq || 1} ${selected.unit || "pcs"}`} />
            </View>
            <View style={styles.metaRow}>
              <Meta label="SKU" value={selected.sku || "-"} />
              <Meta label="HSN" value={selected.hsn || "-"} />
              <Meta label="Lead time" value={selected.leadTimeDays ? `${selected.leadTimeDays} days` : "-"} />
            </View>
            {!!selected.description && (
              <Text style={[textVariants.body, { color: t.textSecondary, marginBottom: spacing.md }]}>
                {selected.description}
              </Text>
            )}
            <Button
              label="Add to a quotation"
              icon="quote"
              onPress={() => addToQuotation(selected)}
              fullWidth
            />
          </View>
        )}
      </Sheet>
    </View>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={styles.meta}>
      <Text style={[textVariants.tileLabel, { color: t.textTertiary }]}>{label.toUpperCase()}</Text>
      <Text style={[textVariants.factValue, { color: t.text, marginTop: 3 }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  thumb: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
  metaRow: { flexDirection: "row", marginBottom: spacing.md },
  meta: { flex: 1 },
})
