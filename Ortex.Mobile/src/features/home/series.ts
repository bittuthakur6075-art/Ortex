import { useIsDark, useTheme } from "@/store/ThemeContext"
import type { Colors } from "@/theme/theme"

/** Quotation status fills: saturated bare tokens, never the `*Text` steps, and always a label beside them. */
export function statusFill(t: Colors, id: string): string {
  switch (id) {
    case "sent":
      return t.primary
    case "accepted":
      return t.success
    case "invoiced":
      return t.successText
    case "rejected":
      return t.danger
    case "expired":
      return t.warning
    default:
      return t.textHint
  }
}

/**
 * The Home tab's two categorical slots: website leads and Anu's calls. The pair
 * was run through the dataviz palette validator (lightness band, chroma, CVD and
 * normal-vision separation, contrast on the surface) in both modes, change a
 * value and re-run it rather than judging by eye.
 */
export function useSeries() {
  const dark = useIsDark()
  const t = useTheme()
  return {
    web: t.primary,
    voice: dark ? "#D95926" : "#EB6834",
  }
}
