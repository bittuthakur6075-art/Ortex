import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { normaliseDefault, type QuotationDefaults } from "@/domain/quotationDefaults"
import { useSettings } from "@/hooks/useSettings"
import { feedback } from "@/lib/feedback"
import { useQuotationDefaults } from "@/lib/quotationDefaults"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Button, Section, TextField, useToast } from "@/ui"
import ListTextField from "@/ui/ListTextField"

/**
 * Quotation defaults: the payment terms, terms and conditions and notes every
 * NEW quotation this rep starts is filled with. Reached from Profile.
 *
 * Personal, and said so on the page: the company terms belong to the console
 * and only an admin changes them there. Terms left as the company wrote them
 * stay LINKED to the company (stored as "not set"), so when an admin updates the
 * terms in the console, this rep's new quotations pick the change up. "Use
 * company terms" puts the field back to that link.
 *
 * Stored on the ACCOUNT (profiles.quotation_defaults, migration 0027), so they
 * follow the rep to any phone; lib/quotationDefaults.ts keeps working on the
 * handset alone where 0027 has not been pushed yet.
 *
 * An existing quotation is never rewritten: defaults only seed a blank one, and
 * every field stays editable on the quotation itself.
 */
export default function QuotationDefaultsScreen({ navigation }: StackScreenProps<"QuotationDefaults">) {
  const t = useTheme()
  const toast = useToast()
  const { settings, loading: settingsLoading } = useSettings()
  const { defaults, loaded, save, syncedToAccount } = useQuotationDefaults()
  const companyTerms = settings.quotation.terms || ""

  const [paymentTerms, setPaymentTerms] = React.useState("")
  const [terms, setTerms] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [seeded, setSeeded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Seed once both the stored defaults and the company terms have arrived, so
  // the terms field shows what a new quotation will actually start with.
  React.useEffect(() => {
    if (seeded || !loaded || settingsLoading) return
    setPaymentTerms(defaults.paymentTerms ?? "")
    setTerms(defaults.terms ?? companyTerms)
    setNotes(defaults.notes ?? "")
    setSeeded(true)
  }, [seeded, loaded, settingsLoading, defaults, companyTerms])

  const next: QuotationDefaults = {
    paymentTerms: normaliseDefault(paymentTerms, ""),
    terms: normaliseDefault(terms, companyTerms),
    notes: normaliseDefault(notes, ""),
  }
  const dirty =
    seeded &&
    (next.paymentTerms !== defaults.paymentTerms || next.terms !== defaults.terms || next.notes !== defaults.notes)
  const termsLinked = next.terms === null

  const submit = async () => {
    setBusy(true)
    try {
      const where = await save(next)
      feedback.created()
      toast.show({
        message: where === "account" ? "Quotation defaults saved to your account" : "Saved on this phone",
        tone: "success",
      })
      navigation.goBack()
    } catch {
      feedback.error()
      toast.show({ message: "Could not save your defaults. Try again.", tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppScreen
      title="Quotation defaults"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      contentStyle={styles.content}
    >
      <Text style={[textVariants.body, styles.pageText, { color: t.textSecondary }]}>
        Every new quotation you start is filled with these. You can still change them on each quotation.
      </Text>

      <Section title="Payment terms" bodyStyle={styles.form}>
        <TextField
          value={paymentTerms}
          onChangeText={setPaymentTerms}
          placeholder="For example: 50% advance, balance before dispatch"
          multiline
          numberOfLines={2}
          hint="Printed beside the totals. Leave empty to start blank."
          ai={{
            purpose: "Default payment terms for every new B2B quotation, one short line",
            format: "short",
            maxChars: 160,
          }}
        />
      </Section>

      <Section
        title="Terms and conditions"
        action={
          !termsLinked && companyTerms ? (
            <Pressable
              onPress={() => {
                feedback.select()
                setTerms(companyTerms)
              }}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => ({ opacity: pressed ? state.pressedOpacity : 1 })}
            >
              <Text style={[textVariants.smallStrong, { color: t.primary }]}>Use company terms</Text>
            </Pressable>
          ) : undefined
        }
        bodyStyle={styles.form}
      >
        <ListTextField
          value={terms}
          onChangeText={setTerms}
          placeholder="Enter terms and conditions"
          numberOfLines={8}
          ai={{
            purpose:
              "Default terms and conditions for B2B quotations of custom manufactured products: validity, artwork approval, production after confirmation, delivery and taxes. One clause per line.",
            maxChars: 1200,
            context: () => ({ paymentTerms }),
          }}
          hint={
            termsLinked
              ? "These are the company terms. When an admin updates them, your new quotations follow."
              : "Your own terms. New quotations use these instead of the company terms."
          }
        />
      </Section>

      <Section title="Notes" bodyStyle={styles.form}>
        <ListTextField
          value={notes}
          onChangeText={setNotes}
          placeholder="For example: Artwork proof shared within 24 hours of order"
          numberOfLines={4}
          ai={{
            purpose: "Default notes printed on every new quotation, such as artwork proofs or samples. One note per line.",
            maxChars: 500,
          }}
          hint="Leave empty to start blank."
        />
      </Section>

      <View style={styles.action}>
        <Button label="Save defaults" fullWidth loading={busy} disabled={!dirty} onPress={() => void submit()} />
      </View>

      <Text style={[textVariants.caption, styles.pageText, { color: t.textTertiary }]}>
        {syncedToAccount
          ? "Saved to your account, so they follow you to any phone you sign in on. The company terms themselves are changed by an admin in the console."
          : "Saved on this phone until the database update that syncs them is applied. The company terms themselves are changed by an admin in the console."}
      </Text>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  form: { paddingHorizontal: gutter, paddingTop: spacing.xs, paddingBottom: 0 },
  pageText: { paddingHorizontal: gutter, marginTop: spacing.sm, marginBottom: spacing.lg },
  action: { paddingHorizontal: gutter, marginTop: spacing.lg, marginBottom: spacing.md },
})
