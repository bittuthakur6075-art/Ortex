import { Image } from "expo-image"
import React from "react"
import { StyleSheet, View } from "react-native"

import { type Product } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import {
  AppScreen,
  DataNotice,
  ListRefreshControl,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  ListRow,
  ProfileAvatarButton,
  RowSeparator,
  Skeleton,
} from "@/ui"

// The catalogue you price from. Writable since the product editor arrived: the
// FAB and the detail page's edit button write the same `products` row the
// console reads. Bulk import and draft/archived status stay console decisions.
//
// Same shell and row idiom as Quotes — collapsing title, full-bleed rows with a
// 2px band between them. A product's leading slot is its photo where it has one,
// which is the one thing an icon well cannot say. Tapping a row opens the
// product page (ProductDetailScreen), where the photo is the point.

const UNCATEGORISED = "Uncategorised"

export default function ProductsScreen({ navigation }: TabScreenProps<"Products">) {
  const t = useTheme()
  const { items, loading, refreshing, error, fromCache, cachedAt, reload } = useCollection<Product>("products")

  // Draft and archived products never reach the phone: status is the console's
  // to manage, and a rep quoting from the field should only ever see what is
  // actually sellable. A product with no status is active, as everywhere else.
  const visible = React.useMemo(
    () => items.filter((p) => (p.status || "active") === "active"),
    [items],
  )

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <AppScreen
        title="Products"
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
          refreshControl: <ListRefreshControl refreshing={refreshing} onRefresh={reload} />,
          keyExtractor: (p: unknown) => (p as Product).id,
          ItemSeparatorComponent: RowSeparator,
          ListFooterComponent: visible.length ? <RowSeparator /> : null,
          ListEmptyComponent: loading ? (
            <View style={{ paddingHorizontal: gutter, gap: spacing.sm }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={88} radius={12} />
              ))}
            </View>
          ) : error && !items.length ? (
            <EmptyState icon="warning" title="Could not load products" hint={error} actionLabel="Try again" onAction={() => void reload()} />
          ) : (
            <EmptyState
              icon="product"
              title="No products yet"
              hint="Tap + to add one here, or import the catalogue in the console."
              actionLabel="New product"
              onAction={() => navigation.navigate("ProductEditor")}
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
                      <Icon name="product" size={24} color={t.textTertiary} variant="Bulk" />
                    )}
                  </View>
                }
                // One line, truncated: a product row is scanned down the photo
                // and the name column, and a wrapped name breaks that rhythm.
                titleLines={1}
                title={p.name || "Untitled product"}
                subtitle={[
                  p.category || UNCATEGORISED,
                  p.moq ? `MOQ ${p.moq} ${p.unit || "pcs"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("ProductDetail", { id: p.id })
                }}
              />
            )
          },
        }}
      >
        <DataNotice error={error} fromCache={fromCache} cachedAt={cachedAt} onRetry={() => void reload()} />
        {visible.length ? <RowSeparator /> : null}
      </AppScreen>

      {/* The console remains the richer editor, but a product missing in front of
          a customer should not wait for someone to reach a desk. */}
      <Fab accessibilityLabel="New product" onPress={() => navigation.navigate("ProductEditor")} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Bigger than the 38dp icon well the other tabs use: on this tab the photo IS
  // the identifying mark, and 38 is too small to tell two lanyards apart.
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
})
