import { Image } from "expo-image"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import type { Product, Row, Work } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { Sheet, SegmentedControl, Spinner } from "@/ui"

export type PickedPhoto = { url: string; label: string; productId: string | null }

/**
 * A real photo for a post: any photo of an active product, or one from the work
 * gallery. The pick is copied into the post (cropped to its format); the
 * catalogue photo itself is never touched. The port of the console's
 * pages/social/PhotoPicker.jsx.
 */
export default function PhotoPickerSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean
  onClose: () => void
  onPick: (photo: PickedPhoto) => void
}) {
  const t = useTheme()
  const products = useCollection<Product & Row>("products")
  const work = useCollection<Work & Row>("work")
  const [tab, setTab] = React.useState<"products" | "work">("products")

  const photos = React.useMemo<PickedPhoto[]>(() => {
    if (tab === "products") {
      return products.items
        .filter((p) => (p.status || "active") === "active")
        .flatMap((p) => (p.images || []).filter(Boolean).map((url) => ({ url, label: p.name || "Product", productId: p.id })))
    }
    return work.items.filter((w) => w.image).map((w) => ({ url: w.image, label: w.title || "Work photo", productId: null }))
  }, [tab, products.items, work.items])

  const loading = tab === "products" ? products.loading : work.loading

  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a photo">
      <View style={styles.segments}>
        <SegmentedControl
          options={[
            { key: "products", label: "Products" },
            { key: "work", label: "Our work" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : photos.length === 0 ? (
        <Text style={[textVariants.caption, styles.empty, { color: t.textTertiary }]}>
          {tab === "products" ? "No active product has a photo yet." : "The work gallery has no photos yet."}
        </Text>
      ) : (
        <View style={styles.grid}>
          {photos.map((ph, i) => (
            <Pressable
              key={`${ph.url}-${i}`}
              style={styles.cell}
              onPress={() => {
                feedback.select()
                onPick(ph)
              }}
              accessibilityLabel={`Use photo of ${ph.label}`}
            >
              <View style={[styles.tile, { backgroundColor: t.surfaceInset }]}>
                <Image source={{ uri: ph.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={100} />
              </View>
              <Text style={[textVariants.caption, { color: t.textSecondary }]} numberOfLines={1}>
                {ph.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: gutter, marginBottom: spacing.sm },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  empty: { paddingHorizontal: gutter, paddingVertical: spacing.lg, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter - 4, paddingBottom: spacing.md },
  cell: { width: "33.333%", padding: 4, gap: 4 },
  tile: { aspectRatio: 1, borderRadius: radius.sm, overflow: "hidden" },
})
