/**
 * Geometry, rhythm and motion tokens.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\theme\tokens.js — the
 * values are that app's verbatim. It wears a One UI 8.5 shell: One UI's spacing
 * rhythm and bottom-weighted reachable controls, with the product's own brand
 * inside it. Here the brand is Ortex blue and Zalando Sans instead of Capnix's
 * vermilion and Addington/Inter, but every measurement below is Capnix's.
 *
 * Nothing in the app hardcodes a pixel value: every screen and primitive reads
 * from here, so a rhythm change is one edit rather than a sweep.
 */

/**
 * 4dp base grid. One UI leans generous: the gap between two stacked cards is `md`
 * (16). Anything tighter than `xs` is a mistake at phone scale.
 */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
} as const

/**
 * THE PAGE GUTTER. One number, 20dp, and every horizontal inset in the app is
 * this or derived from it — page margins, panel padding, row padding, the app
 * bar's slots.
 *
 * It was 16 (Capnix's value) until 2026-09-06, when the design moved to 20 for
 * every page and every section. Because nothing hardcodes an inset, this single
 * line is the whole change: a screen that looked right before still lines up,
 * because its title, its rows and its fields all read from here.
 *
 * It is a named token rather than `spacing.md` even though the two are equal
 * today, because they answer different questions: `md` is a step on the 4dp
 * rhythm and is free to move if the rhythm ever changes, while this is the app's
 * left and right edge and must move only when someone decides to move the edge.
 * A screen reaching for `spacing.lg` to inset something horizontally is the bug
 * this replaces.
 */
export const gutter = 20

/**
 * Containers are rounded, sheets more so, and interactive pills are fully round.
 * `card` is the value most surfaces want.
 *
 * `card` is 12, NOT One UI's 26. One UI rounds a content card very hard, and 26
 * actively breaks the grouped-row pattern: a group is one container whose rows
 * are separated by 2px gutters, and at 26 the corner swallows the gutter and the
 * group reads as a stack of lozenges rather than one object. Changing this is a
 * design decision, not a tidy-up.
 */
export const radius = {
  none: 0,
  xs: 6,
  sm: 10,
  card: 12,
  md: 16,
  lg: 20,
  xl: 24,
  sheet: 16,
  pill: 999,
  // Button corners, by Button's size name — the corner steps down with the height
  // so the smallest button does not read as a pill. Named per size (like
  // size.button*) so a change to the shared scale above cannot silently reshape
  // buttons, and vice versa.
  buttonLg: 10,
  buttonMd: 8,
  buttonSm: 6,
} as const

/**
 * Control heights. One UI targets are large and finger-first, and nothing
 * interactive is ever below 44 (the minimum touch target).
 */
export const size = {
  control: 56,
  buttonLg: 50,
  // Kept equal to `field` BY HAND: `md` is the "sits beside a field" button size,
  // and the pair reads flush only while the two agree.
  buttonMd: 48,
  buttonSm: 30,
  // THE FORM FIELD's height, deliberately NOT `control`. A field is a place to put
  // something and a button is the thing you press; the design draws that
  // difference rather than levelling it.
  field: 48,
  search: 48,
  touchMin: 44,
  // The floating tab capsule.
  tabBar: 74,
  appBar: 56,
  largeTitle: 116,
  avatar: 40,
  avatarLg: 88,
  icon: 24,
  iconSm: 20,
  iconXs: 16,
} as const

/**
 * Motion is quick and gently decelerating — it never bounces. Durations are short
 * because the gesture, not the animation, is meant to feel like the subject.
 */
export const motion = {
  fast: 150,
  normal: 250,
  slow: 350,
  easeOut: [0.16, 1, 0.3, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,
} as const

/** Hairline rules. Dividers are inset from the leading edge, never full-bleed. */
export const border = {
  hairline: 1,
  thick: 2,
  dividerInset: spacing.lg,
} as const

/** Opacity used for pressed / disabled states across every pressable. */
export const state = {
  pressedOpacity: 0.7,
  disabledOpacity: 0.4,
} as const

/**
 * THE APP DRAWS NO SHADOWS. Depth is expressed by LAYERING background tones and
 * hairline borders, never by dropping a shadow — the one exception is the
 * floating tab capsule, whose two-layer shadow lives in the palette as
 * `barShadow` because it is the only one.
 *
 * Kept as a function returning `{}` so the intent stays greppable and call sites
 * keep working. A surface that needs an edge takes a hairline or a background
 * step. Restoring a ramp is a design decision, not a tidy-up.
 */
export function elevation(): Record<string, never> {
  return {}
}
