import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { aiWrite, type AiFormat, type AiWriteMode } from "@/lib/ai"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Button from "@/ui/Button"
import { Chip } from "@/ui/Chips"
import Icon from "@/ui/Icon"
import Sheet from "@/ui/Sheet"
import TextField from "@/ui/TextField"

/**
 * "Write with AI" for one field.
 *
 * Opened from the sparkle in a TextField's label row (the `ai` prop), so every
 * form gets the same sheet: pick what to do, optionally say something extra,
 * read the result, then decide. Nothing is written into the field until "Use
 * this" or "Insert below" is pressed, because generated copy is a draft a person
 * approves, never a silent overwrite of what they typed.
 *
 * The rewrite modes need something to rewrite, so on an empty field they are
 * shown but disabled, with a line saying why, rather than hidden: the person
 * learns the tool can shorten or fix their own text once there is some.
 */

const MODES: { key: AiWriteMode; label: string }[] = [
  { key: "write", label: "Write" },
  { key: "improve", label: "Improve" },
  { key: "shorten", label: "Shorten" },
  { key: "expand", label: "Expand" },
  { key: "formal", label: "Formal" },
  { key: "friendly", label: "Friendly" },
  { key: "fix", label: "Fix grammar" },
]

export type AiFieldConfig = {
  /** What the field is, in plain English. */
  purpose: string
  /** Read at the moment of generating, so it carries the form as it is NOW. */
  context?: () => Record<string, unknown>
  format?: AiFormat
  maxChars?: number
}

type Props = AiFieldConfig & {
  visible: boolean
  onClose: () => void
  /** The field's current text. */
  current: string
  onApply: (text: string) => void
}

export default function AiWriterSheet({ visible, onClose, current, onApply, purpose, context, format, maxChars }: Props) {
  const t = useTheme()
  const hasText = current.trim().length > 0
  const [mode, setMode] = React.useState<AiWriteMode>(hasText ? "improve" : "write")
  const [instruction, setInstruction] = React.useState("")
  const [result, setResult] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // A fresh start each time the sheet opens: yesterday's draft for another field
  // is not what someone opening this one wants to see.
  React.useEffect(() => {
    if (!visible) return
    setMode(current.trim() ? "improve" : "write")
    setInstruction("")
    setResult("")
    setError("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const generate = async () => {
    if (busy) return
    if (mode !== "write" && !hasText) return
    feedback.tap()
    setBusy(true)
    setError("")
    const res = await aiWrite({
      purpose,
      mode,
      current,
      instruction: instruction.trim() || undefined,
      context: context?.(),
      format,
      maxChars,
    })
    setBusy(false)
    if (res.error) {
      feedback.error()
      setError(res.error)
      return
    }
    feedback.created()
    setResult(res.text || "")
  }

  const apply = (text: string) => {
    feedback.created()
    onApply(text)
    onClose()
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Write with AI">
      <Text style={[textVariants.small, { color: t.textSecondary, marginBottom: spacing.md }]}>{purpose}</Text>

      <View style={styles.chips}>
        {MODES.map((m) => {
          const disabled = m.key !== "write" && !hasText
          return (
            <View key={m.key} style={{ opacity: disabled ? 0.45 : 1 }}>
              <Chip
                label={m.label}
                active={mode === m.key}
                onPress={
                  disabled
                    ? undefined
                    : () => {
                        feedback.select()
                        setMode(m.key)
                        setResult("")
                      }
                }
              />
            </View>
          )
        })}
      </View>
      {!hasText ? (
        <Text style={[textVariants.caption, { color: t.textTertiary, marginBottom: spacing.md }]}>
          Improve, Shorten and the other rewrites work once the field has some text.
        </Text>
      ) : null}

      <TextField
        label="Anything to add?"
        value={instruction}
        onChangeText={setInstruction}
        placeholder="e.g. mention bulk orders"
        returnKeyType="done"
      />

      {result ? (
        <View style={[styles.result, { backgroundColor: t.surfaceInset, borderColor: t.border }]}>
          <View style={styles.resultHead}>
            <Icon name="assistant" size={16} color={t.primary} variant="Bulk" />
            <Text style={[textVariants.captionStrong, { color: t.textSecondary }]}>Suggestion</Text>
          </View>
          <Text selectable style={[textVariants.body, { color: t.text }]}>
            {result}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.error, { backgroundColor: t.dangerBg }]} accessibilityLiveRegion="polite">
          <Icon name="warning" size={16} color={t.danger} variant="Bulk" />
          <Text style={[textVariants.small, styles.errorText, { color: t.dangerText }]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {result ? (
          <>
            <Button label="Use this" icon="tick" onPress={() => apply(result)} fullWidth />
            <View style={styles.row}>
              <Button
                label="Try again"
                variant="outline"
                size="md"
                onPress={() => void generate()}
                loading={busy}
                style={styles.flex}
              />
              {hasText ? (
                <Button
                  label="Insert below"
                  variant="outline"
                  size="md"
                  onPress={() => apply(`${current.trimEnd()}\n${result}`)}
                  style={styles.flex}
                />
              ) : null}
            </View>
          </>
        ) : (
          <Button
            label={busy ? "Writing" : "Generate"}
            icon="assistant"
            onPress={() => void generate()}
            loading={busy}
            disabled={mode !== "write" && !hasText}
            fullWidth
          />
        )}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  result: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  error: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { flex: 1 },
  actions: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
})
