import React from "react"
import { useWindowDimensions, type StyleProp, type ViewStyle } from "react-native"
import { Defs, RadialGradient, Rect, Stop, Svg } from "react-native-svg"

/**
 * The soft colour wash behind the sign-in screen.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\AuroraBackground.jsx,
 * in the Ortex ramp.
 *
 * The design is a stack of large blurred ellipses under a white veil. React
 * Native has no cross-platform backdrop blur, and several live-blurred layers is
 * a frame-rate problem on a mid-range phone — but a heavily blurred ellipse IS a
 * radial gradient, so the same image is drawn as gradients instead. It costs one
 * SVG and scales to any viewport, which a fixed artboard does not.
 *
 * THE PEAKS ARE STRONGER THAN THE SAMPLED CENTRES, DELIBERATELY. A Figma ellipse
 * holds close to its centre colour across its whole disc before the blur takes
 * over; a radial gradient is at peak only at the centre point and is already well
 * down by mid-radius. Matching the centre pixel therefore lands everything around
 * it below the design, which reads as washed out. The area is the thing to match,
 * not four points.
 */

type Blob = {
  key: string
  color: string
  /** Centre and radius as fractions of the art box, so the wash scales. */
  cx: number
  cy: number
  r: number
  opacity: number
}

/** The sign-in variant: pale, and flooding to the page colour by mid-screen so
 *  the sheet beneath it sits on a plain surface. */
const BLOBS: Blob[] = [
  // Brand blue, upper left.
  { key: "brand", color: "#2567E8", cx: 0.15, cy: 0.2, r: 0.82, opacity: 0.26 },
  // A cooler blue upper right — the strongest note in this variant.
  { key: "info", color: "#1B84FF", cx: 0.88, cy: 0.1, r: 0.78, opacity: 0.3 },
  // A violet-leaning wash low left, to stop the two blues reading as one band.
  { key: "violet", color: "#6C7BE8", cx: 0.05, cy: 0.62, r: 0.7, opacity: 0.18 },
  // A warm note, all but gone — it only keeps the blues from going clinical.
  { key: "warm", color: "#F6B100", cx: 0.72, cy: 0.52, r: 0.55, opacity: 0.07 },
]

export default function AuroraBackground({
  height,
  style,
}: {
  /** The wash region's height; defaults to the window. */
  height?: number
  style?: StyleProp<ViewStyle>
}) {
  const win = useWindowDimensions()
  const w = win.width
  const h = height ?? win.height

  return (
    <Svg width={w} height={h} style={[{ position: "absolute", top: 0, left: 0 }, style]} pointerEvents="none">
      <Defs>
        {BLOBS.map((b) => (
          <RadialGradient
            key={b.key}
            id={`aurora-${b.key}`}
            gradientUnits="userSpaceOnUse"
            cx={b.cx * w}
            cy={b.cy * h}
            r={b.r * w}
          >
            <Stop offset="0" stopColor={b.color} stopOpacity={b.opacity} />
            <Stop offset="1" stopColor={b.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {BLOBS.map((b) => (
        <Rect key={b.key} x={0} y={0} width={w} height={h} fill={`url(#aurora-${b.key})`} />
      ))}
    </Svg>
  )
}
