import React from "react"
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { SquircleBackground } from "@/ui/Squircle"

/**
 * A one-time code as separate boxes, one digit in each.
 *
 * The boxes are only a DRAWING. One real TextInput lies invisibly over the whole
 * row and holds the code, because six inputs break the things a code field most
 * needs: pasting the code from the email, the keyboard's "one-time-code"
 * suggestion, and backspace across boxes. A tap anywhere on the row focuses it.
 *
 * The box the next digit lands in is outlined in the focus colour; an error
 * outlines every box in danger, and outranks focus, exactly as TextField does.
 */

type Props = {
  value: string
  onChangeText: (digits: string) => void
  /** Called once the last digit is typed or pasted, with the full code. */
  onComplete?: (digits: string) => void
  length?: number
  label?: string
  error?: string
  disabled?: boolean
  autoFocus?: boolean
  style?: StyleProp<ViewStyle>
}

export default function OtpField({
  value,
  onChangeText,
  onComplete,
  length = 6,
  label,
  error,
  disabled = false,
  autoFocus = false,
  style,
}: Props) {
  const c = useTheme()
  const inputRef = React.useRef<TextInput>(null)
  const [focused, setFocused] = React.useState(false)
  const digits = value.replace(/[^0-9]/g, "").slice(0, length)
  const active = Math.min(digits.length, length - 1)

  return (
    <View style={style}>
      {label ? (
        <Text style={[textVariants.label, styles.label, { color: c.textStrong }]}>{label}</Text>
      ) : null}

      <Pressable onPress={() => inputRef.current?.focus()} disabled={disabled} style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const filled = i < digits.length
          const current = focused && i === active
          const stroke = error ? c.danger : current ? c.fieldBorderFocused : c.border
          const fill = disabled ? c.mutedBg : current ? c.fieldBgFocused : c.fieldBg
          return (
            <View key={i} style={styles.box}>
              <SquircleBackground
                fill={fill}
                stroke={stroke}
                strokeWidth={current ? 1.5 : 1}
                radius={radius.sm}
              />
              <Text style={[styles.digit, { color: disabled ? c.textTertiary : c.text }]}>
                {filled ? digits[i] : ""}
              </Text>
            </View>
          )
        })}

        <TextInput
          ref={inputRef}
          value={digits}
          onChangeText={(v) => {
            const next = v.replace(/[^0-9]/g, "").slice(0, length)
            onChangeText(next)
            if (next.length === length && digits.length !== length) onComplete?.(next)
          }}
          maxLength={length}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          autoFocus={autoFocus}
          editable={!disabled}
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label ?? "One-time code"}
          accessibilityHint={error || `${length} digits`}
          // Laid over the boxes so a long-press offers Paste right where the code goes.
          style={styles.hiddenInput}
        />
      </Pressable>

      {error ? <Text style={[textVariants.caption, styles.error, { color: c.danger }]}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm },
  box: { flex: 1, height: 56, alignItems: "center", justifyContent: "center" },
  digit: { fontSize: 22, lineHeight: 28, fontFamily: font.semibold },
  hiddenInput: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: "transparent",
    // Near-zero rather than zero: Android stops delivering touches to a fully
    // transparent view on some builds.
    opacity: 0.02,
  },
  error: { marginTop: spacing.xs },
})
