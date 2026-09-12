import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import {
  GST_RATES,
  newCategory,
  slugifyCategory,
  type Category,
  type Product,
  type Row,
} from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { base64Bytes } from "@/lib/avatarUpload"
import { feedback } from "@/lib/feedback"
import { MAX_PHOTO_MB, removeProductImage, uploadProductImage } from "@/lib/productImages"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, Button, Icon, OptionSheet, Section, Spinner, Switch, TextField, useToast } from "@/ui"

type Draft = ReturnType<typeof newCategory>

/** The folder the console files category uploads under, inside the shared bucket. */
const FOLDER = "categories"

/**
 * Add (or edit) a product category from the phone.
 *
 * A category is two things at once, and that is why it could not stay a
 * console-only job: it is the shelf a product sits on in the website catalogue,
 * AND the default HSN and GST rate every product on that shelf inherits. Since
 * the phone learned to add products, a rep in the field who made something new
 * had to file it under an existing shelf or wait for the office — and the
 * picker itself was a hardcoded list, so a category added in the console last
 * week did not exist here at all.
 *
 * This writes the SAME `categories` row the console writes: `newCategory()` is
 * the mirror of the console's factory, so the website-copy fields (intro, SEO,
 * hero image, sort order) are present with their defaults and stay the
 * console's business — the phone does not pretend to write marketing copy.
 *
 * Access is the database's, not the screen's: `categories` is its own module
 * (`staff_categories`, migration 0007), separate from `products`, so a rep with
 * only Products is refused by RLS. The product editor hides the "New category"
 * entry point for exactly that profile rather than letting them hit the wall.
 */
