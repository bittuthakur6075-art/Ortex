import React from "react"
import { Pressable, StyleSheet, Text } from "react-native"

import { feedback } from "@/lib/feedback"
import { useCompany } from "@/store/CompanyContext"
import { useTheme } from "@/store/ThemeContext"
import { radius } from "@/theme/tokens"
import { font } from "@/theme/typography"
import Icon from "@/ui/Icon"
import { CardRow } from "@/ui/OneUi"
import OptionSheet from "@/ui/OptionSheet"

// Which company the lists show (store/CompanyContext.tsx, Admin migration 0075).
// Home's app bar carries the company's name as a pill, Profile a row; both open
// the same sheet. Neither exists for someone in one company.

const ALL = "All companies"

function useSwitcher() {
  const company = useCompany()
  const [open, setOpen] = React.useState(false)
  const label = company.choice === "all" ? ALL : company.nameOf(company.choice)
  const sheet = (
    <OptionSheet
      visible={open}
      title="Company"
      options={[...(company.canAll ? [ALL] : []), ...company.companies.map((c) => c.name)]}
      value={label}
      onClose={() => setOpen(false)}
      onPick={(name) => {
        const picked = name === ALL ? "all" : company.companies.find((c) => c.name === name)?.id
        if (picked) company.setChoice(picked)
        setOpen(false)
      }}
    />
  )
  const show = () => {
    feedback.tap()
    setOpen(true)
  }
  return { multi: company.multi, label, sheet, show }
}

/** The company's name in an app bar, as a pill that opens the switcher. */
export function CompanyBarButton() {
  const t = useTheme()
  const { multi, label, sheet, show } = useSwitcher()
  if (!multi) return null
  return (
    <>
      <Pressable
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`Company: ${label}. Change`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon name="company" size={13} color={t.primary} />
        <Text numberOfLines={1} style={[styles.pillText, { color: t.text }]}>
          {label}
        </Text>
        <Icon name="down" size={12} color={t.textSecondary} />
      </Pressable>
      {sheet}
    </>
  )
}

/** The same switcher as a Profile row. */
export function CompanyRow() {
  const { multi, label, sheet, show } = useSwitcher()
  if (!multi) return null
  return (
    <>
      <CardRow icon="company" title="Company" subtitle={label} onPress={show} />
      {sheet}
    </>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 150,
    height: 32,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: { fontSize: 12.5, fontFamily: font.semibold, flexShrink: 1 },
})
