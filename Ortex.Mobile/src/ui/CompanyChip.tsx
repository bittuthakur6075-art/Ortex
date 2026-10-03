import React from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"

import { useCompany } from "@/store/CompanyContext"
import Badge from "@/ui/Badge"

/**
 * The company a record belongs to (Admin migration 0075), as a small neutral
 * pill. In a list it shows only in the All companies view (`list`); on a record
 * page whenever the person works in more than one company. Nothing at all for
 * someone in one company.
 */
export default function CompanyChip({
  companyId,
  list,
  style,
}: {
  companyId?: string | null
  list?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { multi, choice, nameOf } = useCompany()
  const name = nameOf(companyId)
  if (!multi || !name || (list && choice !== "all")) return null
  return (
    <View style={[styles.wrap, style]} accessibilityLabel={`Company: ${name}`}>
      <Badge tone="neutral" label={name} />
    </View>
  )
}

const styles = StyleSheet.create({ wrap: { alignSelf: "flex-start" } })
