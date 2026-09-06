import { Image } from "expo-image"
import React from "react"
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { formatCurrency } from "@/domain/format"
import type { Product } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { copy } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, size as sizes, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Button, Dialog, Icon, Panel, PanelBand, PopupMenu, useToast } from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * The product page: a catalogue page, not a form.
 *
 * A rep opens a product for one of two reasons — to SHOW it to the person across
 * the table, or to put it on a quotation — and the page is built in that order.
 * The photo is the page rather than a thumbnail on it (tap it and it goes
 * full-screen, which is what actually happens across a table); the facts are a
 * scannable grid rather than a stack of prose rows; and the price sits in the
 * footer BESIDE the one action, so "what does it cost" and "put it on a quote"
 * are answered without scrolling back.
 *
 * The console remains the only place a product is edited; everything here reads.
 */

/** The distance the name takes to hand over to the app bar title. */
const COLLAPSE = 180

export default function ProductDetailScreen({ route, navigation }: StackScreenProps<"ProductDetail">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { items } = useCollection<Product>("products")
  // Same admin gate as the quotation page — and the same caveat: it is a UI
  // gate only. `staff_all` grants every authenticated user `for all`, so the
  // database itself does not refuse a delete from a sales executive.
  const { profile } = useAuth()
  const isAdmin = profile?.role === "admin"
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const scrollY = React.useRef(new Animated.Value(0)).current
  const [page, setPage] = React.useState(0)
  const [viewer, setViewer] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  const product = items.find((p) => p.id === route.params.id)

  // The hero is a 4:3 window on the photo. Squarer than that and the facts are
  // pushed off the fold on a small phone; wider and a portrait product photo is
  // cropped to a strip.
  const width = Dimensions.get("window").width
  const heroHeight = Math.round(width * 0.75)

  if (!product) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.surface, paddingTop: insets.top }]}>
        <Text style={{ color: t.textSecondary, fontFamily: font.medium }}>
          This product is no longer in the catalogue.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const name = product.name || "Untitled product"
  const images = (product.images || []).filter(Boolean)
  const unit = product.unit || "pcs"
  const gstRate = product.gstRate ?? 18
  const price = product.basePrice || 0
  const withTax = Math.round(price * (1 + gstRate / 100))

  const barTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE * 0.6, COLLAPSE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })
  // The bar is glass over the photo until the content reaches it, then it is a bar.
  const barFill = barTitleOpacity

  // Two things the photo does as you move: it drifts at half the scroll speed
  // going up (depth), and it grows to fill an over-pull going down instead of
  // leaving a white gap above it.
  const heroShift = scrollY.interpolate({
    inputRange: [0, heroHeight],
    outputRange: [0, heroHeight * 0.5],
    extrapolate: "clamp",
  })
  const heroScale = scrollY.interpolate({
    inputRange: [-heroHeight, 0],
    outputRange: [2.2, 1],
    extrapolateRight: "clamp",
  })

  const remove = async () => {
    if (!product) return
    setDeleting(true)
    try {
      await repo.remove("products", product.id)
      feedback.created()
      toast.show({ message: `${product.name || "Product"} deleted`, tone: "success" })
      // Leave before the realtime tick lands: this screen reads the product by
      // id out of the collection, and staying would leave it on a missing row.
      navigation.goBack()
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not delete the product"), tone: "danger" })
    } finally {
      setConfirmDelete(false)
      setDeleting(false)
    }
  }

  const share = async () => {
    const body = [
      name,
      product.category,
      price ? `${formatCurrency(price)} per ${unit} + ${gstRate}% GST` : "",
      product.moq ? `MOQ ${product.moq} ${unit}` : "",
      product.description,
    ]
      .filter(Boolean)
      .join("\n")
    try {
      await Share.share({ message: body })
    } catch {
      toast.show({ message: "Could not share", tone: "danger" })
    }
  }

  const copyValue = async (value: string, what: string) => {
    await copy(value)
    feedback.tap()
    toast.show({ message: `${what} copied`, tone: "success" })
  }

  const addToQuotation = () => {
    feedback.tap()
    navigation.navigate("QuotationEditor", {
      prefill: {
        lines: [
          {
            productId: product.id,
            description: name,
            hsn: product.hsn || "",
            // A product's MOQ is the smallest quantity it can be sold in, so it
            // is the only honest starting quantity.
            quantity: product.moq || 1,
            unit,
            rate: price,
            discountPercent: 0,
            gstRate,
          },
        ],
      },
    })
  }

  // Only facts the product actually carries. A grid of "Not on file" is noise
  // dressed as data.
  const facts: { icon: IconName; label: string; value: string; copyable?: boolean }[] = [
    product.sku ? { icon: "copy" as const, label: "SKU", value: product.sku, copyable: true } : null,
    product.hsn ? { icon: "gst" as const, label: "HSN", value: product.hsn, copyable: true } : null,
    { icon: "percent" as const, label: "GST", value: `${gstRate}%` },
    { icon: "product" as const, label: "Min order", value: `${product.moq || 1} ${unit}` },
    product.leadTimeDays
      ? { icon: "clock" as const, label: "Lead time", value: `${product.leadTimeDays} days` }
      : null,
    product.material ? { icon: "catalogue" as const, label: "Material", value: product.material } : null,
  ].filter(Boolean) as { icon: IconName; label: string; value: string; copyable?: boolean }[]

  const description = (product.description || "").trim()
  const isLong = description.length > 220

  return (
    <View style={[styles.root, { backgroundColor: t.surface }]}>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* The gallery. One photo is a plain image; several page horizontally with
            dots and a counter, because a pager with one page reads as broken. */}
        <Animated.View
          style={[
            styles.hero,
            {
              height: heroHeight,
              backgroundColor: t.surfaceInset,
              transform: [{ translateY: heroShift }, { scale: heroScale }],
            },
          ]}
        >
          {images.length > 0 ? (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="View photo full screen"
              onPress={() => {
                feedback.tap()
                setViewer(true)
              }}
            >
              {images.length > 1 ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) =>
                    setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
                  }
                >
                  {images.map((uri) => (
                    <Image
                      key={uri}
                      source={{ uri }}
                      style={{ width, height: heroHeight }}
                      contentFit="cover"
                      transition={140}
                    />
                  ))}
                </ScrollView>
              ) : (
                <Image
                  source={{ uri: images[0] }}
                  style={{ width, height: heroHeight }}
                  contentFit="cover"
                  transition={140}
                />
              )}
            </Pressable>
          ) : (
            <View style={styles.heroEmpty}>
              <Icon name="image" size={44} color={t.textFaint} variant="Bulk" />
              <Text style={[styles.heroEmptyText, { color: t.textTertiary }]}>No photo yet</Text>
            </View>
          )}

          {images.length > 1 && (
            <>
              <View style={styles.counter}>
                <Text style={styles.counterText}>
                  {page + 1}/{images.length}
                </Text>
              </View>
              <View style={styles.dots}>
                {images.map((uri, i) => (
                  <View
                    key={uri}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i === page ? "#FFFFFF" : "rgba(255,255,255,0.45)",
                        width: i === page ? 18 : 6,
                      },
                    ]}
                  />
                ))}
              </View>
            </>
          )}
        </Animated.View>

        <PanelBand />
        <Panel padded>
          <Text style={[styles.name, { color: t.text }]}>{name}</Text>

          <View style={styles.chipLine}>
            <View style={[styles.chip, { backgroundColor: t.iconWell }]}>
              <Icon name="catalogue" size={13} color={t.primary} variant="Bulk" />
              <Text style={[styles.chipText, { color: t.primary }]}>
                {product.category || "Uncategorised"}
              </Text>
            </View>
            {!!product.leadTimeDays && (
              <View style={[styles.chip, { backgroundColor: t.surfaceInset }]}>
                <Icon name="clock" size={13} color={t.textTertiary} variant="Bulk" />
                <Text style={[styles.chipText, { color: t.textSecondary }]}>
                  Ready in {product.leadTimeDays} days
                </Text>
              </View>
            )}
          </View>

          {/* The facts, two to a line: a rep scanning for the HSN finds it by
              position rather than by reading six rows of prose. */}
          <View style={styles.grid}>
            {facts.map((f) => (
              <Pressable
                key={f.label}
                disabled={!f.copyable}
                onLongPress={f.copyable ? () => void copyValue(f.value, f.label) : undefined}
                delayLongPress={320}
                style={({ pressed }) => [
                  styles.cell,
                  { backgroundColor: t.surfaceInset, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={styles.cellHead}>
                  <Icon name={f.icon} size={13} color={t.textTertiary} variant="Bulk" />
                  <Text style={[styles.cellLabel, { color: t.textTertiary }]}>{f.label.toUpperCase()}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.cellValue, { color: t.text }]}>
                  {f.value}
                </Text>
              </Pressable>
            ))}
          </View>
        </Panel>

        {!!description && (
          <Panel title="About this product" padded>
            <View style={styles.about}>
              <Text
                numberOfLines={expanded || !isLong ? undefined : 4}
                style={[textVariants.body, { color: t.textSecondary }]}
              >
                {description}
              </Text>
              {isLong && (
                <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
                  <Text style={[styles.more, { color: t.primary }]}>
                    {expanded ? "Show less" : "Read more"}
                  </Text>
                </Pressable>
              )}
            </View>
          </Panel>
        )}
      </Animated.ScrollView>

      {/* The bar rides OVER the photo: glass while the hero owns the top of the
          screen, filled once the content has reached it. */}
      <View
        style={[styles.bar, { paddingTop: insets.top, height: insets.top + sizes.appBar }]}
        pointerEvents="box-none"
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: t.surface, opacity: barFill }]}
        />
        {/* The divider hairline rides the FILL, not the scroll: over the photo
            the bar is glass and needs no edge, and once it is a white bar over a
            white page the rule is the only thing separating the two. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.barRule, { backgroundColor: t.divider, opacity: barFill }]}
        />
        <GlassButton icon="back" label="Back" onPress={() => navigation.goBack()} filled={barFill} />
        <Animated.Text
          numberOfLines={1}
          style={[styles.barTitle, textVariants.appBarTitleBack, { color: t.text, opacity: barTitleOpacity }]}
        >
          {name}
        </Animated.Text>
        <GlassButton
          icon="edit"
          label="Edit product"
          onPress={() => {
            feedback.tap()
            navigation.navigate("ProductEditor", { id: product.id })
          }}
          filled={barFill}
        />
        <GlassButton icon="share" label="Share product" onPress={() => void share()} filled={barFill} />
        {isAdmin && (
          <GlassButton
            icon="more"
            label="More actions"
            onPress={() => {
              feedback.tap()
              setMenuOpen(true)
            }}
            filled={barFill}
          />
        )}
      </View>

      {/* Price and action on one line, the way a product page ends: what it costs
          is the thing you check immediately before putting it on a quotation. */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: t.surface,
            borderTopColor: t.border,
            paddingBottom: insets.bottom + spacing.sm,
          },
        ]}
      >
        <View style={styles.priceBlock}>
          <Text numberOfLines={1} style={[styles.price, { color: t.text }]}>
            {formatCurrency(price)}
            <Text style={[styles.priceUnit, { color: t.textTertiary }]}> /{unit}</Text>
          </Text>
          <Text numberOfLines={1} style={[styles.priceNote, { color: t.textTertiary }]}>
            {formatCurrency(withTax)} incl. {gstRate}% GST
          </Text>
        </View>
        <Button label="Add to quote" icon="quote" onPress={addToQuotation} />
      </View>

      <PopupMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        top={insets.top + sizes.appBar - 4}
        items={[
          {
            key: "delete",
            label: "Delete product",
            icon: "trash",
            destructive: true,
            onPress: () => {
              setMenuOpen(false)
              setConfirmDelete(true)
            },
          },
        ]}
      />

      <Dialog
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this product?"
        message={`${
          product.name || "This product"
        } is removed from the catalogue for everyone, including the website. Quotations that already list it keep their lines. This cannot be undone.`}
        actions={[
          { label: "Cancel", onPress: () => setConfirmDelete(false) },
          { label: deleting ? "Deleting…" : "Delete", tone: "danger", onPress: () => void remove() },
        ]}
      />

      {/* Full screen, on black: the photo as you hand the phone across a table. */}
      <Modal visible={viewer} transparent animationType="fade" onRequestClose={() => setViewer(false)}>
        <View style={styles.viewer}>
          <StatusBar barStyle="light-content" />
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: page * width, y: 0 }}
            onMomentumScrollEnd={(e) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
            }
          >
            {images.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.viewerImage} contentFit="contain" />
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setViewer(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            style={[styles.viewerClose, { top: insets.top + 8 }]}
          >
            <Icon name="close" size={30} color="#FFFFFF" variant="Bulk" />
          </Pressable>
          {images.length > 1 && (
            <View style={[styles.counter, styles.viewerCounter]}>
              <Text style={styles.counterText}>
                {page + 1}/{images.length}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  )
}

/**
 * A bar button that has to read against a photograph AND against the surface it
 * becomes: a circle of the page's own surface that fades out as the bar fills in
 * behind it. Surface at nine tenths rather than a black scrim, because the glyph
 * is `text` and `text` is only legible against the surface it was picked for.
 */
function GlassButton({
  icon,
  label,
  onPress,
  filled,
}: {
  icon: IconName
  label: string
  onPress: () => void
  filled: Animated.AnimatedInterpolation<number>
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.glass, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.glassFill,
          {
            backgroundColor: t.surface,
            opacity: filled.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
          },
        ]}
      />
      <Icon name={icon} size={22} color={t.text} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },

  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    // 2dp between the trailing action buttons. The flexed title between them
    // absorbs the same gap on its own edges, so nothing else moves.
    gap: 2,
  },
  barTitle: { flex: 1, marginHorizontal: 8 },
  barRule: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  glass: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  glassFill: { borderRadius: 20 },

  hero: { width: "100%", overflow: "hidden" },
  heroEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heroEmptyText: { fontSize: 13, fontFamily: font.medium },
  counter: {
    position: "absolute",
    right: gutter,
    bottom: 22,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  counterText: { color: "#FFFFFF", fontSize: 12, fontFamily: font.medium },
  dots: {
    position: "absolute",
    bottom: 26,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { height: 6, borderRadius: 3 },

  // Full bleed: the body is a stack of panels, each drawing its own 2dp band
  // (ui/Panel.tsx). The gallery above them is edge to edge by design.
  content: { paddingTop: 0 },
  name: { fontSize: 20, lineHeight: 24, fontFamily: font.bold },
  chipLine: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: 12.5, fontFamily: font.medium },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  // Two to a line: half the row minus half the gap.
  cell: { width: "48.5%", borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12 },
  cellHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  cellLabel: { fontSize: 11, letterSpacing: 0.3, fontFamily: font.semibold },
  cellValue: { marginTop: 4, fontSize: 15, lineHeight: 20, fontFamily: font.semibold },

  about: { marginTop: spacing.xl },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.4,
    marginBottom: 6,
    fontFamily: font.semibold,
  },
  more: { marginTop: 6, fontSize: 14, fontFamily: font.semibold },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  priceBlock: { flex: 1, minWidth: 0 },
  price: { fontSize: 22, lineHeight: 28, fontFamily: font.bold },
  priceUnit: { fontSize: 13, fontFamily: font.medium },
  priceNote: { marginTop: 1, fontSize: 12, fontFamily: font.regular },

  viewer: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  viewerImage: { width: Dimensions.get("window").width, height: "100%" },
  viewerClose: { position: "absolute", right: gutter },
  viewerCounter: { bottom: 40 },
})
