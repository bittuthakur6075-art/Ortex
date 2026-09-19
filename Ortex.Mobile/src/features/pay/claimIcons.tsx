import React from "react"
import { StyleSheet, View } from "react-native"

// Deep imports, as ui/Icon.tsx does: the barrel re-exports every glyph and Metro
// cannot tree-shake it. These six live here rather than in the shared icon map
// because only a claim needs a fuel pump or a coffee cup.
import Car from "iconsax-react-native/dist/esm/Car"
import Coffee from "iconsax-react-native/dist/esm/Coffee"
import GasStation from "iconsax-react-native/dist/esm/GasStation"
import Health from "iconsax-react-native/dist/esm/Health"
import Mobile from "iconsax-react-native/dist/esm/Mobile"
import Receipt21 from "iconsax-react-native/dist/esm/Receipt21"

import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { radius } from "@/theme/tokens"

/**
 * A claim category's glyph in its tinted well (Zoho's expense rows lead with
 * what the money was spent on). One hue per category so a list of claims can
 * be scanned by kind before it is read; the glyph is the tone's text step,
 * which is readable on its own well in both themes.
 */
const GLYPH: Record<string, typeof Receipt21> = {
  Fuel: GasStation,
  Travel: Car,
  Phone: Mobile,
  Food: Coffee,
  Medical: Health,
}

const TONE: Record<string, StatusTone> = {
  Fuel: "amber",
  Travel: "blue",
  Phone: "violet",
  Food: "emerald",
  Medical: "rose",
}

export function ClaimIconWell({ category, size = 38, active }: { category: string; size?: number; active?: boolean }) {
  const t = useTheme()
  const Glyph = GLYPH[category] || Receipt21
  const tone = t.tones[TONE[category] || "slate"]
  return (
    <View
      style={[
        styles.well,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: active ? t.primary : tone.bg },
      ]}
    >
      <Glyph size={Math.round(size * 0.48)} color={active ? t.textOnPrimary : tone.fg} variant="Bulk" />
    </View>
  )
}

const styles = StyleSheet.create({
  well: { alignItems: "center", justifyContent: "center" },
})
