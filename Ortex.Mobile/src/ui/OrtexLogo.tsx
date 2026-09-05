import React from "react"
import { SvgXml } from "react-native-svg"

import { ORTEX_SYMBOL_SVG, ORTEX_WORDMARK_SVG, tintSvg } from "@/theme/logo"

// The real brand mark. Rendered as SVG rather than a bitmap so it stays sharp
// on every density and can be tinted white for the splash and lock screens.

const WORDMARK_RATIO = 1305 / 357
const SYMBOL_RATIO = 320 / 340

/** The full "ORTEX" wordmark. Give it a height; the width follows. */
export function OrtexWordmark({ height = 32, color }: { height?: number; color?: string }) {
  const xml = React.useMemo(() => (color ? tintSvg(ORTEX_WORDMARK_SVG, color) : ORTEX_WORDMARK_SVG), [color])
  return <SvgXml xml={xml} width={height * WORDMARK_RATIO} height={height} />
}

/** The symbol on its own, for the splash and lock screens. */
export function OrtexSymbol({ size = 72, color }: { size?: number; color?: string }) {
  const xml = React.useMemo(() => (color ? tintSvg(ORTEX_SYMBOL_SVG, color) : ORTEX_SYMBOL_SVG), [color])
  return <SvgXml xml={xml} width={size * SYMBOL_RATIO} height={size} />
}
