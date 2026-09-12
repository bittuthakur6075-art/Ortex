import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import React from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { GST_RATES, PRODUCT_CATEGORIES, UNITS, newProduct, type Product } from "@/domain/schema"
import { base64Bytes } from "@/lib/avatarUpload"
import { feedback } from "@/lib/feedback"
import { MAX_PHOTO_MB, removeProductImage, uploadProductImage } from "@/lib/productImages"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { border, gutter, radius, size as sizes, spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { Button, Dialog, Icon, IconButton, Panel, Sheet, Spinner, Switch, TextField, useToast } from "@/ui"
import KeyboardAwareScrollView from "@/ui/KeyboardAwareScrollView"

/**
 * Creating and editing a product from the phone.
 *
 * The console stays the richer editor — bulk import, the photo pipeline, cost
 * analysis — but a rep who finds a product missing (or priced wrong) in front of
 * a customer should not have to phone the office. This writes the SAME
 * `products` row shape the console writes, so an edit here is an edit there:
 * `newProduct()` is the mirror of the console's factory, and `repo.update` does
 * the console's own top-level `{...existing, ...patch}` merge, so a field this
 * form does not show (costPrice on a create, say) is never clobbered.
 *
 * Access is the console's too: only a user granted the `products` module gets
 * this tab, and the `staff_products` RLS policy (migration 0007) enforces the
 * same rule on write, so a Sales Executive without it is refused by the database
 * rather than merely by the UI.
 */

type Draft = ReturnType<typeof newProduct>

/** Digits in, number out — an empty field is 0, not NaN. */
/** Roughly the sticky save footer: a 50dp button on 8dp of padding and a rule. */
const FOOTER_RESERVE = 74

const toNumber = (v: string) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export default function ProductEditorScreen({ route, navigation }: StackScreenProps<"ProductEditor">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()

  const editingId = route.params?.id

  const [draft, setDraft] = React.useState<Draft>(() => newProduct())
  const [loading, setLoading] = React.useState(Boolean(editingId))
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [confirmLeave, setConfirmLeave] = React.useState(false)
  const [picker, setPicker] = React.useState<null | "category" | "unit" | "gst">(null)
  const [touched, setTouched] = React.useState<Partial<Record<keyof Draft, boolean>>>({})

  React.useEffect(() => {
    if (!editingId) return
    let alive = true
    void (async () => {
      try {
        const found = await repo.get<Product>("products", editingId)
        // Over the factory, not in place of it: a row written before a field
        // existed still opens with that field's default rather than undefined.
        if (alive && found) {
          setDraft(newProduct(found))
          // An EXISTING product is different: its values were entered long ago, so
          // a bad HSN or a zero MOQ already sitting in the row is worth showing at
          // once rather than waiting for someone to happen to touch that field.
          setTouched({ name: true, hsn: true, moq: true, leadTimeDays: true })
        }
      } catch (e) {
        toast.show({ message: errorMessage(e, "Could not load the product"), tone: "danger" })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [editingId, toast])

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
    // A field counts as touched once it has been typed in. Until then its message
    // stays hidden: a blank NEW product is not a mistake the person has made yet,
    // and a form that opens already scolding them is noise they learn to ignore.
    setTouched((t2) => ({ ...t2, ...Object.fromEntries(Object.keys(patch).map((k) => [k, true])) }))
  }

  const leave = () => {
    if (dirty) {
      setConfirmLeave(true)
      return
    }
    navigation.goBack()
  }

  /**
   * Photos upload as they are picked rather than on save, so the form always
   * holds real URLs and a slow connection blocks the photo instead of the whole
   * record. A picked-then-abandoned photo leaves an object behind; that is a few
   * kilobytes, against a save that could otherwise sit spinning on four uploads.
   */
  const addPhoto = async () => {
    // Asked for explicitly rather than left to the picker: on iOS
    // `launchImageLibraryAsync` returns a plain `canceled` result when the
    // library is denied, which is indistinguishable from the person backing out
    // — the picker appears to open and nothing happens. This turns that into a
    // sentence. Android 13+'s system photo picker grants without a prompt.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      feedback.warn()
      toast.show({
        message: "Ortex needs access to your photos. Allow it in Settings",
        tone: "danger",
      })
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // The picker's own cropper, as on the profile photo. SQUARE on purpose:
      // iOS ignores `aspect` and always crops square when editing, so 1:1 is the
      // only ratio that produces the same photo on both platforms — and a
      // catalogue whose photos are all one shape is the point of cropping at all.
      allowsEditing: true,
      aspect: [1, 1],
      // 0.7, not 0.8: the bucket's own ceiling is 5MB (migration 0010) and a
      // modern phone camera clears that at 0.8 often enough to matter.
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
      const url = await uploadProductImage(asset.base64, asset.mimeType ?? "image/jpeg")
      // Appended off the LIVE draft, not the one this closure captured: two
      // photos added in quick succession would otherwise leave only the second.
      setDraft((d) => ({ ...d, images: [...(d.images || []), url] }))
      setDirty(true)
      feedback.created()
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not upload the photo"), tone: "danger" })
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (url: string) => {
    setDraft((d) => ({ ...d, images: (d.images || []).filter((u) => u !== url) }))
    setDirty(true)
    feedback.deleted()
    // Only ours to delete, and only once it is off the record.
    void removeProductImage(url)
  }

  /**
   * Only the name was required before, so a product could be saved with a 4-digit
   * typo for an HSN or an MOQ of zero — and MOQ is not cosmetic here: the
   * quotation editor's `pickProduct` RAISES a line's quantity to the MOQ, so a
   * zero silently disables that and a wrong one silently overrides what the
   * salesperson typed.
   *
   * A price of zero stays legal: plenty of this catalogue is quoted on request,
   * and the console lists such products at zero rather than blocking them.
   */
  const problems = {
    name: draft.name.trim() ? undefined : "Give the product a name",
    // 4, 6 or 8 digits — the only lengths India's HSN/SAC schedule uses.
    hsn:
      !draft.hsn.trim() || /^(\d{4}|\d{6}|\d{8})$/.test(draft.hsn.trim())
        ? undefined
        : "An HSN code is 4, 6 or 8 digits",
    moq: draft.moq >= 1 ? undefined : "A minimum order is at least 1",
    leadTimeDays: draft.leadTimeDays >= 0 ? undefined : "Lead time cannot be negative",
  }
  const canSave = !Object.values(problems).some(Boolean) && !saving && !uploading

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = { ...draft, name: draft.name.trim(), sku: draft.sku.trim() }
      if (editingId) {
        await repo.update("products", editingId, payload)
      } else {
        await repo.create("products", payload)
      }
      feedback.created()
      toast.show({ message: editingId ? "Product saved" : "Product added", tone: "success" })
      navigation.goBack()
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not save the product"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.background }]}>
        <Spinner label="Loading product" />
      </View>
    )
  }

  const images = draft.images || []

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View
        style={[
          styles.head,
          { paddingTop: insets.top, height: insets.top + sizes.appBar, borderBottomColor: t.divider },
        ]}
      >
        <IconButton name="back" onPress={leave} accessibilityLabel="Back" />
        <Text style={[styles.headTitle, { color: t.text }]}>
          {editingId ? "Edit product" : "New product"}
        </Text>
      </View>

      {/* The form's own scroll view is keyboard-aware: pricing, MOQ and lead time
          sit at the bottom, exactly where the keyboard lands. It replaces a
          `KeyboardAvoidingView` that did nothing here — on Android it was handed
          `behavior={undefined}`, which is a no-op. `bottomOffset` is the sticky
          save footer, which the keyboard height alone does not account for. */}
      <KeyboardAwareScrollView contentContainerStyle={styles.content} bottomOffset={FOOTER_RESERVE}>
        <Panel title="Photos">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRail}
          >
            {images.map((uri) => (
              <View key={uri} style={styles.photo}>
                <Image source={{ uri }} style={styles.photoImage} contentFit="cover" transition={120} />
                <Pressable
                  onPress={() => removePhoto(uri)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  style={[styles.photoRemove, { backgroundColor: t.surface }]}
                >
                  <Icon name="close" size={20} color={t.danger} variant="Bulk" />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => void addPhoto()}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              style={({ pressed }) => [
                styles.photoAdd,
                { borderColor: t.border, opacity: pressed || uploading ? 0.6 : 1 },
              ]}
            >
              {uploading ? (
                <Spinner />
              ) : (
                <>
                  <Icon name="camera" size={24} color={t.primary} variant="Bulk" />
                  <Text style={[styles.photoAddText, { color: t.textSecondary }]}>Add</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
          <Text style={[styles.hint, { color: t.textTertiary }]}>
            The first photo is the one the list and the product page lead with.
          </Text>
        </Panel>

        <Panel title="Details" padded>
          <View style={styles.form}>
            <TextField
              label="Product Name"
              error={touched.name ? problems.name : undefined}
              required
              value={draft.name}
              onChangeText={(v) => set({ name: v })}
              placeholder="Enter product name"
            />
            <PickerRow
              label="Category"
              value={draft.category || "Choose a category"}
              onPress={() => setPicker("category")}
            />
            <View style={styles.row}>
              <View style={styles.half}>
                <TextField
                  label="SKU"
                  value={draft.sku}
                  onChangeText={(v) => set({ sku: v })}
                  placeholder="Enter SKU"
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.half}>
                <TextField
                  label="HSN"
                  value={draft.hsn}
                  onChangeText={(v) => set({ hsn: v })}
                  error={touched.hsn ? problems.hsn : undefined}
                  placeholder="Enter HSN code"
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <TextField
              label="Material"
              value={draft.material}
              onChangeText={(v) => set({ material: v })}
              placeholder="Enter material"
            />
            <TextField
              label="Description"
              value={draft.description}
              onChangeText={(v) => set({ description: v })}
              placeholder="Enter description"
              multiline
              numberOfLines={4}
            />
          </View>
        </Panel>

        <Panel title="Pricing" padded>
          <View style={styles.form}>
            <View style={styles.row}>
              <View style={styles.half}>
                <TextField
                  label="Selling Price"
                  value={draft.basePrice ? String(draft.basePrice) : ""}
                  onChangeText={(v) => set({ basePrice: toNumber(v) })}
                  placeholder="Enter selling price"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.half}>
                <TextField
                  label="Cost Price"
                  value={draft.costPrice ? String(draft.costPrice) : ""}
                  onChangeText={(v) => set({ costPrice: toNumber(v) })}
                  placeholder="Enter cost price"
                  keyboardType="decimal-pad"
                  hint="Never leaves the console"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <PickerRow label="Sold In" value={draft.unit} onPress={() => setPicker("unit")} />
              </View>
              <View style={styles.half}>
                <PickerRow label="GST Rate" value={`${draft.gstRate}%`} onPress={() => setPicker("gst")} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <TextField
                  label="Minimum Order"
                  value={draft.moq ? String(draft.moq) : ""}
                  onChangeText={(v) => set({ moq: toNumber(v) })}
                  error={touched.moq ? problems.moq : undefined}
                  placeholder="Enter minimum order"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.half}>
                <TextField
                  label="Lead Time (Days)"
                  value={draft.leadTimeDays ? String(draft.leadTimeDays) : ""}
                  onChangeText={(v) => set({ leadTimeDays: toNumber(v) })}
                  error={touched.leadTimeDays ? problems.leadTimeDays : undefined}
                  placeholder="Enter lead time in days"
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>
        </Panel>

        <Panel title="Visibility" padded>
          <View style={styles.form}>
            {/* No status control on purpose. A product added from the field is
                active — that is what adding it means — and draft/archived stay
                the console's call, the same rule the Products tab reads by. An
                existing product keeps whatever status it already has: `status`
                rides along in the payload untouched. */}
            <Switch
              value={draft.showOnWebsite !== false}
              onValueChange={(v) => set({ showOnWebsite: v })}
              label="Show on the website"
              description="Listed in the public catalogue on ortex.in"
            />
          </View>
        </Panel>
      </KeyboardAwareScrollView>

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
        <Button
          label={editingId ? "Save changes" : "Add product"}
          onPress={() => void save()}
          loading={saving}
          disabled={!canSave}
          fullWidth
        />
      </View>

      <OptionSheet
        visible={picker === "category"}
        title="Category"
        options={PRODUCT_CATEGORIES}
        value={draft.category}
        onClose={() => setPicker(null)}
        onPick={(v) => {
          set({ category: v })
          setPicker(null)
        }}
      />
      <OptionSheet
        visible={picker === "unit"}
        title="Sold In"
        options={UNITS}
        value={draft.unit}
        onClose={() => setPicker(null)}
        onPick={(v) => {
          set({ unit: v })
          setPicker(null)
        }}
      />
      <OptionSheet
        visible={picker === "gst"}
        title="GST Rate"
        options={GST_RATES.map((r) => `${r}%`)}
        value={`${draft.gstRate}%`}
        onClose={() => setPicker(null)}
        onPick={(v) => {
          set({ gstRate: toNumber(v) })
          setPicker(null)
        }}
      />

      <Dialog
        visible={confirmLeave}
        title="Discard changes?"
        message="Nothing you have typed here has been saved yet."
        onClose={() => setConfirmLeave(false)}
        actions={[
          { label: "Keep editing", onPress: () => setConfirmLeave(false) },
          {
            label: "Discard",
            tone: "danger",
            onPress: () => {
              setConfirmLeave(false)
              navigation.goBack()
            },
          },
        ]}
      />
    </View>
  )
}

/** A field-shaped row that opens a sheet — the app's rule for a short choice list. */
function PickerRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const t = useTheme()
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={() => {
          feedback.tap()
          onPress()
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => [
          styles.pickerRow,
          { backgroundColor: t.fieldBg, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text numberOfLines={1} style={[styles.pickerValue, { color: t.text }]}>
          {value}
        </Text>
        <Icon name="down" size={18} color={t.textTertiary} />
      </Pressable>
    </View>
  )
}

function OptionSheet({
  visible,
  title,
  options,
  value,
  onClose,
  onPick,
}: {
  visible: boolean
  title: string
  options: string[]
  value?: string
  onClose: () => void
  onPick: (value: string) => void
}) {
  const t = useTheme()
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.map((option) => {
        const active = option === value
        return (
          <Pressable
            key={option}
            onPress={() => {
              feedback.select()
              onPick(option)
            }}
            android_ripple={{ color: t.accentTint }}
            style={styles.optionRow}
          >
            <Text
              style={[
                styles.optionLabel,
                { color: t.text, fontFamily: active ? font.semibold : font.regular },
              ]}
            >
              {option}
            </Text>
            {active && <Icon name="tick" size={20} color={t.primary} variant="Bulk" />}
          </Pressable>
        )
      })}
    </Sheet>
  )
}


const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },

  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: border.hairline,
  },
  headTitle: { marginLeft: 4, fontSize: 18, fontFamily: font.semibold, textTransform: "capitalize" },

  // Full bleed: every section is a panel that pads itself and draws its own 2dp
  // band (ui/Panel.tsx). Loose content carries the gutter.
  content: { paddingBottom: spacing.xxl },
  pageBlock: { paddingHorizontal: gutter },
  form: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.sm },
  half: { flex: 1 },
  hint: { fontSize: 12.5, lineHeight: 18, fontFamily: font.regular },
  fieldLabel: { fontSize: 13, marginBottom: 6, fontFamily: font.medium },

  photoRail: { paddingHorizontal: gutter, paddingBottom: gutter, gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: radius.card, overflow: "hidden" },
  photoImage: { width: "100%", height: "100%" },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  photoAdd: {
    width: 96,
    height: 96,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  photoAddText: { fontSize: 12, fontFamily: font.medium },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerValue: { flex: 1, fontSize: 15, fontFamily: font.medium },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  optionLabel: { fontSize: 15.5 },

  footer: {
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
