/**
 * What the app calls itself.
 *
 * The version is written here rather than read from the installed package,
 * because reading the real `versionName` needs a native module (expo-constants
 * or react-native-device-info) and neither is installed — adding one costs a
 * native rebuild for a line of text.
 *
 * THE COST OF THAT: this string does not update itself. On a release it has to
 * move in step with `android/app/build.gradle` (versionName + versionCode) and
 * `ios/Ortex/Info.plist` (CFBundleShortVersionString). If the three ever
 * disagree, the phone screen is the one that is lying.
 */
export const APP_VERSION = "1.0"

/** Shown under the version on the Profile page. */
export const APP_CREDIT = "Designed & developed by Ortex Industries"
