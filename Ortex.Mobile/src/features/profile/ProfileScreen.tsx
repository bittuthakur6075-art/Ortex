/**
 * ProfileScreen — who is signed in on this phone, and the switches that belong
 * to the phone rather than to the account.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\screens\user\ProfileScreen.jsx,
 * whose layout came out of a Mobbin sweep of fintech profile screens (Kraken,
 * Monzo, Binance, CVS, Cleo). The moves that survey paid for, kept here:
 *
 *   CENTERED HERO — avatar, then the name ONCE, then one meta caption, then a
 *   single chip, all on the centre line. The old screen said the name and then
 *   the email as a second line of the same size, and parked the role chip in a
 *   left-aligned row that read as a web port.
 *
 *   ICON-LED ROWS — every destination is a `SectionRow` with a leading glyph in
 *   a round well (ui/Section.tsx), never a bare label/value stack.
 *
 * THIS SCREEN IS NOW A HUB. The facts about the account — name, phone, email,
 * role, module access — moved to AccountDetailsScreen, one tap away, because a
 * record you read and correct and a set of device switches you flip are two
 * different jobs and they were sharing one scroll. What stays here is what is
 * true of THIS HANDSET: the photo, the fingerprint lock, the theme, signing out.
 */

import * as ImagePicker from "expo-image-picker"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { supabase } from "@/data/supabase"
import { roleLabel } from "@/domain/modules"
import { APP_CREDIT, APP_VERSION } from "@/constants/app"
import { biometricAvailable } from "@/features/auth/useAppLock"
import { MAX_AVATAR_MB, base64Bytes, removeAvatar, uploadAvatar } from "@/lib/avatarUpload"
import { feedback } from "@/lib/feedback"
import { useNotificationStore } from "@/lib/notificationStore"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useThemePref, type ThemePref } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  Chip,
  Dialog,
  RadioGroup,
  Section,
  SectionRow,
  Sheet,
  Switch,
  useToast,
} from "@/ui"

const THEMES: { key: ThemePref; label: string; description?: string }[] = [
  { key: "system", label: "Match the phone", description: "Follows your device's dark mode setting" },
  { key: "light", label: "Always light" },
  { key: "dark", label: "Always dark" },
]

