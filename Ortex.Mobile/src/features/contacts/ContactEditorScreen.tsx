import { usePreventRemove } from "@react-navigation/native"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { stateLabel } from "@/domain/gstStates"
import { newCustomer, type Customer, type Row } from "@/domain/schema"
import { normaliseContact, validateContact, type ContactErrors } from "@/features/contacts/validateContact"
import StatePickerSheet from "@/features/quotations/StatePickerSheet"
import { useCollection } from "@/hooks/useCollection"
import { useFocusChain } from "@/features/contacts/useFocusChain"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useCompany } from "@/store/CompanyContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Button, Dialog, Icon, Section, TextField, useToast } from "@/ui"
import OptionSheet from "@/ui/OptionSheet"
import { SquircleBackground } from "@/ui/Squircle"

/**
 * Add a customer contact from the phone.
 *
 * Until now every `customers` row was born in the console, or as a side effect of
 * raising a quotation — which meant a salesperson who met someone at a counter
 * had to invent a quotation to keep their number. This is the missing verb.
 *
 * It writes the SAME seven-field row the console writes (`domain/schema.ts`
 * `newCustomer`), through `repo.create`, so a contact added here is a contact
 * there. There is no phone-only shape and no local queue: `customers` has no
 * sequence to allocate, but a contact created offline could not be de-duplicated
 * against the master, and two salespeople each saving "the same" customer while
 * offline is precisely the mess `sameCustomer` exists to prevent.
 *
 * The validation lives in validateContact.ts, pure and tested — see that file for
 * why each rule is there.
 *
 * A customer belongs to one company (Admin migration 0076): the one being worked
 * in, or, in the All companies view, the one picked on the form. Duplicates are
 * looked for in that company only, as the database matches leads.
 */
