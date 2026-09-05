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

/** @type {import('expo/metro-config').MetroConfig} */
module.exports = getDefaultConfig(__dirname)
