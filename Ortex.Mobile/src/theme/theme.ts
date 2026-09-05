/**
 * Palette from the "Forget it — Mobile App Design" Figma design system
 * (node 3572-13284), the same Metronic-derived ramp Ortex.Admin's `index.css`
 * is built on — #2567E8 primary, #071437 heading, #E82646 error-active.
 * Raw tokens live here; screens consume the Theme below.
 */
export const palette = {
  primary: "#2567E8",
  primary50: "#92B3F4",
  primary30: "#BED2F9",
  primary20: "#D3E1FA",
  primary10: "#EAF0FD",
  primary5: "#F4F7FE",
  primaryPressed: "#004DEA",

  heading: "#071437",
  text1: "#252F4A",
  text2: "#4B5675",
  text3: "#78829D",
  text4: "#99A1B7",
  text5: "#C4CADA",
  white: "#FFFFFF",

  borderDark: "#EBEDF3",
  borderLight: "#F4F6F8",
  bgDark: "#F5F6FA",
  bgLight: "#F9FBFC",

  infoActive: "#056EE9",
  info100: "#1B84FF",
  info20: "#D1E6FF",
  info10: "#E9F3FF",
  info5: "#F3F9FF",

  successActive: "#04B440",
  success100: "#17C653",
  success20: "#D1F4DD",
  success10: "#E8FAEE",
  success5: "#F3FCF6",

  warningActive: "#DFA000",
  warning100: "#F6B100",
  warning20: "#FDEFCC",
  warning10: "#FFF8E6",
  warning5: "#FEFBF2",

  errorActive: "#E82646",
  error100: "#F8285A",
  error20: "#FED4DE",
  error10: "#FFEAEF",
  error5: "#FEF4F6",
} as const

/**
 * Ortex.Admin's status vocabularies (`data/domain/schema.js`) each carry a
 * `tone` drawn from Tailwind's hue names. Map those onto this palette so a
 * "Sent" or "Accepted" badge reads the same on the phone as in the console.
 */
export type StatusTone = "slate" | "blue" | "cyan" | "violet" | "amber" | "emerald" | "rose"

export type ToneColors = { fg: string; bg: string }

export const lightTones: Record<StatusTone, ToneColors> = {
  slate: { fg: palette.text2, bg: palette.bgDark },
  blue: { fg: palette.infoActive, bg: palette.info10 },
  cyan: { fg: palette.primaryPressed, bg: palette.primary10 },
  violet: { fg: palette.primary, bg: palette.primary20 },
  amber: { fg: palette.warningActive, bg: palette.warning10 },
  emerald: { fg: palette.successActive, bg: palette.success10 },
  rose: { fg: palette.errorActive, bg: palette.error10 },
}

export const darkTones: Record<StatusTone, ToneColors> = {
  slate: { fg: "#C9C9C9", bg: "#252525" },
  blue: { fg: palette.info100, bg: "#16283C" },
  cyan: { fg: palette.primary50, bg: "#152A46" },
  violet: { fg: palette.primary50, bg: "#2B2440" },
  amber: { fg: palette.warning100, bg: "#39301A" },
  emerald: { fg: palette.success100, bg: "#17301F" },
  rose: { fg: palette.error100, bg: "#3B1D24" },
}

export type Theme = {
  dark: boolean
  bg: string
  surface: string
  card: string
  cardBorder: string
  headerBg: string
  searchBg: string
  text: string
  textSecondary: string
  textTertiary: string
  accent: string
  accentSoft: string
  accentPressed: string
  divider: string
  danger: string
  warning: string
  success: string
  ripple: string
  fabBg: string
  fabIcon: string
  sheetBg: string
  tones: Record<StatusTone, ToneColors>
}

export const lightTheme: Theme = {
  dark: false,
  bg: palette.white,
  surface: palette.bgLight,
  card: palette.white,
  cardBorder: palette.borderDark,
  headerBg: palette.white,
  searchBg: palette.bgDark,
  text: palette.heading,
  textSecondary: palette.text2,
  textTertiary: palette.text4,
  accent: palette.primary,
  accentSoft: palette.primary10,
  accentPressed: palette.primaryPressed,
  divider: palette.borderDark,
  danger: palette.errorActive,
  warning: palette.warningActive,
  success: palette.successActive,
  ripple: "rgba(37,103,232,0.10)",
  fabBg: palette.primary,
  fabIcon: palette.white,
  sheetBg: palette.white,
  tones: lightTones,
}

/** Dark counterpart in the One UI idiom: true black with neutral greys. */
export const darkTheme: Theme = {
  dark: true,
  bg: "#000000",
  surface: "#121212",
  card: "#1C1C1C",
  cardBorder: "#2A2A2A",
  headerBg: "#000000",
  searchBg: "#1C1C1C",
  text: palette.white,
  textSecondary: "#C9C9C9",
  textTertiary: "#8E8E8E",
  accent: palette.info100,
  accentSoft: "#102A43",
  accentPressed: "#0A6AD1",
  divider: "#252525",
  danger: palette.error100,
  warning: palette.warning100,
  success: palette.success100,
  ripple: "rgba(255,255,255,0.10)",
  fabBg: palette.info100,
  fabIcon: palette.white,
  sheetBg: "#1C1C1C",
  tones: darkTones,
}
