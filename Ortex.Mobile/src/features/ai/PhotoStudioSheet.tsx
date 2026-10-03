import { Image } from "expo-image"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { aiEnhancePhoto, type PhotoStyle } from "@/lib/ai"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Button from "@/ui/Button"
import { Chip } from "@/ui/Chips"
import Icon from "@/ui/Icon"
import ImageViewer from "@/ui/ImageViewer"
import Sheet from "@/ui/Sheet"
import { SquircleBackground } from "@/ui/Squircle"
import TextField from "@/ui/TextField"

/**
 * Re-shoot one product photo with AI (the console's `product-image-studio`
 * function, Cloudflare FLUX.2 [klein] 4B).
 *
 * Adding the result as a new photo beside the original is the primary action;
 * replacing the original is the secondary one. The sheet shows the two side by
 * side (tap either to zoom) with a line telling the person to check the logo
 * and lettering. Ortex sells made-to-order goods, and a
 * model that quietly redraws a customer's logo on the sample photo is a wrong
 * order waiting to happen; the side-by-side is where that gets caught.
 */

const STYLES: { key: PhotoStyle; label: string }[] = [
  { key: "studio", label: "White studio" },
  { key: "gradient", label: "Gradient" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "clean", label: "Clean up" },
  { key: "lighting", label: "Fix lighting" },
]

type Props = {
  visible: boolean
  onClose: () => void
  imageUrl: string
  productName?: string
  /** Adds the new photo to the product beside the original. */
  onAdd: (url: string) => void
  /** Replaces the original photo with the enhanced one. */
  onReplace?: (newUrl: string, oldUrl: string) => void
}

export default function PhotoStudioSheet({ visible, onClose, imageUrl, productName, onAdd, onReplace }: Props) {
  const t = useTheme()
  const [style, setStyle] = React.useState<PhotoStyle>("studio")
  const [instruction, setInstruction] = React.useState("")
  const [result, setResult] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // Which tile is open full screen: 0 the original, 1 the new one.
  const [zoom, setZoom] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!visible) return
    setStyle("studio")
    setInstruction("")
    setResult("")
    setError("")
  }, [visible, imageUrl])

  const generate = async () => {
    if (busy) return
    feedback.tap()
    setBusy(true)
    setError("")
    const res = await aiEnhancePhoto({
      imageUrl,
      style,
      instruction: instruction.trim() || undefined,
      productName: productName?.trim() || undefined,
    })
    setBusy(false)
    if (res.error) {
      feedback.error()
      setError(res.error)
      return
    }
    feedback.created()
    setResult(res.image || "")
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Enhance photo">
      <View style={styles.compare}>
        <Tile label="Original" uri={imageUrl} onPress={() => setZoom(0)} />
        <Tile label={busy ? "Working" : "New"} uri={result} busy={busy} onPress={() => setZoom(1)} />
      </View>

      <View style={styles.chips}>
        {STYLES.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            active={style === s.key}
            onPress={() => {
              feedback.select()
              setStyle(s.key)
            }}
          />
        ))}
      </View>

      <TextField
        label="Anything specific?"
        value={instruction}
        onChangeText={setInstruction}
        placeholder="e.g. place it on a wooden desk"
        returnKeyType="done"
      />

      {result ? (
        <View style={styles.note}>
          <SquircleBackground fill={t.warningBg} radius={radius.card} />
          <Icon name="warning" size={16} color={t.warning} variant="Bulk" />
          <Text style={[textVariants.small, styles.noteText, { color: t.warningText }]}>
            Check the logo and text match your product before using this photo.
          </Text>
        </View>
      ) : (
        <Text style={[textVariants.caption, { color: t.textTertiary, marginBottom: spacing.md }]}>
          Takes about 10 to 20 seconds. Your original photo is kept.
        </Text>
      )}

      {error ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <SquircleBackground fill={t.dangerBg} radius={radius.card} />
          <Icon name="warning" size={16} color={t.danger} variant="Bulk" />
          <Text style={[textVariants.small, styles.noteText, { color: t.dangerText }]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {result ? (
          <>
            <Button
              label="Add as new photo"
              icon="add"
              onPress={() => {
                feedback.created()
                onAdd(result)
                onClose()
              }}
              fullWidth
            />
            <View style={styles.buttonRow}>
              {onReplace ? (
                <Button
                  label="Replace original"
                  variant="outline"
                  size="md"
                  onPress={() => {
                    feedback.created()
                    onReplace(result, imageUrl)
                    onClose()
                  }}
                  style={styles.flex}
                />
              ) : null}
              <Button label="Try again" variant="outline" size="md" onPress={() => void generate()} loading={busy} style={styles.flex} />
            </View>
          </>
        ) : (
          <Button
            label={busy ? "Enhancing" : "Generate"}
            icon="assistant"
            onPress={() => void generate()}
            loading={busy}
            fullWidth
          />
        )}
      </View>
      <ImageViewer
        visible={zoom !== null}
        images={zoom === 1 ? [result] : [imageUrl]}
        onClose={() => setZoom(null)}
      />
    </Sheet>
  )
}

function Tile({ label, uri, busy, onPress }: { label: string; uri?: string; busy?: boolean; onPress: () => void }) {
  const t = useTheme()
  return (
    <View style={styles.tileWrap}>
      <Pressable
        onPress={() => {
          feedback.tap()
          onPress()
        }}
        disabled={!uri}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${label} photo. Tap to zoom`}
        style={styles.tile}
      >
        <SquircleBackground fill={t.surfaceInset} stroke={t.border} strokeWidth={1} radius={radius.card} />
        {uri ? (
          // The squircle draws, it does not clip: the photo keeps a plain radius just inside it.
          <Image source={{ uri }} style={styles.tileImage} contentFit="cover" transition={160} accessible={false} />
        ) : (
          <Icon name={busy ? "assistant" : "image"} size={28} color={t.textTertiary} variant="Bulk" />
        )}
      </Pressable>
      <Text style={[textVariants.captionStrong, { color: t.textSecondary, textAlign: "center" }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  compare: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tileWrap: { flex: 1, gap: spacing.xs },
  tile: { aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  tileImage: { width: "100%", height: "100%", borderRadius: radius.card },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noteText: { flex: 1 },
  actions: { gap: spacing.sm, paddingBottom: spacing.sm },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
})
