/**
 * SquircleBackground — Figma's corner smoothing, drawn.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\Squircle.jsx.
 *
 * The designs set **100% corner smoothing** on their controls (Figma's slider,
 * past the ~60% Figma itself labels "iOS"). Neither platform can express that
 * with a border radius:
 *
 *   - `borderRadius` is a circular arc. No smoothing at all.
 *   - `borderCurve: "continuous"` is React Native's one concession, and it is
 *     wrong twice over: it is iOS-only — a silent no-op on Android, which is this
 *     app's whole audience — and Apple's continuous curve is roughly Figma's 60%,
 *     not 100%. Using it would make the two platforms differ AND still miss the
 *     design.
 *
 * So the corner is a PATH. `figma-squircle` is Figma's own algorithm published as
 * a zero-dependency function, so `cornerSmoothing: 1` is the same shape the
 * slider draws at 100%, and `react-native-svg` (already here for the brand mark
 * and every icon) paints it identically on both platforms.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * IT DRAWS, IT DOES NOT CLIP. This is the limitation to know before reaching for
 * it. The squircle is a shape painted BEHIND the content: `overflow: "hidden"`
 * still clips to a rectangle, so it is not a drop-in for anything relying on
 * clipping its children to the rounded corner. It suits a control whose content
 * is text and icons that never reach the corner.
 *
 * It is a BACKGROUND LAYER rather than a wrapper for the same reason: dropping it
 * into an absolute fill leaves the parent's layout, padding and press handling
 * exactly as they were. The parent just stops painting its own background and
 * border.
 * ───────────────────────────────────────────────────────────────────────────────
 *
 *   <Pressable style={{ backgroundColor: "transparent" }}>
 *     <SquircleBackground fill={colors.primary} radius={radius.sm} />
 *     …children…
 *   </Pressable>
 */

import { getSvgPath } from "figma-squircle"
import React from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { Path, Svg } from "react-native-svg"

/**
 * Figma's slider at 100%, the value these controls are drawn at. Deliberately not
 * exported: a file exporting both a component and a plain value breaks React Fast
 * Refresh. A caller wanting less smoothing passes a number — `smoothing={0.6}` is
 * roughly what Figma labels "iOS".
 */
const FIGMA_SMOOTHING_FULL = 1

export type SquircleCorners = {
  topLeft: boolean
  topRight: boolean
  bottomLeft: boolean
  bottomRight: boolean
}

type Props = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  radius?: number
  smoothing?: number
  /** Which corners round; all of them when omitted. A bottom sheet rounds its top
   *  pair only — its bottom edge IS the screen edge. */
  corners?: SquircleCorners
  style?: StyleProp<ViewStyle>
}

export function SquircleBackground({
  fill,
  stroke,
  strokeWidth = 0,
  radius = 0,
  smoothing = FIGMA_SMOOTHING_FULL,
  corners,
  style,
}: Props) {
  // The path is generated from REAL pixel dimensions, so the layer has to be
  // measured before it can draw. Until then it falls back to a plain rounded
  // rectangle — the same fill, border and radius, only without the smoothing — so
  // the first frame is a slightly different corner rather than an unpainted
  // control.
  const [box, setBox] = React.useState<{ width: number; height: number } | null>(null)

  const path = React.useMemo(() => {
    if (!box || box.width <= 0 || box.height <= 0) return null
    // Inset by half the stroke. A stroke is centred on its path, so drawing it on
    // the full box would spill half its width outside the SVG and be cut off at
    // all four edges. Insetting lands the border fully inside the control's
    // bounds, which is also where a CSS border sits.
    return getSvgPath({
      width: Math.max(box.width - strokeWidth, 0),
      height: Math.max(box.height - strokeWidth, 0),
      cornerRadius: radius,
      cornerSmoothing: smoothing,
      ...(corners
        ? {
            topLeftCornerRadius: corners.topLeft ? radius : 0,
            topRightCornerRadius: corners.topRight ? radius : 0,
            bottomLeftCornerRadius: corners.bottomLeft ? radius : 0,
            bottomRightCornerRadius: corners.bottomRight ? radius : 0,
          }
        : null),
    })
  }, [box, radius, smoothing, strokeWidth, corners])

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        // Only re-render when the box actually changed. onLayout fires on every
        // parent re-layout, and a fresh object each time would regenerate the path
        // and repaint on every keystroke in the field this sits behind.
        setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
      }}
      style={[StyleSheet.absoluteFill, style]}
    >
      {path ? (
        <Svg width="100%" height="100%">
          <Path
            d={path}
            translate={[strokeWidth / 2, strokeWidth / 2]}
            fill={fill ?? "none"}
            stroke={stroke}
            strokeWidth={stroke ? strokeWidth : 0}
          />
        </Svg>
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: fill,
              borderRadius: radius,
              borderColor: stroke,
              borderWidth: stroke ? strokeWidth : 0,
            },
            corners
              ? {
                  borderTopLeftRadius: corners.topLeft ? radius : 0,
                  borderTopRightRadius: corners.topRight ? radius : 0,
                  borderBottomLeftRadius: corners.bottomLeft ? radius : 0,
                  borderBottomRightRadius: corners.bottomRight ? radius : 0,
                }
              : null,
          ]}
        />
      )}
    </View>
  )
}
