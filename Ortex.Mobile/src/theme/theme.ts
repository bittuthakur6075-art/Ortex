/**
 * The palette.
 *
 * STRUCTURE PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\theme\colors.js
 * — the same token vocabulary, the same light/dark strategy, the same rule that
 * depth comes from LAYERED BACKGROUND PLANES and hairlines rather than shadows
 * (the floating tab capsule's `barShadow` is the only shadow in the app).
 *
 * The BRAND is Ortex's, not Capnix's: the primary ramp below is the same
 * Metronic-derived blue `Ortex.Admin/src/index.css` is built on, so a badge or a
 * button reads the same on the phone as in the console. The Ortex logo keeps its
 * own #2F50E4 (see theme/logo.ts) — it is a fixed asset, not a themed one.
 *
 * Dark neutrals are Uber's true-grey scale, with no blue/slate cast, exactly as
 * Capnix does it.
 */

const brand = {
  primary: "#2567E8",
  primaryHover: "#3D78EC",
  primaryPressed: "#004DEA",
  primary50: "#92B3F4",
  primary30: "#BED2F9",
  primary20: "#D3E1FA",
  primary15: "#DEE9FC",
  primary10: "#EAF0FD",
  primary5: "#F4F7FE",
} as const

/** Raw ramp, for the few places that need a fixed colour (the splash, the logo). */
export const palette = {
  ...brand,
  heading: "#071437",
  text1: "#252F4A",
  text2: "#4B5675",
  text3: "#78829D",
  text4: "#99A1B7",
  text5: "#C4CADA",
  white: "#FFFFFF",
} as const

/**
 * Ortex.Admin's status vocabularies (`data/domain/schema.js`) each carry a `tone`
 * drawn from Tailwind's hue names. `toneColors` maps those onto this palette so a
 * "Sent" or "Accepted" badge reads the same on the phone as in the console.
 */
export type StatusTone = "slate" | "blue" | "cyan" | "violet" | "amber" | "emerald" | "rose"
export type ToneColors = { fg: string; bg: string }

export type Colors = {
  // planes
  background: string
  surface: string
  surfaceInset: string
  surfaceRaised: string
  surfacePressed: string
  surfaceTrack: string
  // ink
  text: string
  textStrong: string
  textSecondary: string
  textTertiary: string
  textFaint: string
  textHint: string
  textInverse: string
  textOnPrimary: string
  // brand
  primary: string
  primaryHover: string
  primaryPressed: string
  primary10: string
  primary20: string
  accentTint: string
  accentBorder: string
  iconWell: string
  // rules
  border: string
  borderStrong: string
  divider: string
  // fields
  fieldBg: string
  fieldBgFocused: string
  fieldBorderFocused: string
  fieldCursor: string
  // semantic
  //
  // Each status has THREE tokens, because one colour cannot do both jobs. The
  // bare name (`warning`) is the FILL and the icon: a saturated hue that has to
  // be seen across a room. The `*Text` variant is the same hue pushed until it
  // passes WCAG AA (4.5:1) as body text on its own `*Bg`, because the saturated
  // one does not: #DFA000 on #FFF8E6 is 2.16:1, which is a warning a rep cannot
  // read in sunlight. Text on a tinted well uses `*Text`; a glyph, a rule or a
  // solid fill uses the bare name.
  success: string
  successBg: string
  successText: string
  warning: string
  warningBg: string
  warningText: string
  danger: string
  dangerBg: string
  dangerText: string
  info: string
  infoBg: string
  infoText: string
  muted: string
  mutedBg: string
  // chrome
  tabBar: string
  tabBarBorder: string
  appBar: string
  scrim: string
  shadow: string
  barShadow: string
  skeleton: string
  skeletonHighlight: string
  statusBar: "light" | "dark"
  // status vocabulary
  tones: Record<StatusTone, ToneColors>
}

export type Theme = { dark: boolean; colors: Colors }

// A tone's `fg` is drawn as TEXT on its own `bg` (that is what a StatusBadge is),
// so each one is the readable step of the hue, not the saturated one. The bright
// versions live on `colors.warning` / `.success` / `.danger` for fills and icons.
const lightTones: Record<StatusTone, ToneColors> = {
  slate: { fg: "#4B5675", bg: "#EBEDF3" },
  blue: { fg: "#0355B5", bg: "#E9F3FF" },
  cyan: { fg: brand.primaryPressed, bg: brand.primary10 },
  violet: { fg: brand.primaryPressed, bg: brand.primary20 },
  amber: { fg: "#8A6200", bg: "#FFF8E6" },
  emerald: { fg: "#0B7A2E", bg: "#E8FAEE" },
  rose: { fg: "#C41232", bg: "#FFEAEF" },
}

const darkTones: Record<StatusTone, ToneColors> = {
  slate: { fg: "#AFAFAF", bg: "#1F1F1F" },
  blue: { fg: "#4C9DFF", bg: "#0C2138" },
  cyan: { fg: brand.primary50, bg: "#102A43" },
  violet: { fg: brand.primary50, bg: "#20263F" },
  amber: { fg: "#F6B100", bg: "#2C2405" },
  emerald: { fg: "#17C653", bg: "#0B2B18" },
  rose: { fg: "#FF6B8A", bg: "#331019" },
}

