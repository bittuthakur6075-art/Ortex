import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { LEGAL_DOCS } from "@/features/profile/legal"
import { email as sendEmail } from "@/lib/contact"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Divider } from "@/ui"

/**
 * The Privacy Policy and the Terms of Service, rendered from `legal.ts` — the
 * website's own copy, not a phone-sized retelling of it.
 *
 * One screen for both documents rather than two nearly identical ones: they have
 * the same shape (a date, a preamble, numbered sections, a contact block), and
 * the only thing that differs is which constant is read.
 */
export default function LegalScreen({ route, navigation }: StackScreenProps<"Legal">) {
  const t = useTheme()
  const doc = LEGAL_DOCS[route.params.doc]

  return (
    <AppScreen
      title={doc.title}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      contentStyle={styles.content}
    >
      <Text style={[textVariants.caption, { color: t.textTertiary }]}>{doc.updated}</Text>
      <Text style={[textVariants.body, styles.intro, { color: t.text }]}>{doc.intro}</Text>

      {doc.sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Divider />
          <Text style={[textVariants.cardTitle, styles.heading, { color: t.text }]}>{section.title}</Text>
          <Text style={[textVariants.small, { color: t.textSecondary }]}>{section.content}</Text>
        </View>
      ))}

      <View style={styles.section}>
        <Divider />
        <Text style={[textVariants.cardTitle, styles.heading, { color: t.text }]}>{doc.contact.title}</Text>
        {!!doc.contact.note && (
          <Text style={[textVariants.small, { color: t.textSecondary }]}>{doc.contact.note}</Text>
        )}
        <View style={[styles.contactCard, { backgroundColor: t.surfaceInset }]}>
          <Text style={[textVariants.smallStrong, { color: t.text }]}>{doc.contact.org}</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Email ${doc.contact.email}`}
            onPress={() => void sendEmail(doc.contact.email)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 4 })}
          >
            <Text style={[textVariants.small, { color: t.primary }]}>{doc.contact.email}</Text>
          </Pressable>
          {!!doc.contact.address && (
            <Text style={[textVariants.small, { color: t.textSecondary, marginTop: 2 }]}>
              {doc.contact.address}
            </Text>
          )}
        </View>
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingBottom: spacing.xxl },
  intro: { marginTop: spacing.md },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  heading: { marginTop: spacing.xs },
  contactCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
})
