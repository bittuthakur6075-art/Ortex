import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { APP_VERSION } from "@/constants/app"
import { KIND_LABEL, RELEASES, type ChangeKind } from "@/constants/whatsNew"
import { formatDate } from "@/domain/format"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Badge, Panel } from "@/ui"

/**
 * What changed in the app, newest release first. The words live in
 * constants/whatsNew.ts; this screen only lays them out, one panel per release,
 * so it opens with no signal like the legal pages do.
 *
 * A full push rather than a Profile sheet: it is a page you read down, and a
 * few releases in it is longer than a sheet wants to be.
 */
export default function WhatsNewScreen({ navigation }: StackScreenProps<"WhatsNew">) {
  const t = useTheme()

  // Text on a tinted well uses the *Text step, never the saturated hue.
  const tone: Record<ChangeKind, { bg: string; fg: string }> = {
    new: { bg: t.primary10, fg: t.primary },
    improved: { bg: t.successBg, fg: t.successText },
    fixed: { bg: t.warningBg, fg: t.warningText },
  }

  return (
    <AppScreen
      title="What's new"
      subtitle={`You are on version ${APP_VERSION}`}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      contentStyle={styles.content}
    >
      {RELEASES.map((release, i) => (
        <Panel key={release.id} padded>
          <View style={styles.head}>
            <Text style={[textVariants.captionStrong, { color: t.textTertiary }]}>
              {[release.version && `Version ${release.version}`, formatDate(release.date)].filter(Boolean).join(" · ")}
            </Text>
            {i === 0 && <Badge label="Latest" tone="accent" />}
          </View>
          <Text style={[textVariants.subtitle, styles.title, { color: t.text }]}>{release.title}</Text>
          {!!release.summary && (
            <Text style={[textVariants.small, styles.summary, { color: t.textSecondary }]}>{release.summary}</Text>
          )}

          {release.items.map((item) => (
            <View key={item.title} style={[styles.item, { borderTopColor: t.divider }]}>
              <View style={styles.itemHead}>
                <View style={[styles.kind, { backgroundColor: tone[item.kind].bg }]}>
                  <Text style={[textVariants.chipText, { color: tone[item.kind].fg }]}>
                    {KIND_LABEL[item.kind].toUpperCase()}
                  </Text>
                </View>
                <Text style={[textVariants.bodyStrong, styles.itemTitle, { color: t.text }]}>{item.title}</Text>
              </View>
              <Text style={[textVariants.small, { color: t.textSecondary }]}>{item.detail}</Text>
            </View>
          ))}
        </Panel>
      ))}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  // Panels reach both edges and pad themselves; the page adds no gutter.
  content: { paddingTop: 0, paddingBottom: spacing.xxl },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: gutter,
  },
  title: { marginTop: spacing.xs },
  summary: { marginTop: spacing.xs },
  item: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  itemHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemTitle: { flexShrink: 1 },
  kind: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3 },
})
