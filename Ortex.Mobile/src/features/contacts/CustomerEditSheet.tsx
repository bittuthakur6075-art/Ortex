import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { stateLabel } from "@/domain/gstStates"
import type { CustomerRow } from "@/features/contacts/ContactsScreen"
import {
  normaliseContact,
  validateContact,
  type ContactErrors,
} from "@/features/contacts/validateContact"
import StatePickerSheet from "@/features/quotations/StatePickerSheet"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Button, Icon, Sheet, TextField, useToast } from "@/ui"

/**
 * Editing a contact, in a sheet rather than a screen.
 *
 * The console owns the customer master, but a salesperson standing in front of
 * the person is exactly who finds out the number changed — so the seven fields
 * that make up a `customers` doc are editable here and nowhere else in the app.
 *
 * `repo.update` is a shallow merge of the doc (the console's `{...existing,
 * ...patch}`), so a field this form does not know about survives a save. The
 * place of supply stays a picker for the same reason it is one in the quotation
 * editor: a typo in the state code is a wrong tax split, not a cosmetic slip.
 */
export default function CustomerEditSheet({
  visible,
  customer,
  onClose,
}: {
  visible: boolean
  customer: CustomerRow
  onClose: () => void
}) {
  const t = useTheme()
  const toast = useToast()
  const [draft, setDraft] = React.useState(() => fields(customer))
  const [stateOpen, setStateOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<ContactErrors>({})
  // The master list, for the duplicate check — the same one ContactEditorScreen
  // runs. Editing a phone number into another contact's number is exactly how a
  // duplicate gets made, and this sheet is where numbers actually get corrected.
  const { items: customers } = useCollection<CustomerRow>("customers")

  // Reopening on a different contact — or after someone else edited this one —
  // has to start from the row as it now stands, not the last draft in memory.
  React.useEffect(() => {
    if (visible) {
      setDraft(fields(customer))
      setErrors({})
    }
  }, [visible, customer])

  const set = (patch: Partial<ReturnType<typeof fields>>) => {
    setDraft((d) => ({ ...d, ...patch }))
    // A message is about what was typed, so it clears the moment that changes —
    // leaving it up while the person fixes it reads as the fix not working.
    setErrors((e) => {
      const next = { ...e }
      for (const key of Object.keys(patch)) delete next[key as keyof ContactErrors]
      delete next.form
      return next
    })
  }

  const save = async () => {
    // The SAME rules as ContactEditorScreen, from the same tested module. This
    // sheet writes to the same `customers` rows and had far weaker checks: a name
    // test in a toast and nothing else, so a malformed GSTIN, an email with no
    // domain, or a number already belonging to someone else all saved cleanly.
    const found = validateContact(draft, customers, customer.id)
    setErrors(found)
    if (Object.keys(found).length) {
      feedback.error()
      return
    }
    setSaving(true)
    try {
      // Normalised, not trimmed: the phone is stored as bare national digits
      // because `sameCustomer` matches on the STORED string, and a GSTIN fills a
      // blank place of supply. Saving `draft.phone.trim()` — what this did — left
      // "+91 98765 43210" in a column the matcher compares against "9876543210".
      await repo.update("customers", customer.id, normaliseContact(draft))
      toast.show({ message: "Contact updated", tone: "success" })
      onClose()
    } catch (e) {
      toast.show({ message: errorMessage(e, "Could not save"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="Edit contact">
        <View style={styles.form}>
          {!!errors.form && (
            <Text style={[textVariants.small, { color: t.dangerText }]}>{errors.form}</Text>
          )}
          <TextField
            label="Contact Name"
            value={draft.name}
            onChangeText={(v) => set({ name: v })}
            error={errors.name}
            placeholder="Enter contact name"
          />
          <TextField
            label="Company"
            value={draft.company}
            onChangeText={(v) => set({ company: v })}
            placeholder="Enter company name"
          />
          <TextField
            label="Phone"
            value={draft.phone}
            onChangeText={(v) => set({ phone: v })}
            error={errors.phone}
            keyboardType="phone-pad"
            placeholder="Enter phone number"
          />
          <TextField
            label="Email"
            value={draft.email}
            onChangeText={(v) => set({ email: v })}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Enter email address"
          />
          <TextField
            label="GSTIN"
            value={draft.gstin}
            onChangeText={(v) => set({ gstin: v.toUpperCase() })}
            error={errors.gstin}
            autoCapitalize="characters"
            placeholder="Enter GSTIN"
          />

          <View>
            <Text style={[styles.pickerLabel, { color: t.textSecondary }]}>Place of supply</Text>
            <Pressable
              onPress={() => setStateOpen(true)}
              style={({ pressed }) => [
                styles.picker,
                { backgroundColor: t.fieldBg, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text numberOfLines={1} style={[styles.pickerValue, { color: t.text }]}>
                {draft.stateCode ? stateLabel(draft.stateCode) : "Not set, taxed as local"}
              </Text>
              <Icon name="down" size={16} color={t.textTertiary} />
            </Pressable>
            <Text style={[styles.pickerHint, { color: t.textTertiary }]}>Decides CGST + SGST or IGST</Text>
          </View>

          <TextField
            label="Address"
            value={draft.address}
            onChangeText={(v) => set({ address: v })}
            placeholder="Enter billing address"
            multiline
          />

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.action} />
            <Button label="Save" loading={saving} onPress={() => void save()} style={styles.action} />
          </View>
        </View>
      </Sheet>

      <StatePickerSheet
        visible={stateOpen}
        value={draft.stateCode}
        onClose={() => setStateOpen(false)}
        onPick={(code) => {
          set({ stateCode: code })
          setStateOpen(false)
        }}
      />
    </>
  )
}

/** The seven doc fields, every one a string so the inputs stay controlled. */
function fields(c: CustomerRow) {
  return {
    name: c.name || "",
    company: c.company || "",
    phone: c.phone || "",
    email: c.email || "",
    gstin: c.gstin || "",
    stateCode: c.stateCode || "",
    address: c.address || "",
  }
}

const styles = StyleSheet.create({
  form: { gap: spacing.md, paddingBottom: spacing.sm },
  pickerLabel: { marginBottom: 6, fontSize: 13, fontFamily: font.medium },
  picker: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pickerValue: { flex: 1, fontSize: 15, fontFamily: font.medium },
  pickerHint: { marginTop: 5, fontSize: 12, fontFamily: font.regular },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
})
