/**
 * ProfileScreen — who is signed in on this phone.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\screens\user\ProfileScreen.jsx,
 * whose layout came out of a Mobbin sweep of fintech profile screens (Kraken,
 * Monzo, Binance, CVS, Cleo). The three moves that survey paid for, kept here:
 *
 *   CENTERED HERO — avatar, then the name ONCE, then one meta caption, then a
 *   single chip, all on the centre line. The old screen said the name and then
 *   the email as a second line of the same size, and parked the role chip in a
 *   left-aligned row that read as a web port.
 *
 *   ICON-LED ROWS — every fact is a `FactRow` with a leading glyph in a round
 *   well (ui/Section.tsx), replacing the bare label/value stack. A missing value
 *   renders as an accent-coloured "Add …" that opens the editor, never as grey
 *   text masquerading as data.
 *
 *   ONE OPERATION PER SURFACE — editing is a full bottom sheet rather than an
 *   in-card form swap, so the record stays a stable reading surface and the form
 *   gets the whole height, keyboard avoidance and thumb-reach actions.
 *
 * WHAT IS EDITABLE HERE IS DELIBERATELY NARROW. `name` and the photo are the
 * user's own; role, module access and the account's email are set by an admin in
 * the console and RLS refuses them from this client, so posting them would be
 * silently dropped and read here as a save that worked.
 */

import * as ImagePicker from "expo-image-picker"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { supabase } from "@/data/supabase"
import { MODULES, canAccess, roleLabel } from "@/domain/modules"
import { biometricAvailable } from "@/features/auth/useAppLock"
import { MAX_AVATAR_MB, base64Bytes, removeAvatar, uploadAvatar } from "@/lib/avatarUpload"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useThemePref, type ThemePref } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  Button,
  Card,
  Chip,
  Dialog,
  FactRow,
  RadioGroup,
  Section,
  SectionRow,
  Sheet,
  Switch,
  TextField,
  useToast,
} from "@/ui"
import type { IconName } from "@/ui/Icon"

const THEMES: { key: ThemePref; label: string; description?: string }[] = [
  { key: "system", label: "Match the phone", description: "Follows your device's dark mode setting" },
  { key: "light", label: "Always light" },
  { key: "dark", label: "Always dark" },
]

/** One glyph per module, so the access list reads as rows rather than a tag cloud. */
const MODULE_ICON: Record<string, IconName> = {
  "voice-leads": "voice",
  enquiries: "enquiry",
  customers: "customer",
  products: "product",
  quotations: "quote",
}

