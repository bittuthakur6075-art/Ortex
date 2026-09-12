import { Image } from "expo-image"
import React from "react"
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native"

import { type Row, type Work } from "@/domain/schema"
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
  FactRow,
  Icon,
  IconButton,
  ImageViewer,
  Panel,
  PanelBand,
  RecordActivityPanel,
  Section,
} from "@/ui"

/**
 * One photo in the website's work gallery.
 *
 * The record IS the photograph, so the photograph gets the page: full-bleed at
 * the top, and a tap opens it full-screen on black, because the thing a rep
 * actually does with a work photo is hold the phone up and show it to somebody.
 * Everything else — the caption the site prints under it, the alt text a screen
 * reader will read, where it sits in the gallery — is a fact below.
 *
 * Like the category page, this exists so that LOOKING at a gallery item no
 * longer means opening its editor.
 */
export default function WorkDetailScreen({ route, navigation }: StackScreenProps<"WorkDetail">) {
  const t = useTheme()
  const { items, loading } = useCollection<Work & Row>("work")
  const [viewer, setViewer] = React.useState(false)

  const photo = items.find((w) => w.id === route.params.id)

  const width = Dimensions.get("window").width
  const heroHeight = Math.round(width * 0.75)

  if (!photo && loading) {
    return <DetailSkeleton onBack={() => navigation.goBack()} hero={heroHeight} panels={[3, 2]} />
  }

  if (!photo) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.surface }]}>
        <Text style={[textVariants.body, { color: t.textSecondary }]}>
          This photo is no longer in the gallery.
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const caption = (photo.title || "").trim()
  const hidden = photo.active === false

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <AppScreen
        title={caption || "Work photo"}
        back
        onBack={() => navigation.goBack()}
        headerRight={
          <IconButton
            name="edit"
            onPress={() => {
              feedback.tap()
              navigation.navigate("WorkEditor", { id: photo.id })
            }}
            accessibilityLabel="Edit photo"
          />
        }
      >
        <View style={[styles.hero, { height: heroHeight, backgroundColor: t.surfaceInset }]}>
          {photo.image ? (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="View photo full screen"
              onPress={() => {
                feedback.tap()
                setViewer(true)
              }}
            >
              <Image
                source={{ uri: photo.image }}
                style={{ width, height: heroHeight }}
                contentFit="cover"
                transition={140}
              />
            </Pressable>
          ) : (
            <View style={styles.heroEmpty}>
              <Icon name="image" size={44} color={t.textFaint} variant="Bulk" />
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>No photo yet</Text>
            </View>
          )}
        </View>
        <PanelBand />

        <Panel padded style={styles.headPanel}>
          <View style={styles.chipLine}>
            <View style={[styles.chip, { backgroundColor: t.iconWell }]}>
              <Icon name="catalogue" size={13} color={t.primary} variant="Bulk" />
              <Text style={[styles.chipText, { color: t.primary }]}>
                {photo.category || "No category"}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: hidden ? t.warningBg : t.successBg }]}>
              <Icon
                name={hidden ? "hidden" : "tick"}
                size={13}
                color={hidden ? t.warningText : t.successText}
                variant="Bulk"
              />
              <Text style={[styles.chipText, { color: hidden ? t.warningText : t.successText }]}>
                {hidden ? "Hidden from gallery" : "Live on the website"}
              </Text>
            </View>
          </View>

          {/* The caption is what the SITE prints under the photo, so it is shown
              at the size it is read, not as a form label and value. */}
          <Text style={[styles.caption, { color: caption ? t.text : t.textTertiary }]}>
            {caption || "No caption yet. The website shows this photo without one."}
          </Text>
        </Panel>

        <Section title="Gallery">
          <FactRow icon="catalogue" label="Category" value={photo.category || null} />
          <FactRow icon="sort" label="Gallery order" value={String(photo.sortOrder ?? 0)} />
          {/* Alt text is not decoration: it is what a screen reader says, and
              what Google reads. A blank one is worth showing as blank. */}
          <FactRow icon="preview" label="Alt text" value={photo.alt || null} />
        </Section>

        <RecordActivityPanel collection="work" record={photo} />
      </AppScreen>

      {/* Across a table the photo is the whole point and the chrome is in the
          way, so it opens on black. Shared with the product and category pages
          (ui/ImageViewer.tsx). */}
      <ImageViewer
        visible={viewer}
        images={photo.image ? [photo.image] : []}
        onClose={() => setViewer(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center", paddingHorizontal: gutter },
  // See CategoryDetailScreen: `Panel padded` carries no top padding, because it
  // assumes a titled head above it.
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
  caption: { ...textVariants.body, marginTop: spacing.md },
})
