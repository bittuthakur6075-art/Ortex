// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../../package.json") as { version: string }

/**
 * What the app calls itself.
 *
 * THE VERSION HAS ONE HOME: `version` in package.json. Metro inlines it here,
 * and android/app/build.gradle reads the same field for versionName and derives
 * versionCode from it (1.2.0 → 10200), so the number a rep reads on the Profile
 * page is the number the APK carries. It used to be typed by hand in both
 * places and had drifted (1.1 in the APK, 1.0 on screen). iOS still needs
 * MARKETING_VERSION / CURRENT_PROJECT_VERSION in the Xcode project moved by hand.
 *
 * Bump it with `npm version minor` (or patch/major) from Ortex.Mobile/.
 */
export const APP_VERSION = pkg.version

/** Shown under the version on the Profile page. */
export const APP_CREDIT = "Designed & developed by Ortex Industries"
