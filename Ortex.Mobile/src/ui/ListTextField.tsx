import React from "react"
import { Pressable, StyleSheet, Text, View, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native"

import { afterChange, appendClause, toggleBullets, toggleNumbered, type Edit } from "@/domain/listText"
import type { AiFieldConfig } from "@/features/ai/AiWriterSheet"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { radius, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import TextField from "@/ui/TextField"

/**
 * A multi-line field for terms and conditions and notes, with list tools.
 *
 * The text stays PLAIN (domain/listText.ts explains why: it prints on the phone
 * PDF and the console's DocumentSheet as the same characters). What the field
 * adds is behaviour:
 *
 *   · a toolbar under the box: numbered list, bullets, "+ Clause", and Clear;
 *   · Enter on a list line continues it ("3." makes "4."), Enter on an empty
 *     item ends the list, and numbered runs renumber themselves;
 *   · Undo for the toolbar's own edits, so Clear is never a loss;
 *   · a live character count.
 *
 * The cursor is only pushed from here right after a toolbar edit or a list
 * continuation, then handed straight back to the keyboard: holding a controlled
 * `selection` on every keystroke makes Android jump the caret.
 */
export default function ListTextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  numberOfLines = 5,
  maxLength,
  ai,
}: {
  /** "Write with AI" on the box; one item per line unless the caller says otherwise. */
  ai?: AiFieldConfig
  label?: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  hint?: string
  numberOfLines?: number
  maxLength?: number
}) {
  const t = useTheme()
  const selection = React.useRef({ start: value.length, end: value.length })
  const [forced, setForced] = React.useState<{ start: number; end: number } | undefined>(undefined)
  const [history, setHistory] = React.useState<string[]>([])

  const apply = (edit: Edit, { undoable }: { undoable: boolean }) => {
    if (undoable) setHistory((h) => [...h.slice(-19), value])
    onChangeText(edit.text)
    if (edit.cursor >= 0) {
      const at = Math.min(edit.cursor, edit.text.length)
      selection.current = { start: at, end: at }
      setForced({ start: at, end: at })
    }
  }

  const onChange = (next: string) => {
    const edit = afterChange(value, next)
    if (edit) {
      if (edit.cursor >= 0) feedback.select()
      apply(edit, { undoable: false })
    } else onChangeText(next)
  }

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    selection.current = e.nativeEvent.selection
    if (forced) setForced(undefined)
  }

  // Is the line under the caret already a numbered / bulleted item? Lights the
  // matching tool, so the toolbar shows what the line is.
  const lineAtCaret = (() => {
    const at = selection.current.start
    const start = value.lastIndexOf("\n", Math.max(0, at - 1)) + 1
    const end = value.indexOf("\n", at)
    return value.slice(start, end === -1 ? value.length : end)
  })()
  const numbered = /^\s*\d+[.)]\s+/.test(lineAtCaret)
  const bulleted = !numbered && /^\s*[•*-]\s+/.test(lineAtCaret)

  const tool = (key: string, text: string, onPress: () => void, active = false, a11y?: string) => (
    <Pressable
      key={key}
      onPress={() => {
        feedback.select()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? text}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.tool,
        { backgroundColor: active ? t.primary10 : t.surfaceInset, opacity: pressed ? state.pressedOpacity : 1 },
      ]}
    >
      <Text style={[textVariants.smallStrong, { color: active ? t.primary : t.text }]}>{text}</Text>
    </Pressable>
  )

  return (
    <View>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        onSelectionChange={onSelectionChange}
        selection={forced}
        placeholder={placeholder}
        multiline
        numberOfLines={numberOfLines}
        maxLength={maxLength}
        fieldStyle={styles.field}
        textAlignVertical="top"
        ai={ai ? { format: "lines", ...ai } : undefined}
      />

      <View style={styles.toolbar}>
        {tool(
          "num",
          "1.",
          () => apply(toggleNumbered(value, selection.current.start, selection.current.end), { undoable: true }),
          numbered,
          numbered ? "Remove numbering" : "Numbered list",
        )}
        {tool(
          "bul",
          "•",
          () => apply(toggleBullets(value, selection.current.start, selection.current.end), { undoable: true }),
          bulleted,
          bulleted ? "Remove bullets" : "Bulleted list",
        )}
        {tool("clause", "+ Clause", () => apply(appendClause(value), { undoable: true }), false, "Add a numbered clause")}
        <View style={styles.spacer} />
        {history.length > 0 &&
          tool("undo", "Undo", () => {
            const prev = history[history.length - 1]
            setHistory((h) => h.slice(0, -1))
            onChangeText(prev)
            setForced({ start: prev.length, end: prev.length })
          })}
        {value.length > 0 && tool("clear", "Clear", () => apply({ text: "", cursor: 0 }, { undoable: true }), false, "Clear all text")}
      </View>

      <View style={styles.foot}>
        {hint ? (
          <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>{hint}</Text>
        ) : (
          <View style={styles.hint} />
        )}
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>
          {value.length}
          {maxLength ? ` / ${maxLength}` : ""} chars
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // The toolbar sits tight under the box, so the field's own bottom margin goes.
  field: { marginBottom: spacing.sm },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  tool: {
    minWidth: 40,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: { flex: 1 },
  foot: { flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm, marginBottom: spacing.md, gap: spacing.md },
  hint: { flex: 1 },
})
