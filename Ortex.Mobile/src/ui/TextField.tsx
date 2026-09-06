import React from "react"
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native"

import { useReportFocus } from "@/hooks/useKeyboardAwareScroll"
import { useTheme } from "@/store/ThemeContext"
import { radius, size as sizes, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import { SquircleBackground } from "@/ui/Squircle"

/**
 * The text field.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\AppInput.jsx.
 *
 * A filled box with a PERMANENT hairline border, 48dp tall, on a 10dp
 * 100%-smoothed corner. The border is always drawn rather than appearing only on
 * focus or error, and the field is sized apart from a button (48 vs 50) — a field
 * is a place to put something and a button is the thing you press, and the design
 * draws that difference rather than levelling it.
 *
 * Focus and error recolour that border rather than summoning it. Precedence:
 * error outranks focus — a field that is both focused and invalid must read as
 * invalid, because the person is looking at it precisely because it is wrong.
 */

type Props = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  leadingIcon?: IconName
  trailingIcon?: IconName
  onTrailingPress?: () => void
  /** Targets the CONTROL. */
  style?: StyleProp<ViewStyle>
  /** Targets the WRAPPER — the label, control and error travel together. */
  fieldStyle?: StyleProp<ViewStyle>
}

export default function TextField({
  label,
  error,
  hint,
  required = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  onTrailingPress,
  multiline = false,
  secureTextEntry = false,
  style,
  fieldStyle,
  ...rest
}: Props) {
  const c = useTheme()
  const [focused, setFocused] = React.useState(false)
  // A password field reveals itself. Built in HERE rather than at each call site
  // so every password in the app gets it and none can forget: the alternative is
  // four screens each wiring their own eye, drifting in icon, size and hit area.
  // Revealing is per-mount and never sticky — a field that remembered would show
  // the password to whoever picks the phone up next.
  const [revealed, setRevealed] = React.useState(false)
  // Null unless an aware scroll view is above this field, which is what makes
  // the lift work when focus moves WITHIN a form rather than only when the
  // keyboard first appears.
  const reportFocus = useReportFocus()
  const isPassword = secureTextEntry && !multiline

  const borderColor = error ? c.danger : focused ? c.fieldBorderFocused : c.border
  // The field lifts from its resting plane to a focused one (rest a half-step
  // above the page, focused pure white in light mode) so the active box reads
  // awake. Disabled keeps the muted plane regardless of focus.
  const fillColor = disabled ? c.mutedBg : focused ? c.fieldBgFocused : c.fieldBg

  return (
    <View style={[{ marginBottom: spacing.md }, fieldStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={[textVariants.label, { color: c.textStrong }]}>{label}</Text>
          {required ? <Text style={[textVariants.label, { color: c.danger, marginLeft: 2 }]}>*</Text> : null}
        </View>
      ) : null}

      <View
        style={[
          styles.control,
          {
            // Fill and border are drawn by SquircleBackground below, on the
            // 100%-smoothed corner. Painting them here as well would put a
            // circular-cornered rectangle behind the squircle and show as a hard
            // edge at each corner.
            minHeight: multiline ? 120 : sizes.field,
            paddingHorizontal: spacing.md,
            alignItems: multiline ? "flex-start" : "center",
            paddingVertical: multiline ? spacing.md : 0,
          },
          style,
        ]}
      >
        <SquircleBackground
          fill={fillColor}
          stroke={borderColor}
          // 1, not 1.5: the border is permanent, so its weight is chrome rather
          // than a state signal that has to announce itself.
          strokeWidth={1}
          radius={radius.sm}
        />

        {leadingIcon ? (
          <View style={{ marginRight: spacing.sm }}>
            <Icon name={leadingIcon} size={20} color={c.textTertiary} />
          </View>
        ) : null}

        <TextInput
          editable={!disabled}
          placeholderTextColor={c.textTertiary}
          // The blinking caret is BLUE by design — the border's soft brand tint
          // frames the field; the cursor carries the typing signal. `cursorColor`
          // is the Android caret; `selectionColor` covers iOS and the selection
          // highlight on both.
          cursorColor={c.fieldCursor}
          selectionColor={c.fieldCursor}
          multiline={multiline}
          secureTextEntry={isPassword && !revealed}
          accessibilityLabel={label}
          accessibilityHint={error || hint || undefined}
          accessibilityState={{ disabled }}
          onFocus={(e) => {
            setFocused(true)
            reportFocus?.()
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            rest.onBlur?.(e)
          }}
          style={[
            styles.input,
            textVariants.body,
            {
              color: disabled ? c.textTertiary : c.text,
              textAlignVertical: multiline ? "top" : "center",
            },
            // A multiline input only spans its CONTENT height, so with a 120dp box
            // a tap below the first line would land on the wrapper and focus
            // nothing. Stretching it makes the whole box the tap target.
            multiline ? { alignSelf: "stretch" } : null,
          ]}
          {...rest}
        />

        {trailingIcon ? (
          <Pressable hitSlop={8} onPress={onTrailingPress} style={{ marginLeft: spacing.sm }}>
            <Icon name={trailingIcon} size={20} color={c.textTertiary} />
          </Pressable>
        ) : isPassword ? (
          <Pressable
            hitSlop={10}
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            // The label states what the TAP DOES, not what the field is showing —
            // a screen reader user needs the outcome, not the status.
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            accessibilityState={{ selected: revealed }}
            style={({ pressed }) => [{ marginLeft: spacing.sm, opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon
              name={revealed ? "hidden" : "preview"}
              size={20}
              color={revealed ? c.primary : c.textTertiary}
              variant={revealed ? "Bulk" : "Linear"}
            />
          </Pressable>
        ) : null}
      </View>

      {error || hint ? (
        <Text
          style={[textVariants.caption, { color: error ? c.danger : c.textTertiary, marginTop: spacing.xs }]}
        >
          {error || hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  control: {
    flexDirection: "row",
    backgroundColor: "transparent",
  },
  input: {
    flex: 1,
    padding: 0,
  },
})
