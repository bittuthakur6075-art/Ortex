import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { PRODUCT_CATEGORIES, newWork, type Category, type Row, type Work } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { base64Bytes } from "@/lib/avatarUpload"
import { feedback } from "@/lib/feedback"
import { MAX_PHOTO_MB, removeProductImage, uploadProductImage } from "@/lib/productImages"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  Dialog,
  Icon,
  OptionSheet,
  Section,
  Spinner,
  Switch,
  TextField,
  useToast,
} from "@/ui"

type Draft = ReturnType<typeof newWork>

/** The folder the console files gallery uploads under, inside the shared bucket. */
const FOLDER = "work"

/**
 * Add or change one photo in the website's /work gallery.
 *
 * The photo is the record — everything else (caption, category, order) exists to
 * place it — so the picker is the first and largest thing on the screen, not a
 * field halfway down a form.
 *
 * Uploads go to the SAME `product-images` bucket the console writes to, under
 * the same `work/` prefix (migration 0010's policies admit any active staff), so
 * a photo added here sits beside the ones the office added and its URL renders
 * on the site with nothing new server-side. The row is `work` (0012), whose RLS
 * asks for the `work` module — which is why the entry point into this screen is
 * hidden from an account that does not have it.
 */
export default function WorkEditorScreen({ route, navigation }: StackScreenProps<"WorkEditor">) {
  const t = useTheme()
  const toast = useToast()
  const editingId = route.params?.id

  const { items: works } = useCollection<Work & Row>("work")
  const { items: categories } = useCollection<Category & Row>("categories")

  const [draft, setDraft] = React.useState<Draft>(() => newWork())
  const [original, setOriginal] = React.useState<(Work & Row) | null>(null)
  const [error, setError] = React.useState("")
  const [uploading, setUploading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [categoryOpen, setCategoryOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  React.useEffect(() => {
    if (!editingId) return
    const found = works.find((w) => w.id === editingId)
    // Over the factory, not in place of it: a row written before a field existed
    // still opens with that field's default rather than undefined.
    if (found && found.id !== original?.id) {
      setOriginal(found)
      setDraft(newWork(found))
    }
  }, [editingId, works, original?.id])

  const set = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setError("")
  }

  // The gallery's own filter buckets are the catalogue's categories, so offer
  // those rather than free text — a typo here makes a one-photo filter on the
  // website. "No category" stays available, because the site treats it as
  // simply unfiltered rather than as a mistake.
  const categoryOptions = React.useMemo(() => {
    const live = categories
      .map((c) => (c.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    const base = live.length ? live : [...PRODUCT_CATEGORIES]
    const current = (draft.category || "").trim()
    const withCurrent = current && !base.includes(current) ? [current, ...base] : base
    return ["No category", ...withCurrent]
  }, [categories, draft.category])

  const pickPhoto = async () => {
    // Asked for explicitly: on iOS a denied library makes launchImageLibraryAsync
    // return a plain `canceled`, indistinguishable from backing out.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      feedback.warn()
      toast.show({ message: "Ortex needs access to your photos. Allow it in Settings", tone: "danger" })
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // SQUARE, like the product and category croppers. Gallery shots went in
      // uncropped at first, on the reasoning that the /work page lays photos out
      // as they were taken — but the gallery grid draws square tiles, so an
      // uncropped photo was centre-cropped by the layout anyway, with nobody
      // choosing which part survived. Cropping here hands that choice to the
      // person who took the photo. (iOS ignores `aspect` and always crops 1:1,
      // so any other ratio would frame the same shot differently per platform.)
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
      // Replacing a photo orphans the old object. Only delete one we uploaded,
      // and only after the new URL is on the draft — and never the one still
      // stored on the saved row, which is only superseded once Save succeeds.
      if (previous && previous !== original?.image) void removeProductImage(previous)
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not upload the photo"), tone: "danger" })
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!draft.image) {
      setError("Add a photo first")
      feedback.warn()
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...draft,
        title: draft.title.trim(),
        category: draft.category.trim(),
        // The site falls back to the title for alt text, but only if alt is
        // empty — so store the trimmed value rather than a stray space.
        alt: draft.alt.trim(),
        sortOrder: Number(draft.sortOrder) || 0,
      }
      if (original) {
        await repo.update("work", original.id, payload)
        // The photo that was on the row is no longer referenced by anything.
        if (original.image && original.image !== payload.image) void removeProductImage(original.image)
        toast.show({ message: "Work photo updated", tone: "success" })
      } else {
        await repo.create<Work & Row>("work", payload)
        toast.show({ message: "Added to the gallery", tone: "success" })
      }
      feedback.created()
      navigation.goBack()
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not save this photo"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!original) return
    setConfirmDelete(false)
    setSaving(true)
    try {
      await repo.remove("work", original.id)
      void removeProductImage(original.image)
      feedback.deleted()
      toast.show({ message: "Removed from the gallery", tone: "success" })
      navigation.goBack()
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not remove this photo"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AppScreen
        title={original ? "Edit work photo" : "Add work photo"}
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        contentStyle={styles.content}
      >
        <Section title="Photo" style={styles.section} bodyStyle={styles.form}>
          <Pressable onPress={() => void pickPhoto()} disabled={uploading}>
            <View style={[styles.photo, { backgroundColor: t.surfaceInset, borderColor: error ? t.dangerText : t.border }]}>
              {draft.image ? (
                <Image source={{ uri: draft.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
              ) : (
                <View style={styles.photoEmpty}>
                  <Icon name="camera" size={28} color={t.textTertiary} variant="Bulk" />
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>Tap to choose a photo</Text>
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
            <Button label="Replace photo" variant="secondary" fullWidth onPress={() => void pickPhoto()} disabled={uploading} />
          )}
          {!!error && <Text style={[textVariants.caption, { color: t.dangerText }]}>{error}</Text>}
        </Section>

        <Section title="What it is" style={styles.section} bodyStyle={styles.form}>
          <TextField
            label="Caption"
            value={draft.title}
            onChangeText={(v) => set({ title: v })}
            placeholder="e.g. Acrylic award trophies for an annual day"
            autoCapitalize="sentences"
          />
          <Pressable onPress={() => setCategoryOpen(true)}>
            <Text style={[textVariants.caption, styles.pickerLabel, { color: t.textSecondary }]}>Category</Text>
            <View style={[styles.picker, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={[styles.pickerValue, { color: draft.category ? t.text : t.textTertiary }]}>
                {draft.category || "No category"}
              </Text>
              <Icon name="down" size={18} color={t.textTertiary} variant="Linear" />
            </View>
          </Pressable>
          <TextField
            label="Alt text"
            value={draft.alt}
            onChangeText={(v) => set({ alt: v })}
            placeholder="Describe the photo for screen readers"
            hint="Left empty, the website uses the caption"
            autoCapitalize="sentences"
          />
        </Section>

        <Section title="On the website" style={styles.section} bodyStyle={styles.form}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={[styles.switchLabel, { color: t.text }]}>Show in the gallery</Text>
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                Off keeps it here but off the public /work page.
              </Text>
            </View>
            <Switch value={draft.active} onValueChange={(v) => set({ active: v })} />
          </View>
          <TextField
            label="Sort order"
            value={String(draft.sortOrder ?? 0)}
            onChangeText={(v) => set({ sortOrder: Number(v.replace(/[^0-9]/g, "")) || 0 })}
            placeholder="0"
            keyboardType="number-pad"
            hint="Lower shows first"
          />
        </Section>

        <View style={styles.pageBlock}>
          <Button
            label={original ? "Save changes" : "Add to gallery"}
            fullWidth
            loading={saving}
            disabled={uploading}
            onPress={() => void save()}
          />
          {original && (
            <Button label="Remove from gallery" variant="danger" fullWidth onPress={() => setConfirmDelete(true)} />
          )}
          <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
            The gallery is public. Anything here can be seen by anyone visiting the website.
          </Text>
        </View>
      </AppScreen>

      <OptionSheet
        visible={categoryOpen}
        title="Category"
        options={categoryOptions}
        value={draft.category || "No category"}
        onClose={() => setCategoryOpen(false)}
        onPick={(v) => {
          set({ category: v === "No category" ? "" : v })
          setCategoryOpen(false)
        }}
      />

      <Dialog
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove this photo?"
        message="It comes off the website gallery and the photo itself is deleted. This cannot be undone."
        actions={[
          { label: "Cancel", onPress: () => setConfirmDelete(false) },
          { label: "Remove", tone: "danger", onPress: () => void remove() },
        ]}
      />
    </>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  section: { marginBottom: 0 },
  form: { paddingHorizontal: gutter, paddingTop: spacing.xs, gap: spacing.sm },

  photo: {
    width: "100%",
    // The shape the cropper produces and the gallery tile draws.
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  photoEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
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
