import React from "react"
import { StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { BRAND, brandFieldSeen, ON_BRAND, ON_BRAND_SOFT } from "@/features/auth/brandField"
import { spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { OrtexWordmark, WORDMARK_RATIO } from "@/ui/OrtexLogo"
import ScreenLoader from "@/ui/ScreenLoader"

/**
 * What shows while the session is being checked.
 *
 * Not the NATIVE splash — that is the flat blue field the OS draws before any JS
 * runs. This holds the gap between "the app has started" and "we know whether
 * you are signed in", so that interval never shows the sign-in screen to someone
 * who already is.
 *
 * THE DESIGN, from the launch screens on Mobbin that age well (Remote, Base, Shop,
 * Satispay, Instagram, Outlook): one flat brand field, the mark dead centre and
 * nothing competing with it, and — where there is anything else — a single quiet
 * line pinned to the bottom naming the product ("from Meta", "Microsoft"). Three
 * layers, in the order the eye meets them:
 *
 *   1. The ORTEX INDUSTRIES wordmark, centred and never animated.
 *   2. A soft glow pooled behind it (`BrandGlow`), breathing slowly.
 *   3. "Ortex Sales" at the foot, naming WHICH Ortex app this is — the wordmark
 *      is the company, and the console and the website share it.
 *
 * ⚠️ THE MARK DOES NOT ANIMATE IN. The native splash has no mark, but the first
 * JS frame does, and fading or scaling it would animate the one thing the eye has
 * already locked onto. The foot line is static for the same reason; only the glow
 * moves, and it is light behind the picture rather than part of it.
 *
 * The loader bar holds back (ScreenLoader shows nothing for its first 400ms), so
 * a warm start is mark → app with no activity drawn at all.
 */

const WORDMARK_HEIGHT = 40

export default function SplashView({ message }: { message?: string }) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // A later brand-field screen in the same launch starts with the glow lit.
  const [arrived] = React.useState(brandFieldSeen)

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />

      <View accessible accessibilityLabel={message ? `Ortex. ${message}` : "Ortex. Loading"}>
        <OrtexWordmark height={WORDMARK_HEIGHT} color={ON_BRAND} />

        {/* Exactly the wordmark's width, so mark and activity read as one lockup.
            Absolute, so a label appearing (or turning into the slow-network line)
            never nudges the wordmark off dead centre. */}
        <View style={styles.loader}>
          <ScreenLoader
            tone="brand"
            fill={false}
            immediate
            width={WORDMARK_HEIGHT * WORDMARK_RATIO}
            label={message}
          />
        </View>
      </View>

      {/* Static, like the mark. On a warm start this screen is up for about half
          a second, so a foot line that waited and then faded in never arrived at
          all; drawn on the first frame, it is simply part of the picture. */}
      <View
        style={[styles.foot, { bottom: insets.bottom + spacing.xxl }]}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.rule} />
        <Text style={styles.product}>ORTEX SALES</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
  loader: {
    position: "absolute",
    top: WORDMARK_HEIGHT + spacing.xxl,
    left: -WORDMARK_HEIGHT * 2,
    right: -WORDMARK_HEIGHT * 2,
    alignItems: "center",
  },
  foot: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  // A short hairline above the product name: it ties the foot line to the field
  // as a caption rather than leaving it floating as stray text.
  rule: {
    width: 24,
    height: 2,
    borderRadius: 1,
    marginBottom: spacing.md,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  product: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 2.4,
    color: ON_BRAND_SOFT,
    includeFontPadding: false,
  },
})
