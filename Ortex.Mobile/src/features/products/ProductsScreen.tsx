import { Image } from "expo-image"
import React from "react"
import { StyleSheet, View } from "react-native"

import { canAccess } from "@/domain/modules"
import { type Category, type Product, type Row, type Work } from "@/domain/schema"
import NotificationBell from "@/features/notifications/NotificationBell"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import {
  AppScreen,
  DataNotice,
  EmptyState,
  Fab,
  Icon,
  IconButton,
  ListRefreshControl,
  ListRow,
  ProfileAvatarButton,
  RowSeparator,
  SegmentedControl,
  SkeletonList,
} from "@/ui"
import type { IconName } from "@/ui/Icon"

// The catalogue you price from, and the two things behind it.
//
// Three segments over one screen, the same shape the Leads tab uses for
// enquiries and voice calls, and the same grouping the console keeps on its
// Catalog hub: PRODUCTS is what you quote, CATEGORIES is the shelf a product
// sits on (and the default HSN/GST it inherits), WORK is the photo gallery the
// website shows. They were behind an overflow menu first, which hid two whole
// collections behind a glyph; a segment says what is there.
//
// Each segment is gated on its own module, because `staff_products`,
// `staff_categories` and `staff_work` (migration 0007/0012) are three separate
// RLS policies: a rep granted only Products sees only Products, and the control
// disappears entirely rather than offering a tap the database would refuse.

const UNCATEGORISED = "Uncategorised"

type Tab = "products" | "categories" | "work"

