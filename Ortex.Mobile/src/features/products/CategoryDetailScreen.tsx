import { Image } from "expo-image"
import React from "react"
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native"

import { type Category, type Product, type Row } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  DetailSkeleton,
  Icon,
  IconButton,
  ImageViewer,
  ListRow,
  Panel,
  PanelBand,
  RecordActivityPanel,
  RowSeparator,
  Section,
  FactRow,
} from "@/ui"

/**
 * One category — the shelf, not the thing on it.
 *
 * A category is read for three different reasons, and the page answers them in
 * that order: WHAT IS ON THIS SHELF (the products, because a rep standing in
 * front of a customer asks "what do we do in acrylic?"), WHAT IT COSTS TO QUOTE
 * (the HSN and GST every product on it inherits, which is the reason a wrong
 * category is a wrong tax line), and HOW IT LOOKS ON THE WEBSITE (the copy the
 * console writes and this app only reads).
 *
 * It exists because tapping a category used to open the EDITOR: the only way to
 * see what a shelf held was to open a form and risk saving it. Reading and
 * writing are now the two separate acts they are everywhere else in this app —
 * the pencil in the bar is the way in to the editor, as on the product page.
 */
export default function CategoryDetailScreen({ route, navigation }: StackScreenProps<"CategoryDetail">) {
  const t = useTheme()
  const { items, loading } = useCollection<Category & Row>("categories")
  const products = useCollection<Product & Row>("products")
  const [viewer, setViewer] = React.useState(false)

  const category = items.find((c) => c.id === route.params.id)

  // What sits on this shelf, matched the way the console matches it: by the
  // category NAME stored on each product, not by id.
  const onShelf = React.useMemo(() => {
    if (!category) return []
    return products.items
      .filter((p) => p.category === category.name && (p.status || "active") === "active")
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  }, [products.items, category])

  if (!category && loading) {
    return <DetailSkeleton onBack={() => navigation.goBack()} hero={200} panels={[3, 2]} />
  }

  if (!category) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.surface }]}>
        <Text style={[textVariants.body, { color: t.textSecondary }]}>
          This category is no longer in the catalogue.
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const name = category.displayName || category.name || "Unnamed category"
  const hidden = category.active === false
  const width = Dimensions.get("window").width
  // Wider than the product page's 4:3: a category image is a banner across the
  // top of a web page, not a photograph of an object.
  const heroHeight = Math.round(width * 0.5)

  const intro = (category.intro || "").trim()
  const description = (category.description || "").trim()

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <AppScreen
        title={name}
        back
        onBack={() => navigation.goBack()}
        headerRight={
          <IconButton
            name="edit"
            onPress={() => {
              feedback.tap()
              navigation.navigate("CategoryEditor", { id: category.id })
            }}
            accessibilityLabel="Edit category"
          />
        }
      >
        <View style={[styles.hero, { height: heroHeight, backgroundColor: t.surfaceInset }]}>
          {category.image ? (
            // A category banner is cropped to this strip, so the only way to
            // check what was actually uploaded is to open it uncropped.
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="View image full screen"
              onPress={() => {
                feedback.tap()
                setViewer(true)
              }}
            >
              <Image
                source={{ uri: category.image }}
                style={{ width, height: heroHeight }}
                contentFit="cover"
                transition={140}
              />
            </Pressable>
          ) : (
            <View style={styles.heroEmpty}>
              <Icon name="catalogue" size={40} color={t.textFaint} variant="Bulk" />
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>No image yet</Text>
            </View>
          )}
        </View>
        <PanelBand />

        <Panel padded style={styles.headPanel}>
          <View style={styles.chipLine}>
            <View style={[styles.chip, { backgroundColor: t.iconWell }]}>
              <Icon name="product" size={13} color={t.primary} variant="Bulk" />
              <Text style={[styles.chipText, { color: t.primary }]}>
                {onShelf.length} {onShelf.length === 1 ? "product" : "products"}
              </Text>
            </View>
            {/* Off the website is worth saying at the top: the shelf still
                exists for quoting, it is just not public. */}
            <View style={[styles.chip, { backgroundColor: hidden ? t.warningBg : t.successBg }]}>
              <Icon
                name={hidden ? "hidden" : "tick"}
                size={13}
                color={hidden ? t.warningText : t.successText}
                variant="Bulk"
              />
              <Text style={[styles.chipText, { color: hidden ? t.warningText : t.successText }]}>
                {hidden ? "Hidden from website" : "On the website"}
              </Text>
            </View>
          </View>

          {!!description && (
            <Text style={[textVariants.body, { color: t.textSecondary, marginTop: spacing.md }]}>
              {description}
            </Text>
          )}
        </Panel>

        {/* The tax defaults, stated as facts rather than buried in a form: every
            product filed here inherits them, so a wrong HSN here is a wrong HSN
            on every quotation that follows. */}
        <Section title="Quoting defaults">
          <FactRow icon="gst" label="HSN code" value={category.hsn || null} />
          <FactRow icon="percent" label="GST rate" value={`${category.gstRate ?? 0}%`} />
          <FactRow icon="sort" label="Website order" value={String(category.sortOrder ?? 0)} />
        </Section>

        {onShelf.length > 0 ? (
          <Panel title="On this shelf">
            <RowSeparator />
            {onShelf.map((p, i) => (
              <View key={p.id}>
                <ListRow
                  leading={
                    <View style={[styles.thumb, { backgroundColor: t.surfaceInset }]}>
                      {p.images?.[0] ? (
                        <Image
                          source={{ uri: p.images[0] }}
                          style={styles.thumbImage}
                          contentFit="cover"
                          transition={120}
                        />
                      ) : (
                        <Icon name="product" size={22} color={t.textTertiary} variant="Bulk" />
                      )}
                    </View>
                  }
                  titleLines={1}
                  title={p.name || "Untitled product"}
                  subtitle={p.moq ? `MOQ ${p.moq} ${p.unit || "pcs"}` : undefined}
                  onPress={() => {
                    feedback.tap()
                    navigation.navigate("ProductDetail", { id: p.id })
                  }}
                />
                {i < onShelf.length - 1 && <RowSeparator />}
              </View>
            ))}
            {/* No closing separator: Panel draws its own 2dp band underneath,
                and two of them stack into a 4dp rule. */}
          </Panel>
        ) : (
          <Panel title="On this shelf" padded>
            <Text style={[textVariants.body, { color: t.textSecondary }]}>
              Nothing is filed here yet. A product picks up this category's HSN and GST the moment it is
              filed on the shelf.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Button
                label="Add a product here"
                variant="secondary"
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("ProductEditor", { presetCategory: category.name })
                }}
              />
            </View>
          </Panel>
        )}

        {/* Website copy is the CONSOLE's to write (CLAUDE.md: the phone leaves
            these alone), so it is shown here and nowhere editable — a rep should
            still be able to see what the site says about a range they are
            selling. Only what has actually been filled in is drawn. */}
        {(!!category.slug || !!category.seoTitle || !!category.seoDescription) && (
          <Section title="On the website">
            <FactRow icon="catalogue" label="URL slug" value={category.slug || null} />
            <FactRow icon="catalogue" label="Heading" value={category.displayName || category.name || null} />
            <FactRow icon="preview" label="SEO title" value={category.seoTitle || null} />
            <FactRow icon="preview" label="SEO description" value={category.seoDescription || null} />
          </Section>
        )}

        {/* A paragraph is not a fact row, so it gets its own panel rather than a
            hand-rolled label inside a run of `FactRow`s — that broke the
            grouped-row rhythm and put a second level of section label inside a
            section. */}
        {!!intro && (
          <Panel title="Intro" padded>
            <Text style={[textVariants.body, { color: t.textSecondary }]}>{intro}</Text>
          </Panel>
        )}

        <RecordActivityPanel collection="categories" record={category} />
      </AppScreen>

      <ImageViewer
        visible={viewer}
        images={category.image ? [category.image] : []}
        onClose={() => setViewer(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center", paddingHorizontal: gutter },
  // `Panel padded` pads its sides and its foot but NOT its head — right when a
  // panel opens with a section title, wrong for a head-less one, whose first
  // row would otherwise sit flush against the band above it.
  headPanel: { paddingTop: gutter },
  hero: { width: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  heroEmpty: { alignItems: "center", gap: spacing.xs },
  chipLine: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipText: { ...textVariants.caption },
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
