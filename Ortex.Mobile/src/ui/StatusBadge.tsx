import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import type { StatusOption } from "@/domain/schema"
import { statusMeta } from "@/domain/schema"

/**
 * A status pill drawn from one of the console's status vocabularies
 * (ENQUIRY_STATUS, QUOTATION_STATUS, PRODUCT_STATUS). Each option already
 * carries a `tone`; theme.tones maps those onto this palette, so "Accepted" is
 * the same green on a phone as it is in Ortex.Admin.
 */
export default function StatusBadge({
  list,
  id,
  small,
}: {
  list: StatusOption[]
  id?: string
  small?: boolean
}) {
  const t = useTheme()
  const meta = statusMeta(list, id)
  const { fg, bg } = t.tones[meta.tone]
  return (
    <View style={[styles.pill, small && styles.pillSmall, { backgroundColor: bg }]}>
      <Text style={[styles.label, small && styles.labelSmall, { color: fg }]} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pillSmall: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: font.semibold,
  },
  labelSmall: {
    fontSize: 11,
  },
})