export default function ProfileScreen({ navigation }: StackScreenProps<"Profile">) {
  const { theme, pref, setPref } = useThemePref()
  const t = theme.colors
  const toast = useToast()
  const { profile, session, biometricEnabled, setBiometricEnabled, refreshProfile, signOut } = useAuth()
  const { prefs: notificationPrefs } = useNotificationStore()

  const [canBiometric, setCanBiometric] = React.useState(false)
  const [confirmOut, setConfirmOut] = React.useState(false)
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
  const themeLabel = THEMES.find((o) => o.key === pref)?.label ?? ""

  /**
   * Pick a photo and upload it. `allowsEditing` + a 1:1 aspect makes the picker
   * itself do the square crop the console does on a canvas, so what is uploaded
   * already matches the circle it will be drawn in. Android 13+'s photo picker
   * needs no permission prompt.
   */
  const pickPhoto = async () => {
    const userId = session?.user?.id
    if (!userId) return
    // Asked for explicitly: a denied library makes `launchImageLibraryAsync`
    // return a plain `canceled`, which is indistinguishable from backing out —
    // the picker seems to open and nothing happens. Same check as the product
    // photo picker in features/products/ProductEditorScreen.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      feedback.warn()
      toast.show({
        message: "Ortex needs access to your photos. Allow it in Settings",
        tone: "danger",
      })
      return
    }
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
      toast.show({ message: `That photo is over ${MAX_AVATAR_MB}MB. Pick a smaller one`, tone: "danger" })
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
      <AppScreen
        title="Profile"
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        contentStyle={styles.content}
      >
        {/* THE HERO. Everything on the centre line: the face (tappable, carrying
            the camera badge), the name once, one caption, then the standing said
            in words — the chip is what a screen reader gets, since a ring is
            only a summary. */}
        <View style={[styles.hero, { backgroundColor: t.surface }]}>
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
        </View>
        <View style={[styles.heroRule, { backgroundColor: t.divider }]} />

        <Section title="Account">
          <SectionRow
            leadingIcon="profile"
            title="Account details"
            subtitle="Name, phone, email and access"
            onPress={() => {
              feedback.tap()
              navigation.navigate("AccountDetails")
            }}
          />
          {/* Always shown. The gate is `profiles_self_read` (migration 0002) —
              `id = auth.uid() or is_admin()` — so a Sales Executive opening this
              gets their own row and nobody else's, which the screen says out
              loud. Hiding the row on the client's copy of `role` instead meant a
              profile that loaded a beat late took the door with it. */}
          <SectionRow
            leadingIcon="customer"
            title="Team"
            subtitle="Who can sign in, and what they reach"
            onPress={() => {
              feedback.tap()
              navigation.navigate("Team")
            }}
          />
          <SectionRow
            leadingIcon="lock"
            title="Change password"
            subtitle="Set a new sign-in password"
            onPress={() => {
              feedback.tap()
              navigation.navigate("ChangePassword")
            }}
          />
        </Section>

        <Section title="Alerts">
          <SectionRow
            leadingIcon="bell"
            title="Notifications"
            subtitle={
              notificationPrefs.enabled
                ? "New enquiries, voice leads and quotation reminders"
                : "Muted on this phone"
            }
            onPress={() => {
              feedback.tap()
              navigation.navigate("NotificationSettings")
            }}
          />
        </Section>

        <Section title="Security">
          <SectionRow
            leadingIcon="fingerprint"
            title="Fingerprint unlock"
            subtitle={
              canBiometric
                ? "Asked for when you return to Ortex"
                : "No fingerprint enrolled on this phone"
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

        <Section title="Appearance">
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

        {/* The published terms, carried locally (features/profile/legal.ts) so
            they open on a warehouse floor with no signal. */}
        <Section title="Legal">
          <SectionRow
            leadingIcon="lock"
            title="Privacy policy"
            subtitle="What Ortex stores, and why"
            onPress={() => navigation.navigate("Legal", { doc: "privacy" })}
          />
          <SectionRow
            leadingIcon="quote"
            title="Terms of service"
            subtitle="The rules for using this app"
            onPress={() => navigation.navigate("Legal", { doc: "terms" })}
          />
        </Section>

        <Section style={styles.signOutSection} bodyStyle={styles.signOutBody}>
          <SectionRow
            leadingIcon="logout"
            leadingTone="danger"
            title="Sign out"
            danger
            chevron={false}
            onPress={() => setConfirmOut(true)}
          />
        </Section>

        {/* The foot of the page: which build this is — the first thing asked for
            when something behaves oddly in the field — and whose app it is. */}
        <View style={styles.foot}>
          <Text style={[textVariants.captionStrong, { color: t.textTertiary }]}>
            Version {APP_VERSION}
          </Text>
          <Text style={[textVariants.caption, styles.footCredit, { color: t.textTertiary }]}>
            {APP_CREDIT}
          </Text>
        </View>
      </AppScreen>

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
          subtitle="Cropped square, uploads straight away"
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
  // One white sheet: the hero heads it and every Section follows, each parted
  // from the next by the 2dp band each panel draws (ui/Section.tsx).
  content: { paddingTop: 0, paddingBottom: spacing.md },
  hero: { paddingHorizontal: gutter },
  heroRule: { height: StyleSheet.hairlineWidth, marginHorizontal: gutter },
  heroInner: { alignItems: "center", paddingTop: spacing.md, paddingBottom: spacing.xl },
  heroName: { marginTop: spacing.md, textAlign: "center" },
  heroMeta: { marginTop: spacing.xs, textAlign: "center" },
  heroChip: { marginTop: spacing.md, alignItems: "center" },
  // The final panel: no closing rule under the last row, which would read as a
  // stray separator at the foot of the page.
  // Sign out is not one more setting: a clear step of air parts it from the
  // menu above, so it is never the row a thumb lands on by momentum.
  signOutSection: { marginTop: spacing.xl },
  signOutBody: { paddingBottom: 0 },
  foot: { alignItems: "center", paddingTop: spacing.xl, paddingHorizontal: gutter, gap: 3 },
  footCredit: { textAlign: "center" },
  photoHead: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.lg },
})
