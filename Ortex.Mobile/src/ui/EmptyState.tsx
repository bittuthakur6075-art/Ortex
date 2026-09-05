import React, { memo } from "react"
import { StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Button from "@/ui/Button"
import Icon, { type IconName } from "@/ui/Icon"

type Props = {
  icon: IconName
  title: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}

/**
 * Empty list placeholder, matching NotesListScreen's ListEmptyComponent.
 * Usage: `<EmptyState icon="note" title="No notes yet" hint="Tap + to create your first note." />`
 */
function EmptyState({ icon, title, hint, actionLabel, onAction }: Props) {
  const t = useTheme()

  return (
    <View style={styles.box}>
      <Icon name={icon} size={54} color={t.textTertiary} />
      <Text style={[styles.title, { color: t.textSecondary }]}>{title}</Text>
      {!!hint && <Text style={[styles.hint, { color: t.textTertiary }]}>{hint}</Text>}
      {!!actionLabel && !!onAction && (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      )}
    </View>
  )
}

export default memo(EmptyState)

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  title: {
    marginTop: 14,
    fontSize: 16,
    fontFamily: font.semibold,
    textAlign: "center",
  },
  hint: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: font.regular,
    textAlign: "center",
  },
  action: {
    marginTop: 18,
  },
})