export default function ContactEditorScreen({ route, navigation }: StackScreenProps<"ContactEditor">) {
  const t = useTheme()
  const toast = useToast()
  const { items: everyCustomer } = useCollection<Customer & Row>("customers", { everyCompany: true })
  const company = useCompany()
  const [companyId, setCompanyId] = React.useState(company.defaultCompany)
  const [companyOpen, setCompanyOpen] = React.useState(false)
  const customers = React.useMemo(
    () => (companyId ? everyCustomer.filter((c) => c.companyId === companyId) : everyCustomer),
    [everyCustomer, companyId],
  )

  const [draft, setDraft] = React.useState<Customer>(() => newCustomer(route.params?.prefill))
  const [initial] = React.useState(() => JSON.stringify(draft))
  const [confirmLeave, setConfirmLeave] = React.useState(false)
  // Set just before a saved contact navigates away, so the guard lets it go.
  const leaving = React.useRef(false)
  // Gesture and hardware back ask before typed details are thrown away.
  usePreventRemove(JSON.stringify(draft) !== initial, ({ data }) => {
    if (leaving.current) navigation.dispatch(data.action)
    else setConfirmLeave(true)
  })
  const chain = useFocusChain()
  const [errors, setErrors] = React.useState<ContactErrors>({})
  const [stateOpen, setStateOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const set = (key: keyof Customer, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    // Clear only the field being typed in, plus the form-wide message: leaving a
    // "those details already belong to…" banner up while the number is being
    // corrected reads as a refusal to accept the fix.
    setErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }))
  }

  const save = async () => {
    if (company.multi && !companyId) {
      feedback.warn()
      setErrors({ form: "Choose a company first." })
      return
    }
    const found = validateContact(draft, customers)
    setErrors(found)
    if (Object.values(found).some(Boolean)) {
      feedback.warn()
      return
    }

    setSaving(true)
    try {
      const row = await repo.create<Customer & Row>("customers", { ...normaliseContact(draft), companyId })
      feedback.created()
      toast.show({ message: "Customer saved", tone: "success" })
      // Replace rather than push: coming back to a half-filled form you have
      // already submitted is never what anyone wants.
      leaving.current = true
      navigation.replace("CustomerDetail", { id: row.id })
    } catch (e) {
      feedback.error()
      toast.show({ message: (e as Error)?.message || "Could not save this customer", tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AppScreen
        title="New customer"
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        contentStyle={styles.content}
      >
        {/* The form-wide problem — a duplicate, or no way to reach them — is
            said once at the top rather than pinned to a field, because it is a
            statement about the record and not about one box. */}
        {!!errors.form && (
          <View style={styles.banner}>
            <SquircleBackground fill={t.dangerBg} radius={radius.md} />
            <Icon name="warning" size={18} color={t.dangerText} variant="Bulk" />
            <Text style={[textVariants.small, styles.bannerText, { color: t.dangerText }]}>{errors.form}</Text>
          </View>
        )}

        {company.multi && (
          <Section title="Company" style={styles.section} bodyStyle={styles.form}>
            <FieldButton
              label="Customer of"
              value={company.nameOf(companyId) || "Choose a company"}
              onPress={() => {
                feedback.tap()
                setCompanyOpen(true)
              }}
            />
          </Section>
        )}

        <Section title="Who They Are" style={styles.section} bodyStyle={styles.form}>
          <TextField
            label="Name"
            value={draft.name}
            onChangeText={(v) => set("name", v)}
            placeholder="Enter full name"
            autoCapitalize="words"
            error={errors.name}
            autoFocus
            {...chain(0)}
          />
          <TextField
            label="Company"
            value={draft.company}
            onChangeText={(v) => set("company", v)}
            placeholder="Enter company name"
            autoCapitalize="words"
            {...chain(1)}
          />
        </Section>

        <Section title="How to Reach Them" style={styles.section} bodyStyle={styles.form}>
          <TextField
            label="Phone"
            value={draft.phone}
            onChangeText={(v) => set("phone", v)}
            placeholder="Enter phone number"
            keyboardType="phone-pad"
            error={errors.phone}
            {...chain(2)}
          />
          <TextField
            label="Email"
            value={draft.email}
            onChangeText={(v) => set("email", v)}
            placeholder="Enter email address"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.email}
            {...chain(3)}
          />
        </Section>

        <Section title="Billing" style={styles.section} bodyStyle={styles.form}>
          <TextField
            label="GSTIN"
            value={draft.gstin}
            // Stored and compared uppercase; typing it in lower case is not the
            // user's mistake to fix.
            onChangeText={(v) => set("gstin", v.toUpperCase())}
            placeholder="Enter GSTIN"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            error={errors.gstin}
            hint="Optional, but its first two digits set the place of supply"
            {...chain(4, true)}
          />
          {/* A picker, not a field: the state code decides CGST+SGST versus
              IGST, so a typo here is a wrong tax invoice. */}
          <FieldButton
            label="Place of supply"
            value={draft.stateCode ? stateLabel(draft.stateCode) : "Not set"}
            error={errors.stateCode}
            onPress={() => setStateOpen(true)}
          />
          <TextField
            label="Address"
            value={draft.address}
            onChangeText={(v) => set("address", v)}
            placeholder="Enter billing address"
            multiline
            numberOfLines={3}
          />
          <TextField
            label="Notes"
            value={draft.notes || ""}
            onChangeText={(v) => set("notes", v)}
            placeholder="For the team only, never printed"
            multiline
            numberOfLines={3}
          />
        </Section>

        <View style={styles.pageBlock}>
          <Button label="Save customer" fullWidth loading={saving} onPress={() => void save()} />
          <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
            This adds a customer to the shared master, so the console and everyone else's phone see it too.
          </Text>
        </View>
      </AppScreen>

      <Dialog
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave without saving?"
        message="The details you typed for this customer are not saved."
        actions={[
          { label: "Keep editing", onPress: () => setConfirmLeave(false) },
          {
            label: "Leave",
            tone: "danger",
            onPress: () => {
              setConfirmLeave(false)
              leaving.current = true
              navigation.goBack()
            },
          },
        ]}
      />

      <OptionSheet
        visible={companyOpen}
        title="Company"
        options={company.companies.map((c) => c.name)}
        value={company.nameOf(companyId)}
        onClose={() => setCompanyOpen(false)}
        onPick={(name) => {
          const picked = company.companies.find((c) => c.name === name)
          if (picked) setCompanyId(picked.id)
          setErrors((e) => ({ ...e, form: undefined }))
          setCompanyOpen(false)
        }}
      />

      <StatePickerSheet
        visible={stateOpen}
        value={draft.stateCode}
        onClose={() => setStateOpen(false)}
        onPick={(code) => {
          feedback.select()
          set("stateCode", code)
          setStateOpen(false)
        }}
      />
    </>
  )
}

/**
 * A field-shaped button that opens a sheet. Same idiom (and the same metrics) as
 * the quotation editor's own, so the state picker looks identical wherever it is
 * reached from.
 */
function FieldButton({
  label,
  value,
  error,
  onPress,
}: {
  label: string
  value: string
  error?: string
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <View style={styles.fieldButtonWrap}>
      <Text style={[textVariants.label, { color: t.textStrong, marginBottom: 6 }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => [
          styles.fieldButton,
          {
            backgroundColor: t.fieldBg,
            borderColor: error ? t.danger : t.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text numberOfLines={1} style={[textVariants.body, { color: t.text, flex: 1 }]}>
          {value}
        </Text>
        <Icon name="down" size={16} color={t.textTertiary} />
      </Pressable>
      {!!error && <Text style={[textVariants.caption, { color: t.dangerText, marginTop: 4 }]}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  // No page padding: every Section is a full-bleed panel that pads itself and
  // draws the band beneath it (ui/Section.tsx). Loose content takes `pageBlock`.
  content: { paddingBottom: spacing.xxl },
  pageBlock: { paddingHorizontal: gutter, paddingTop: spacing.lg },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    // Loose content on a full-bleed page carries the gutter itself.
    marginHorizontal: gutter,
    marginTop: spacing.md,
  },
  bannerText: { flex: 1 },
  fieldButtonWrap: { marginBottom: spacing.md },
  fieldButton: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  section: {},
  // The fields bring their own bottom margin; the panel only needs its sides.
  form: { paddingHorizontal: gutter, paddingTop: spacing.xs, paddingBottom: 0 },
  hint: { marginTop: spacing.md },
})
