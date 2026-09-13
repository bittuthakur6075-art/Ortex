/**
 * The brand field both pre-app screens stand on: the splash and the lock.
 *
 * ⚠️ THE FIELD MUST MATCH THE NATIVE SPLASH. The OS paints `splash_background`
 * (android/app/src/main/res/values/colors.xml) before any JS runs, and these
 * screens replace it with nothing in between, so any other blue flashes on every
 * cold start. Change one, change both. It ignores the OS theme on purpose — a
 * brand field that turns navy in dark mode is not the brand.
 */
export const BRAND = "#2567E8"
export const ON_BRAND = "#FFFFFF"
/** Secondary words on the field. Held high: white much below this fails AA on #2567E8. */
export const ON_BRAND_SOFT = "rgba(255,255,255,0.86)"

/**
 * Whether a brand-field screen has already been on screen in this process.
 *
 * A cold start shows up to THREE of them back to back — the splash while the
 * session loads, the splash again while the profile loads (a new mount, with a
 * message), then the lock — and each is a fresh component. Without this, every
 * handover replayed the glow's fade-in and the foot line's arrival, which reads
 * as the screen blinking. Only the first one arrives; the rest are already there.
 */
let fieldShown = false
export function brandFieldSeen() {
  const seen = fieldShown
  fieldShown = true
  return seen
}