export const lightColors: Colors = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceInset: "#F5F6FA",
  surfaceRaised: "#FFFFFF",
  surfacePressed: "#EBEDF3",
  surfaceTrack: "#F4F6F8",

  text: "#071437",
  textStrong: "#252F4A",
  textSecondary: "#4B5675",
  // Captions, hints, placeholders, panel titles and list subtitles — a large
  // share of the words in the app — so it is held at AA (5.4:1 on white, 5.0:1
  // on the inset plane). The old #78829D was 3.83:1 and lost in daylight.
  textTertiary: "#5E6A85",
  textFaint: "#78829D",
  textHint: "#A1A9BD",
  textInverse: "#FFFFFF",
  textOnPrimary: "#FFFFFF",

  primary: brand.primary,
  primaryHover: brand.primaryHover,
  primaryPressed: brand.primaryPressed,
  primary10: brand.primary10,
  primary20: brand.primary20,
  accentTint: "rgba(37,103,232,0.08)",
  accentBorder: "rgba(37,103,232,0.2)",
  // The round icon well behind a list row's leading glyph.
  iconWell: "rgba(37,103,232,0.1)",

  border: "#EBEDF3",
  borderStrong: "#C4CADA",
  divider: "#F4F6F8",

  fieldBg: "#F9FBFC",
  fieldBgFocused: "#FFFFFF",
  fieldBorderFocused: brand.primary30,
  fieldCursor: "#056EE9",

  success: "#04B440",
  successBg: "#E8FAEE",
  successText: "#0B7A2E",
  warning: "#DFA000",
  warningBg: "#FFF8E6",
  warningText: "#8A6200",
  danger: "#E82646",
  dangerBg: "#FFEAEF",
  dangerText: "#C41232",
  info: "#056EE9",
  infoBg: "#E9F3FF",
  infoText: "#0355B5",
  muted: "#5E6A85",
  mutedBg: "#EBEDF3",

  tabBar: "#FFFFFF",
  tabBarBorder: "#EBEDF3",
  appBar: "#FFFFFF",
  scrim: "rgba(0,0,0,0.45)",
  shadow: "#000000",
  // The only shadow in the app: two layers, contact + ambient, under the floating
  // tab capsule.
  barShadow: "0px 2px 6px rgba(7, 20, 55, 0.10), 0px 12px 28px rgba(7, 20, 55, 0.18)",
  skeleton: "#EBEDF3",
  skeletonHighlight: "#F5F6FA",
  statusBar: "dark",

  tones: lightTones,
}

export const darkColors: Colors = {
  background: "#000000",
  surface: "#000000",
  surfaceInset: "#141414",
  surfaceRaised: "#1F1F1F",
  surfacePressed: "#292929",
  surfaceTrack: "#1A1A1A",

  text: "#FFFFFF",
  textStrong: "#E2E2E2",
  textSecondary: "#AFAFAF",
  // Raised to clear AA on the sheet/dialog plane (#1F1F1F), not just on black:
  // #757575 was 3.58:1 there, and sheets are where the small print lives.
  textTertiary: "#8A8A8A",
  textFaint: "#757575",
  textHint: "#545454",
  textInverse: "#071437",
  textOnPrimary: "#FFFFFF",

  // One notch lighter than the light-mode brand, for legibility on black.
  primary: "#4C86F5",
  primaryHover: "#6699F7",
  primaryPressed: "#2567E8",
  primary10: "#101F38",
  primary20: "#16294A",
  accentTint: "rgba(76,134,245,0.10)",
  accentBorder: "rgba(76,134,245,0.24)",
  iconWell: "rgba(76,134,245,0.12)",

  border: "#333333",
  borderStrong: "#545454",
  divider: "#1F1F1F",

  fieldBg: "#101010",
  fieldBgFocused: "#1F1F1F",
  fieldBorderFocused: "rgba(76,134,245,0.5)",
  fieldCursor: "#6BAEFF",

  // On dark the saturated hues already clear AA on their own wells, so text and
  // fill are the same colour; the pair exists so call sites read identically.
  success: "#17C653",
  successBg: "#0B2B18",
  successText: "#17C653",
  warning: "#F6B100",
  warningBg: "#2C2405",
  warningText: "#F6B100",
  danger: "#F8285A",
  dangerBg: "#331019",
  dangerText: "#FF6B8A",
  info: "#1B84FF",
  infoBg: "#0C2138",
  infoText: "#4C9DFF",
  muted: "#8A8A8A",
  mutedBg: "#1F1F1F",

  tabBar: "#000000",
  tabBarBorder: "#333333",
  appBar: "#000000",
  scrim: "rgba(0,0,0,0.6)",
  shadow: "#000000",
  barShadow: "0px 2px 6px rgba(0, 0, 0, 0.45), 0px 14px 32px rgba(0, 0, 0, 0.65)",
  skeleton: "#1F1F1F",
  skeletonHighlight: "#292929",
  statusBar: "light",

  tones: darkTones,
}

export const lightTheme: Theme = { dark: false, colors: lightColors }
export const darkTheme: Theme = { dark: true, colors: darkColors }
