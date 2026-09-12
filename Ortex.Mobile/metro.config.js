// Expo's Metro config, not the React Native CLI's.
//
// `install-expo-modules` put it here so the expo-* packages resolve their
// platform files the way they expect, and it already includes everything the
// CLI's default config does.
//
// `react-native bundle` still prints "your project's Metro config should extend
// @react-native/metro-config" — it looks for a marker Expo's config does not
// set. The bundle builds correctly for both platforms; the warning is noise.
const { getDefaultConfig } = require("expo/metro-config")

const config = getDefaultConfig(__dirname)

// Keep Metro out of native build output.
//
// Without this, running Metro during a Gradle build crashes it outright:
// CMake creates and deletes scratch directories under
// `node_modules/**/android/.cxx/**/CMakeTmp/` faster than the watcher can keep
// up, and the watch() call on a directory that has just vanished throws
// ENOENT (-4058) and takes the whole bundler down. None of these paths hold
// JavaScript, so there is nothing to gain by watching them either.
// The separators are `[\\/]` because on Windows the watcher matches native
// backslash paths, and `.cxx` is matched anywhere because Gradle puts it under
// `android/app/.cxx`, not `android/.cxx` — the forward-slash-only pattern this
// replaces never matched on this machine and Metro died mid-build.
config.resolver.blockList = [
  /[\\/]\.cxx[\\/].*/,
  /[\\/]android[\\/](app[\\/])?build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
  /[\\/]ios[\\/]build[\\/].*/,
  /[\\/]ios[\\/]Pods[\\/].*/,
]

module.exports = config