export default function CategoryEditorScreen({ route, navigation }: StackScreenProps<"CategoryEditor">) {
  const t = useTheme()
  const toast = useToast()
  const editingId = route.params?.id
  const pickFor = route.params?.pickFor

  const { items: categories } = useCollection<Category & Row>("categories")
  const { items: products } = useCollection<Product & Row>("products")

  const [draft, setDraft] = React.useState<Draft>(() => newCategory())
  const [original, setOriginal] = React.useState<(Category & Row) | null>(null)
  const [error, setError] = React.useState("")
  const [gstOpen, setGstOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Over the factory, not in place of it, so a row written before a field
  // existed still opens with that field's default rather than undefined.
  React.useEffect(() => {
    if (!editingId) return
    const found = categories.find((c) => c.id === editingId)
    if (found && found.id !== original?.id) {
      setOriginal(found)
      setDraft(newCategory(found))
    }
  }, [editingId, categories, original?.id])

  const set = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setError("")
  }

  // The card image the website shows for this shelf on /products. Same bucket
  // and same folder the console's ImageField writes to, so a category photo
  // taken on a phone is indistinguishable from one added at a desk.
  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      feedback.warn()
      toast.show({ message: "Ortex needs access to your photos. Allow it in Settings", tone: "danger" })
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // SQUARE, like the product photo cropper. iOS ignores `aspect` and always
      // crops square when editing, so 1:1 is the only ratio that hands back the
      // same photo on both platforms — a 4:3 crop here would have meant an
      // Android category card and an iOS one framed differently from the same
      // shot. The website's card is free to letterbox or fill it.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.base64) {
      feedback.error()
      toast.show({ message: "That photo could not be read. Try another", tone: "danger" })
      return
    }
    if (base64Bytes(asset.base64) > MAX_PHOTO_MB * 1024 * 1024) {
      feedback.warn()
      toast.show({ message: `That photo is over ${MAX_PHOTO_MB}MB. Pick a smaller one`, tone: "danger" })
      return
    }

    setUploading(true)
    try {
      const url = await uploadProductImage(asset.base64, asset.mimeType ?? "image/jpeg", FOLDER)
      const previous = draft.image
      set({ image: url })
      feedback.created()
      // Only ours to delete, and never the one still on the saved row: that is
      // superseded only once Save succeeds.
      if (previous && previous !== original?.image) void removeProductImage(previous)
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not upload the photo"), tone: "danger" })
    } finally {
      setUploading(false)
    }
  }

  const clearImage = () => {
    const previous = draft.image
    set({ image: "" })
    feedback.deleted()
    if (previous && previous !== original?.image) void removeProductImage(previous)
  }

  const name = draft.name.trim()
  // Products carry their category by NAME, so two categories with the same name
  // are indistinguishable to every product, filter and price default in both
  // apps. Checked before the write rather than left to a constraint the table
  // does not have.
  const duplicate = React.useMemo(
    () =>
      categories.some(
        (c) => c.id !== editingId && (c.name || "").trim().toLowerCase() === name.toLowerCase() && name.length > 0,
      ),
    [categories, editingId, name],
  )
  const usage = React.useMemo(
    () => (original ? products.filter((p) => p.category === original.name).length : 0),
    [products, original],
  )

  const save = async () => {
    if (!name) {
      setError("Name is required")
      feedback.warn()
      return
    }
    if (duplicate) {
      setError("A category with this name already exists")
      feedback.warn()
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...draft,
        name,
        gstRate: Number(draft.gstRate) || 0,
        sortOrder: Number(draft.sortOrder) || 0,
        // The console derives the slug when it is left blank; do the same here
        // rather than saving an empty one and having the website fall back to a
        // URL nobody chose.
        slug: (draft.slug || "").trim() || slugifyCategory(name),
      }

      if (original) {
        await repo.update("categories", original.id, payload)
        if (original.image && original.image !== payload.image) void removeProductImage(original.image)
        // A rename orphans every product still on the old name — they drop out
        // of the category filter and the product count, and the website shelf
        // empties. The console moves them across; so does this.
        if (name !== original.name) {
          const orphans = products.filter((p) => p.category === original.name)
          await Promise.all(orphans.map((p) => repo.update("products", p.id, { category: name })))
          toast.show({
            message: orphans.length
              ? `Category renamed · ${orphans.length} product${orphans.length === 1 ? "" : "s"} moved`
              : "Category renamed",
            tone: "success",
          })
        } else {
          toast.show({ message: "Category updated", tone: "success" })
        }
      } else {
        await repo.create<Category & Row>("categories", payload)
        toast.show({ message: "Category added", tone: "success" })
      }
      feedback.created()

      // Hand the name back to whoever sent us here, so the product being typed
      // is filed under the category that was just created. merge: true updates
      // that screen's params without rebuilding it, which would lose the draft.
      if (pickFor === "ProductEditor") {
        navigation.navigate({ name: "ProductEditor", params: { presetCategory: name }, merge: true })
      } else {
        navigation.goBack()
      }
    } catch (e) {
      feedback.error()
      toast.show({ message: (e as Error)?.message || "Could not save this category", tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AppScreen
        title={original ? "Edit category" : "New category"}
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        contentStyle={styles.content}
      >
        <Section title="Photo" style={styles.section} bodyStyle={styles.form}>
          <Pressable onPress={() => void pickImage()} disabled={uploading}>
            <View style={[styles.photo, { backgroundColor: t.surfaceInset, borderColor: t.border }]}>
              {draft.image ? (
                <Image source={{ uri: draft.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
              ) : (
                <View style={styles.photoEmpty}>
                  <Icon name="camera" size={26} color={t.textTertiary} variant="Bulk" />
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                    Tap to choose the card image
                  </Text>
                </View>
              )}
              {uploading && (
                <View style={[StyleSheet.absoluteFill as object, styles.uploading, { backgroundColor: t.scrim }]}>
                  <Spinner />
                </View>
              )}
            </View>
          </Pressable>
          {!!draft.image && (
            <View style={styles.photoActions}>
              <Button label="Replace" variant="secondary" onPress={() => void pickImage()} disabled={uploading} />
              <Button label="Remove" variant="ghost" onPress={clearImage} disabled={uploading} />
            </View>
          )}
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            Shown on the website's /products page as this shelf's card. Optional.
          </Text>
        </Section>

        <Section title="Identity" style={styles.section} bodyStyle={styles.form}>
          <TextField
            label="Category name"
            required
            value={draft.name}
            onChangeText={(v) => set({ name: v })}
            placeholder="e.g. Acrylic products"
            autoCapitalize="sentences"
            error={error || undefined}
            autoFocus={!original}
          />
          <TextField
            label="Description"
            value={draft.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="What belongs on this shelf"
            multiline
            numberOfLines={3}
          />
          {/* The slug is shown, not asked for: it is derived, and the only
              reason to surface it is so nobody is surprised by the URL the
              website will use. */}
          <View style={[styles.slug, { backgroundColor: t.surfaceInset, borderRadius: radius.sm }]}>
            <Icon name="catalogue" size={16} color={t.textTertiary} variant="Linear" />
            <Text style={[textVariants.caption, { color: t.textSecondary }]}>
              /products/{(draft.slug || "").trim() || slugifyCategory(name) || "…"}
            </Text>
          </View>
        </Section>

        <Section
          title="Tax defaults"
          style={styles.section}
          bodyStyle={styles.form}
        >
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            Copied onto every new product in this category.
          </Text>
          <TextField
            label="Default HSN"
            value={draft.hsn}
            onChangeText={(v) => set({ hsn: v })}
            placeholder="Enter default HSN"
            keyboardType="number-pad"
          />
          <Pressable onPress={() => setGstOpen(true)}>
            <Text style={[textVariants.caption, styles.pickerLabel, { color: t.textSecondary }]}>Default GST</Text>
            <View style={[styles.picker, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={[styles.pickerValue, { color: t.text }]}>{draft.gstRate}%</Text>
              <Icon name="down" size={18} color={t.textTertiary} variant="Linear" />
            </View>
          </Pressable>
        </Section>

        <Section title="Website" style={styles.section} bodyStyle={styles.form}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={[styles.switchLabel, { color: t.text }]}>Show on website</Text>
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                Off keeps the shelf out of the public catalogue. Its products stay quotable.
              </Text>
            </View>
            <Switch value={draft.active} onValueChange={(v) => set({ active: v })} />
          </View>
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            The heading, intro paragraph and SEO text for this category page are written in the console.
          </Text>
        </Section>

        <View style={styles.pageBlock}>
          <Button
            label={original ? "Save changes" : "Add category"}
            fullWidth
            loading={saving}
            onPress={() => void save()}
          />
          <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
            {original && usage > 0
              ? `${usage} product${usage === 1 ? "" : "s"} use this category. Renaming it moves them all.`
              : "This adds a shelf to the shared catalogue, so the console, the website and everyone else's phone see it too."}
          </Text>
        </View>
      </AppScreen>

      <OptionSheet
        visible={gstOpen}
        title="Default GST"
        options={GST_RATES.map((r) => `${r}%`)}
        value={`${draft.gstRate}%`}
        onClose={() => setGstOpen(false)}
        onPick={(v) => {
          set({ gstRate: Number(v.replace("%", "")) })
          setGstOpen(false)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  section: { marginBottom: 0 },
  form: { paddingHorizontal: gutter, paddingTop: spacing.xs, gap: spacing.sm },

  slug: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },

  photo: {
    width: "100%",
    // Matches the 1:1 crop above: a preview in a different shape than the
    // cropper is a preview of something that does not exist.
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  photoEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  photoActions: { flexDirection: "row", gap: spacing.sm },
  uploading: { alignItems: "center", justifyContent: "center" },

  pickerLabel: { marginBottom: 6 },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerValue: { flex: 1, fontSize: 15, fontFamily: font.medium },

  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 15, fontFamily: font.medium },

  pageBlock: { paddingHorizontal: gutter, paddingTop: spacing.lg, gap: spacing.sm },
  hint: { textAlign: "center" },
})