export default function ProductsScreen({ navigation }: TabScreenProps<"Products">) {
  const t = useTheme()
  const { profile } = useAuth()
  const canCategories = canAccess(profile, "categories")
  const canWork = canAccess(profile, "work")

  const products = useCollection<Product & Row>("products")
  const categories = useCollection<Category & Row>("categories")
  const work = useCollection<Work & Row>("work")

  const segments = React.useMemo(
    () =>
      [
        { key: "products" as const, label: "Products" },
        canCategories ? { key: "categories" as const, label: "Categories" } : null,
        canWork ? { key: "work" as const, label: "Our work" } : null,
      ].filter(Boolean) as { key: Tab; label: string }[],
    [canCategories, canWork],
  )
  const [tab, setTab] = React.useState<Tab>("products")

  // Draft and archived products never reach the phone: status is the console's
  // to manage, and a rep quoting from the field should only ever see what is
  // actually sellable. A product with no status is active, as everywhere else.
  const visibleProducts = React.useMemo(
    () => products.items.filter((p) => (p.status || "active") === "active"),
    [products.items],
  )

  const productCount = React.useCallback(
    (name: string) => products.items.filter((p) => p.category === name).length,
    [products.items],
  )

  // Both of the other two are shown in the order the WEBSITE will show them —
  // sortOrder first, then a stable tiebreak — so "what comes first" is
  // answerable here rather than after a deploy.
  const orderedCategories = React.useMemo(
    () =>
      [...categories.items].sort(
        (a, b) =>
          (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || (a.name || "").localeCompare(b.name || ""),
      ),
    [categories.items],
  )
  const orderedWork = React.useMemo(
    () =>
      [...work.items].sort(
        (a, b) =>
          (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) ||
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      ),
    [work.items],
  )

  const source = tab === "categories" ? categories : tab === "work" ? work : products
  const data: unknown[] =
    tab === "categories" ? orderedCategories : tab === "work" ? orderedWork : visibleProducts
  const loading = source.loading
  const empty = !source.items.length

  const add = () => {
    if (tab === "categories") return navigation.navigate("CategoryEditor")
    if (tab === "work") return navigation.navigate("WorkEditor")
    navigation.navigate("ProductEditor")
  }

  const addLabel =
    tab === "categories" ? "New category" : tab === "work" ? "Add work photo" : "New product"

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {/* Remounted per segment on purpose, so switching segment starts at the
          top: the three collections are different lengths, and inheriting a
          scroll offset from Products drops you into the middle of Our work. */}
      <AppScreen
        key={tab}
        title="Catalogue"
        subtitle={
          loading
            ? "Loading…"
            : tab === "categories"
              ? `${orderedCategories.length} categories`
              : tab === "work"
                ? `${orderedWork.length} photos`
                : `${visibleProducts.length} products`
        }
        headerLeft={<ProfileAvatarButton />}
        headerRight={
          <>
            <NotificationBell />
            <IconButton
              name="search"
              onPress={() => navigation.navigate("Search")}
              accessibilityLabel="Search everything"
            />
          </>
        }
        list={{
          data: loading ? [] : data,
          refreshControl: <ListRefreshControl refreshing={source.refreshing} onRefresh={source.reload} />,
          keyExtractor: (x: unknown) => (x as Row).id,
          ItemSeparatorComponent: RowSeparator,
          ListFooterComponent: data.length ? <RowSeparator /> : null,
          // All three segments are photo-led rows, so one placeholder shape
          // serves all three.
          ListEmptyComponent: loading ? (
            <SkeletonList count={6} leading="photo" leadingSize={56} />
          ) : source.error && empty ? (
            <EmptyState
              icon="warning"
              title={`Could not load ${tab === "work" ? "the gallery" : tab}`}
              hint={source.error}
              actionLabel="Try again"
              onAction={() => void source.reload()}
            />
          ) : tab === "categories" ? (
            <EmptyState
              icon="catalogue"
              title="No categories yet"
              hint="A category is the shelf a product sits on, and the default HSN and GST it inherits."
              actionLabel="New category"
              onAction={add}
            />
          ) : tab === "work" ? (
            <EmptyState
              icon="image"
              title="No work photos yet"
              hint="Add a photo of a finished job and it appears on the website gallery."
              actionLabel="Add a photo"
              onAction={add}
            />
          ) : (
            <EmptyState
              icon="product"
              title="No products yet"
              hint="Tap + to add one here, or import the catalogue in the console."
              actionLabel="New product"
              onAction={add}
            />
          ),
          renderItem: ({ item }: { item: unknown }) => {
            if (tab === "categories") {
              const category = item as Category & Row
              const used = productCount(category.name)
              return (
                <ListRow
                  leading={<Thumb uri={category.image} fallback="catalogue" />}
                  titleLines={1}
                  title={category.name || "Unnamed"}
                  subtitle={[
                    `${used} product${used === 1 ? "" : "s"}`,
                    `GST ${category.gstRate ?? 0}%`,
                    category.hsn ? `HSN ${category.hsn}` : null,
                    // Off the website is worth saying in the list: the shelf
                    // still exists for quoting, it is just not public.
                    category.active === false ? "Hidden" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  // Opens the shelf to READ it. The editor is the pencil on that
                  // page, so seeing what a category holds no longer means
                  // opening a form over it.
                  onPress={() => {
                    feedback.tap()
                    navigation.navigate("CategoryDetail", { id: category.id })
                  }}
                />
              )
            }

            if (tab === "work") {
              const photo = item as Work & Row
              return (
                <ListRow
                  leading={<Thumb uri={photo.image} fallback="image" />}
                  titleLines={1}
                  title={photo.title || "Untitled"}
                  subtitle={[
                    photo.category || "No category",
                    // Same sentence the category rows use: off the website is
                    // worth saying in the list, because the row still exists.
                    photo.active === false ? "Hidden" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => {
                    feedback.tap()
                    navigation.navigate("WorkDetail", { id: photo.id })
                  }}
                />
              )
            }

            const p = item as Product & Row
            const image = p.images?.[0]
            return (
              <ListRow
                leading={<Thumb uri={image} fallback="product" />}
                // One line, truncated: a product row is scanned down the photo
                // and the name column, and a wrapped name breaks that rhythm.
                titleLines={1}
                title={p.name || "Untitled product"}
                subtitle={[p.category || UNCATEGORISED, p.moq ? `MOQ ${p.moq} ${p.unit || "pcs"}` : null]
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
        <DataNotice
          error={source.error}
          fromCache={source.fromCache}
          cachedAt={source.cachedAt}
          onRetry={() => void source.reload()}
        />
        {segments.length > 1 && (
          <View style={styles.segments}>
            <SegmentedControl options={segments} value={tab} onChange={setTab} />
          </View>
        )}
        {tab !== "work" && data.length ? <RowSeparator /> : null}
      </AppScreen>

      {/* The console remains the richer editor, but a product missing in front of
          a customer should not wait for someone to reach a desk. The FAB follows
          the segment: on Categories it adds a shelf, on Our work a photo. */}
      <Fab accessibilityLabel={addLabel} onPress={add} />
    </View>
  )
}

/**
 * The leading slot every row on this screen uses.
 *
 * All three collections are things you RECOGNISE BY SIGHT — a product, the
 * shelf it sits on, a photo of a finished job — so all three lead with their
 * own picture at the same 56dp, and an icon well is only what you get when the
 * record has no image yet. Before this, categories led with a generic
 * `catalogue` glyph (every row identical) and work photos were a two-column
 * grid of white tiles on a white page, which had no edge at all.
 */
function Thumb({ uri, fallback }: { uri?: string; fallback: IconName }) {
  const t = useTheme()
  return (
    <View style={[styles.thumb, { backgroundColor: t.surfaceInset }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" transition={120} />
      ) : (
        <Icon name={fallback} size={24} color={t.textTertiary} variant="Bulk" />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: gutter, marginBottom: spacing.sm },

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