export default function ProfileScreen({ navigation }: StackScreenProps<"Profile">) {
  const { theme, pref, setPref } = useThemePref()
  const t = theme.colors
  const toast = useToast()
  const { profile, session, biometricEnabled, setBiometricEnabled, refreshProfile, signOut } = useAuth()

  const [canBiometric, setCanBiometric] = React.useState(false)
  const [confirmOut, setConfirmOut] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [draftName, setDraftName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [themeOpen, setThemeOpen] = React.useState(false)
  const [photoOpen, setPhotoOpen] = React.useState(false)
  const [confirmRemovePhoto, setConfirmRemovePhoto] = React.useState(false)
  const [photoBusy, setPhotoBusy] = React.useState(false)

  React.useEffect(() => {
    void biometricAvailable().then(setCanBiometric)
  }, [])

  const email = profile?.email || session?.user?.email || ""
  // The record's own name heads the screen; the email is the fallback only when
  // no one has filled the name in yet.
  const headName = profile?.name?.trim() || email || "Signed in"
  const photo = profile?.avatar_url ?? undefined
  const granted = MODULES.filter((m) => canAccess(profile, m.key))
  const themeLabel = THEMES.find((o) => o.key === pref)?.label ?? ""

  const startEdit = () => {
    setDraftName(profile?.name || "")
    setEditing(true)
  }

  const saveName = async () => {
    const next = draftName.trim()
    if (!session?.user?.id) return
    setSaving(true)
    try {
      const { error } = await supabase.from("profiles").update({ name: next }).eq("id", session.user.id)
      if (error) throw error
      await refreshProfile()
      feedback.created()
      setEditing(false)
      toast.show({ message: "Your details were updated", tone: "success" })
    } catch (e) {
      feedback.error()
      toast.show({ message: (e as Error)?.message || "Could not save your details", tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  /**
   * Pick a photo and upload it. `allowsEditing` + a 1:1 aspect makes the picker
   * itself do the square crop the console does on a canvas, so what is uploaded
   * already matches the circle it will be drawn in. Android 13+'s photo picker
   * needs no permission prompt.
   */
  const pickPhoto = async () => {
    const userId = session?.user?.id
    if (!userId) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.base64) return

    if (base64Bytes(asset.base64) > MAX_AVATAR_MB * 1024 * 1024) {
      feedback.warn()
      toast.show({ message: `That photo is over ${MAX_AVATAR_MB}MB — pick a smaller one`, tone: "danger" })
      return
    }

    setPhotoBusy(true)
    const previous = profile?.avatar_url
    try {
      const url = await uploadAvatar(asset.base64, userId, asset.mimeType ?? "image/jpeg")
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId)
      if (error) throw error
      await refreshProfile()
      // Only once the row points at the new object: deleting first would leave a
      // broken avatar behind if the update failed.
      await removeAvatar(previous)
      feedback.created()
      setPhotoOpen(false)
      toast.show({ message: "Profile photo updated", tone: "success" })
    } catch (e) {
      feedback.error()
      toast.show({ message: (e as Error)?.message || "Could not upload that photo", tone: "danger" })
    } finally {
      setPhotoBusy(false)
    }
  }

  const clearPhoto = async () => {
    const userId = session?.user?.id
    if (!userId) return
    setPhotoBusy(true)
    const previous = profile?.avatar_url
    try {
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId)
      if (error) throw error
      await refreshProfile()
      await removeAvatar(previous)
      feedback.deleted()
      setConfirmRemovePhoto(false)
      setPhotoOpen(false)
      toast.show({ message: "Profile photo removed", tone: "success" })
    } catch (e) {
      feedback.error()
      toast.show({ message: (e as Error)?.message || "Could not remove that photo", tone: "danger" })
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <>
      {/* "Account details", not "Profile": the row that opens this screen is
          already called Profile, and two surfaces one tap apart must not share a
          name. */}
      <AppScreen
        title="Account details"
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        contentStyle={styles.content}
      >
        {/* THE HERO. Everything on the centre line: the face (tappable, carrying
            the camera badge), the name once, one caption, then the standing said
            in words — the chip is what a screen reader gets, since a ring is
            only a summary. */}
        <Card style={styles.hero}>
          <View style={styles.heroInner}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              hitSlop={6}
              onPress={() => {
                feedback.tap()
                setPhotoOpen(true)
              }}
            >
              <Avatar name={headName} uri={photo} size={100} ring="primary" ringGap={3} edit />
            </Pressable>

            <Text style={[textVariants.detailTitle, styles.heroName, { color: t.text }]}>{headName}</Text>
            {!!email && email !== headName && (
              <Text style={[textVariants.captionStrong, styles.heroMeta, { color: t.textSecondary }]}>
                {email}
              </Text>
            )}
            {!!profile?.role && (
              <View style={styles.heroChip}>
                <Chip label={roleLabel(profile.role)} icon="profile" active />
              </View>
            )}
          </View>
        </Card>

        <Section
          title="Your details"
          style={styles.section}
          action={<Button label="Edit" variant="ghost" size="sm" onPress={startEdit} style={styles.edit} />}
        >
          <FactRow
            icon="profile"
            label="Name"
            value={profile?.name}
            addLabel="Add your name"
            onAdd={startEdit}
          />
          <FactRow icon="mail" label="Sign-in email" value={email} />
          <FactRow icon="gst" label="Role" value={roleLabel(profile?.role)} />
        </Section>

        {/* Read-only by design: access is granted per user in the console, and a
            switch here that could not change it would be a lie. */}
        <Section title="What you can open" style={styles.section}>
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

        <Section title="Security" style={styles.section}>
          <SectionRow
            leadingIcon="fingerprint"
            title="Unlock with fingerprint"
            subtitle={
              canBiometric
                ? "Ask for your fingerprint when you come back to the app"
                : "No fingerprint or face is enrolled on this phone"
            }
            chevron={false}
            trailing={
              <Switch
                value={biometricEnabled}
                // Switch fires the toggle haptic itself.
                onValueChange={setBiometricEnabled}
                disabled={!canBiometric}
              />
            }
          />
        </Section>

        <Section title="Appearance" style={styles.section}>
          {/* A bottom sheet, not an expanded radio list: three mutually exclusive
              options is exactly the shape the sheet idiom is for. */}
          <SectionRow
            leadingIcon="theme"
            title="Theme"
            subtitle={themeLabel}
            onPress={() => {
              feedback.tap()
              setThemeOpen(true)
            }}
          />
        </Section>

        <Section style={styles.section} bodyStyle={styles.signOutBody}>
          <SectionRow
            leadingIcon="logout"
            leadingTone="danger"
            title="Sign out"
            danger
            chevron={false}
            onPress={() => setConfirmOut(true)}
          />
        </Section>
      </AppScreen>

      {/* The EDIT sheet. Only what this client is actually allowed to write. */}
      <Sheet visible={editing} onClose={() => !saving && setEditing(false)} title="Edit your details">
        <View style={styles.sheetBody}>
          <TextField
            label="Your name"
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Enter full name"
            autoCapitalize="words"
            autoFocus
          />
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            Your sign-in email and role are managed by an admin in the console.
          </Text>
          <View style={styles.sheetActions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setEditing(false)}
              disabled={saving}
              style={styles.sheetAction}
            />
            <Button label="Save" onPress={saveName} loading={saving} style={styles.sheetAction} />
          </View>
        </View>
      </Sheet>

      {/* The PHOTO sheet the camera badge opens: the subject leads — the same
          face, the same size, as the hero behind it, so the sheet reads as that
          avatar lifted into the hand — then the actions, one line of consequence
          each. */}
      <Sheet visible={photoOpen} onClose={() => !photoBusy && setPhotoOpen(false)} title="Profile photo">
        <View style={styles.photoHead}>
          <Avatar name={headName} uri={photo} size={100} />
        </View>
        <SectionRow
          leadingIcon="image"
          title="Choose from gallery"
          subtitle="Crop it square, and it uploads straight away"
          onPress={pickPhoto}
        />
        {!!photo && (
          <SectionRow
            leadingIcon="trash"
            leadingTone="danger"
            title="Remove photo"
            danger
            onPress={() => setConfirmRemovePhoto(true)}
          />
        )}
      </Sheet>

      <Sheet visible={themeOpen} onClose={() => setThemeOpen(false)} title="Theme">
        <RadioGroup
          options={THEMES}
          value={pref}
          onChange={(next) => {
            feedback.select()
            setPref(next)
            setThemeOpen(false)
          }}
        />
      </Sheet>

      <Dialog
        visible={confirmRemovePhoto}
        onClose={() => setConfirmRemovePhoto(false)}
        title="Remove profile photo?"
        message="Your initials will show in its place."
        actions={[
          { label: "Cancel", onPress: () => setConfirmRemovePhoto(false) },
          { label: "Remove", tone: "danger", onPress: () => void clearPhoto() },
        ]}
      />

      <Dialog
        visible={confirmOut}
        onClose={() => setConfirmOut(false)}
        title="Sign out?"
        message="You will need your password and an emailed code to get back in."
        actions={[
          { label: "Cancel", onPress: () => setConfirmOut(false) },
          {
            label: "Sign out",
            tone: "danger",
            onPress: () => {
              setConfirmOut(false)
              void signOut()
            },
          },
        ]}
      />
    </>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter },
  hero: { marginBottom: spacing.xl },
  heroInner: { alignItems: "center", paddingVertical: spacing.sm },
  heroName: { marginTop: spacing.md, textAlign: "center" },
  heroMeta: { marginTop: spacing.xs, textAlign: "center" },
  heroChip: { marginTop: spacing.md, alignItems: "center" },
  section: { marginBottom: spacing.xl },
  // The final panel: no closing rule under the last row, which would read as a
  // stray separator at the foot of the page.
  signOutBody: { paddingBottom: 0 },
  hint: { marginTop: -spacing.md, marginBottom: spacing.xl, paddingHorizontal: 6 },
  // `sm` plus the negative margins cancels the button's own height above the
  // label line and its horizontal padding, so the LABEL — not the invisible
  // press box — lands on the section's gutter line.
  edit: { marginVertical: -7, marginRight: -spacing.md },
  sheetBody: { paddingHorizontal: gutter, paddingTop: spacing.sm, gap: spacing.md },
  sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  sheetAction: { flex: 1 },
  photoHead: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.lg },
})
