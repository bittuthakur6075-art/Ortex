import type { TextStyle } from "react-native"

/**
 * Typography.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\theme\typography.js — the
 * same two faces and the same named ramp, so no screen ever sets a raw
 * `fontSize`.
 *
 *   Addington CF — display serif: titles, and every money figure
 *   Inter        — body sans: everything else
 *
 * Custom fonts don't synthesise weights on Android, so every style picks an
 * explicit family instead of a `fontWeight`.
 *
 * ⚠️ The EXTENSIONS differ, and they must. Addington CF is CFF/PostScript-
 * flavoured OpenType (`.otf`); Inter is TrueType (`.ttf`). Renaming a CFF font to
 * `.ttf` is not a cosmetic mislabel: Android's font loader trusts the extension,
 * and the mismatch kills the process at boot — the splash shows, then the app
 * closes, with no JS error because the failure is native. Do not "tidy" these to
 * a uniform extension.
 */
export const fontFamily = {
  display: "AddingtonCF-Regular",
  displayMedium: "AddingtonCF-Medium",
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
} as const

/**
 * The font map expo-font loads at boot. Keys are the family names above, so a
 * missing entry fails at load rather than silently falling back to the system
 * face (which on Android is Roboto and reads visibly wrong against Inter).
 */
export const fontAssets = {
  "AddingtonCF-Regular": require("../assets/fonts/AddingtonCF-Regular.otf"),
  "AddingtonCF-Medium": require("../assets/fonts/AddingtonCF-Medium.otf"),
  "Inter-Regular": require("../assets/fonts/Inter-Regular.ttf"),
  "Inter-Medium": require("../assets/fonts/Inter-Medium.ttf"),
  "Inter-SemiBold": require("../assets/fonts/Inter-SemiBold.ttf"),
  "Inter-Bold": require("../assets/fonts/Inter-Bold.ttf"),
}

/** Tabular, lining figures — money in a column has to line up. */
const LINING_FIGURES: TextStyle["fontVariant"] = ["lining-nums", "tabular-nums"]

export const textVariants = {
  // Display — the brand speaking rather than the product labelling something.
  hero: {
    fontFamily: fontFamily.display,
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.4,
    fontVariant: LINING_FIGURES,
  },
  heroAlt: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.3,
    fontVariant: LINING_FIGURES,
  },

  // The screen title, its deck, and the compact app-bar title.
  largeTitle: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.3,
    fontVariant: LINING_FIGURES,
    // Title Case, set on the ROLE so every screen inherits it and no call site
    // has to remember. `capitalize` lifts only the first letter of each word, so
    // an acronym or a document number passed as a title survives intact.
    textTransform: "capitalize",
  },
  screenSubtitle: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  screenSubtitleStrong: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },
  appBarTitle: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 24,
    fontVariant: LINING_FIGURES,
    textTransform: "capitalize",
  },
  appBarTitleBack: { fontFamily: fontFamily.medium, fontSize: 18, textTransform: "capitalize" },

  // Section / card headings.
  title: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 22,
    lineHeight: 29,
    letterSpacing: -0.2,
    fontVariant: LINING_FIGURES,
  },
  subtitle: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 23 },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 22 },
  cardTitleDisplay: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
    fontVariant: LINING_FIGURES,
  },
  detailTitle: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.2,
    fontVariant: LINING_FIGURES,
  },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22 },

  // All-caps labels: above a value, on a metric tile, over a group of facts.
  fieldLabel: { fontFamily: fontFamily.semibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.2 },
  tileLabel: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  groupLabel: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  sectionLabel: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },

  // Body copy.
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  smallStrong: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },
  captionStrong: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
  segmentedLabel: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },

  // List row.
  listTitle: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20 },
  listSubtitle: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 15 },
  listMeta: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 15 },
  // The figure at the right of a list row. SANS, not the display serif the other
  // money roles use (design call, 2026-09-06): at 18 in a dense row the serif's
  // figures read as decorative beside a sans title, and the two faces a
  // centimetre apart made the row look like two designs. Tabular lining figures
  // are kept, so a column of amounts still aligns digit for digit.
  listAmount: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    lineHeight: 22,
    fontVariant: LINING_FIGURES,
  },

  // The three 10px roles, differing only by weight: a status pill, a count pill,
  // and the caption under a figure.
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 12 },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 10, lineHeight: 12 },
  microLabel: { fontFamily: fontFamily.medium, fontSize: 10, lineHeight: 12 },

  // Figures. Money and counts are set in the SANS, not the display serif: the
  // rupee glyph and the lining figures are drawn far more evenly there, and a
  // column of amounts beside sans labels stops looking like two documents.
  // `LINING_FIGURES` is what actually keeps them aligned; the face only decides
  // how they look.
  stat: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    fontVariant: LINING_FIGURES,
  },
  statLarge: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.6,
    fontVariant: LINING_FIGURES,
  },
  amount: { fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 23, fontVariant: LINING_FIGURES },
  factValue: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
    fontVariant: LINING_FIGURES,
  },
  rowAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: LINING_FIGURES,
  },

  // Controls.
  button: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 21 },
  buttonSm: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 19 },
  buttonXs: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  tab: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, TextStyle>

export type TextVariant = keyof typeof textVariants

/**
 * The old kit referred to weights as `font.regular`, `font.semibold`… Kept as an
 * alias onto the Inter family so those call sites keep working; new code should
 * reach for a named `textVariants` role instead of a bare family + size.
 */
export const font = {
  light: fontFamily.regular,
  regular: fontFamily.regular,
  medium: fontFamily.medium,
  semibold: fontFamily.semibold,
  bold: fontFamily.bold,
  extrabold: fontFamily.bold,
  display: fontFamily.display,
  displayMedium: fontFamily.displayMedium,
} as const
