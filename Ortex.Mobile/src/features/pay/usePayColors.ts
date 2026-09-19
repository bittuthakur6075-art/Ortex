import { useTheme } from "@/store/ThemeContext"

/** The three colours every pay chart uses, so a slice means the same thing on every page. */
export function usePayColors() {
  const t = useTheme()
  return { net: t.primary, deductions: t.warning, tds: t.textFaint, track: t.surfaceTrack }
}
