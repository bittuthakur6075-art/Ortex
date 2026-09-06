import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { supabase } from "@/data/supabase"
import { MODULES, canAccess, roleLabel } from "@/domain/modules"
import { prettyPhone } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { Button, FactRow, Section, SectionRow, Sheet, TextField, AppScreen, useToast } from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * Account details — the facts about the signed-in person, and the two of them
 * this client is allowed to change.
 *
 * Split out of ProfileScreen, which is now the hub: the hub is a place you pass
 * through (photo, theme, sign out), this is a record you read and correct. They
 * were one screen and it made the page a scroll of unrelated panels.
 *
 * WHAT IS EDITABLE IS DELIBERATELY NARROW. `name` and `phone` are the user's own;
 * role, module access and the sign-in email are set by an admin in the console
 * and a BEFORE UPDATE trigger (migration 0003) forces them back to their old
 * values for a non-admin caller — so posting them would be silently dropped and
 * read here as a save that worked.
 *
 * `phone` needs migration 0021 on the Supabase project. Until it is pushed, the
 * field simply fails to save and says so, rather than pretending.
 */

/** One glyph per module, so the access list reads as rows rather than a tag cloud. */
const MODULE_ICON: Record<string, IconName> = {
  "voice-leads": "voice",
  enquiries: "enquiry",
  customers: "customer",
  products: "product",
  quotations: "quote",
}

type EditField = "name" | "phone"

const FIELD = {
  name: {
    title: "Your name",
    label: "Full Name",
    placeholder: "Enter full name",
    hint: "This is the name colleagues see on quotations you raise.",
  },
  phone: {
    title: "Phone number",
    label: "Mobile Number",
    placeholder: "Enter mobile number",
    hint: "A teammate rings this number; it is not used to sign in.",
  },
} as const

export default function AccountDetailsScreen({ navigation }: StackScreenProps<"AccountDetails">) {
  const t = useTheme()
  const toast = useToast()
  const { profile, session, refreshProfile } = useAuth()

  const [editing, setEditing] = React.useState<EditField | null>(null)
  const [draft, setDraft] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const email = profile?.email || session?.user?.email || ""
  const phone = profile?.phone?.trim() || ""
  const granted = MODULES.filter((m) => canAccess(profile, m.key))

  const startEdit = (field: EditField) => {
    setDraft(field === "name" ? profile?.name || "" : phone)
    setEditing(field)
  }

  const save = async () => {
    const field = editing
    const userId = session?.user?.id
    if (!field || !userId) return

    // Numbers are stored as digits and formatted on the way out, the same
    // contract `customers.phone` has, so a number typed with spaces here and one
    // pasted with +91 there are the same number.
    const value = field === "phone" ? draft.replace(/\D/g, "") : draft.trim()
    if (field === "phone" && value && (value.length < 10 || value.length > 12)) {
      feedback.warn()
      toast.show({ message: "That does not look like a phone number", tone: "danger" })
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ [field]: value || null })
        .eq("id", userId)
      if (error) throw error
      await refreshProfile()
      feedback.created()
      setEditing(null)
      toast.show({ message: field === "phone" ? "Phone number saved" : "Your name was updated", tone: "success" })
    } catch (e) {
      feedback.error()
      toast.show({ message: (e as Error)?.message || "Could not save your details", tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  const copy = editing ? FIELD[editing] : null

  return (
    <>
      <AppScreen
        title="Account details"
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        contentStyle={styles.content}
      >
        <Section title="Your details">
          <FactRow
            icon="profile"
            label="Name"
            value={profile?.name}
            addLabel="Add your name"
            onAdd={() => startEdit("name")}
            onEdit={() => startEdit("name")}
          />
          <FactRow
            icon="call"
            label="Phone"
            value={phone ? prettyPhone(phone) : ""}
            addLabel="Add a phone number"
            onAdd={() => startEdit("phone")}
            onEdit={() => startEdit("phone")}
          />
          <FactRow icon="mail" label="Sign-in email" value={email} />
          <FactRow icon="gst" label="Role" value={roleLabel(profile?.role)} />
        </Section>
        <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
          Your sign-in email and role are managed by an admin in the Ortex console.
        </Text>

        <Section title="Sign-in">
          <SectionRow
            leadingIcon="lock"
            title="Change password"
            subtitle="You will be asked for your current one first"
            onPress={() => {
              feedback.tap()
              navigation.navigate("ChangePassword")
            }}
          />
        </Section>

        {/* Read-only by design: access is granted per user in the console, and a
            switch here that could not change it would be a lie. */}
        <Section title="What you can open">
          {granted.map((m) => (
            <SectionRow key={m.key} leadingIcon={MODULE_ICON[m.key]} title={m.label} chevron={false} />
          ))}
          {granted.length === 0 && (
            <SectionRow
              leadingIcon="warning"
              leadingTone="warning"
              title="No modules yet"
              subtitle="An admin has not granted this account anything to open."
              chevron={false}
            />
          )}
        </Section>
        <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
          Access is set by an admin in the Ortex console, not here.
        </Text>
      </AppScreen>

      {/* ONE OPERATION PER SURFACE: a full sheet rather than an in-card form
          swap, so the record stays a stable reading surface and the form gets the
          height, the keyboard avoidance and a thumb-reach pair of actions. */}
      <Sheet visible={!!editing} onClose={() => !saving && setEditing(null)} title={copy?.title ?? ""}>
        <View style={styles.sheetBody}>
          <TextField
            label={copy?.label}
            value={draft}
            onChangeText={setDraft}
            placeholder={copy?.placeholder}
            autoCapitalize={editing === "name" ? "words" : "none"}
            keyboardType={editing === "phone" ? "phone-pad" : "default"}
            autoFocus
          />
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{copy?.hint}</Text>
          <View style={styles.sheetActions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setEditing(null)}
              disabled={saving}
              style={styles.sheetAction}
            />
            <Button label="Save" onPress={() => void save()} loading={saving} style={styles.sheetAction} />
          </View>
        </View>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  // No page padding: a Section is a full-bleed panel that pads itself and draws
  // its own band (ui/Section.tsx). Loose text carries the gutter.
  content: { paddingBottom: spacing.xxl },
  section: {},
  hint: { marginTop: spacing.sm, marginBottom: spacing.lg, paddingHorizontal: gutter },
  sheetBody: { paddingHorizontal: gutter, paddingTop: spacing.sm, gap: spacing.md },
  sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  sheetAction: { flex: 1 },
})
