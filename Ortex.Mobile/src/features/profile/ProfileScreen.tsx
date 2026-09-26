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
import { canAccess, isAdmin } from "@/domain/modules"
import { hasDefaults } from "@/domain/quotationDefaults"
import { APP_CREDIT, APP_VERSION } from "@/constants/app"
import { biometricAvailable } from "@/features/auth/useAppLock"
import ProfileMe from "@/features/profile/ProfileMe"
import Icon from "@/ui/Icon"
import { Card, CardRow, CardRows, SubHeader, Tag } from "@/ui/OneUi"
import { MAX_AVATAR_MB, base64Bytes, removeAvatar, uploadAvatar } from "@/lib/avatarUpload"
import { feedback } from "@/lib/feedback"
import { useNotificationStore } from "@/lib/notificationStore"
import { useQuotationDefaults } from "@/lib/quotationDefaults"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useThemePref, type ThemePref } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { fontFamily, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  Dialog,
  SegmentedControl,
  SectionRow,
  Sheet,
  Switch,
  useToast,
} from "@/ui"

const SINCE_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
})

const THEMES: { key: ThemePref; short: string }[] = [
  { key: "system", short: "Auto" },
  { key: "light", short: "Light" },
  { key: "dark", short: "Dark" },
]

export default function ProfileScreen({ navigation }: StackScreenProps<"Profile">) {
  const { theme, pref, setPref } = useThemePref()
  const t = theme.colors
  const toast = useToast()
  const { profile, session, biometricEnabled, setBiometricEnabled, refreshProfile, signOut } = useAuth()
  const { prefs: notificationPrefs } = useNotificationStore()
  const { defaults: quoteDefaults } = useQuotationDefaults()

  const [canBiometric, setCanBiometric] = React.useState(false)
  const [confirmOut, setConfirmOut] = React.useState(false)
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
  const phone = profile?.phone?.trim() || ""
  const admin = isAdmin(profile)
  const signedIn = session?.user?.last_sign_in_at
  const signedInSince = signedIn ? SINCE_DAY.format(new Date(signedIn)) : ""
  const openAccount = () => {
    feedback.tap()
    navigation.navigate("AccountDetails")
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
        inset
        contentStyle={styles.content}
      >
        <ProfileMe
          name={headName}
          email={email}
          photo={photo}
          role={profile?.role}
          joined={profile?.created_at}
          onPhoto={() => setPhotoOpen(true)}
          onOpen={(screen) => navigation.navigate(screen)}
        />

        {/* The one thing only this person can fix, shown only while it is missing. */}
        {!phone && (
          <Card tone="warning">
            <CardRow
              leading={
                <View style={[styles.nudgeWell, { backgroundColor: t.surfaceRaised }]}>
                  <Icon name="callAdd" size={19} color={t.warningText} variant="Bulk" />
                </View>
              }
              title="Add your phone number"
              subtitle="So customers and the team can call you"
              subtitleTone="warning"
              chevron={false}
              trailing={
                <Text
                  onPress={openAccount}
                  suppressHighlighting
                  style={[styles.addBtn, { backgroundColor: t.surfaceRaised, color: t.warningText }]}
                >
                  Add
                </Text>
              }
              onPress={openAccount}
            />
          </Card>
        )}

        <SubHeader title="Account" />
        <Card>
          <CardRows>
            <CardRow
              icon="userEdit"
              title="Account details"
              subtitle={phone ? `${phone} · ${email}` : "Phone number missing"}
              subtitleTone={phone ? undefined : "warning"}
              onPress={openAccount}
            />
            <CardRow
              icon="password"
              title="Change password"
              subtitle="Set a new sign-in password"
              onPress={() => navigation.navigate("ChangePassword")}
            />
            {/* Always shown. The gate is `profiles_self_read` (migration 0002):
                an admin gets everyone, anyone else gets their own row. */}
            <CardRow
              icon={admin ? "team" : "access"}
              title={admin ? "Team" : "Your access"}
              subtitle={admin ? "Who can sign in, and what they reach" : "What your role lets you open"}
              onPress={() => navigation.navigate("Team")}
            />
          </CardRows>
        </Card>

        {canAccess(profile, "quotations") && (
          <>
            <SubHeader title="Quotations" />
            <Card>
              <CardRow
                icon="quoteDefaults"
                title="Quotation defaults"
                subtitle={
                  hasDefaults(quoteDefaults)
                    ? "Your own payment terms, T&C and notes"
                    : "The company's terms, until you set yours"
                }
                trailing={hasDefaults(quoteDefaults) ? <Tag label="Yours" tone="success" /> : undefined}
                onPress={() => navigation.navigate("QuotationDefaults")}
              />
            </Card>
          </>
        )}

        <SubHeader title="This phone" />
        <Card>
          <CardRows>
            <CardRow
              icon="bell"
              title="Notifications"
              subtitle={notificationPrefs.enabled ? "Leads, quotes and chat" : "Muted on this phone"}
              trailing={
                notificationPrefs.enabled ? <Tag label="On" tone="success" dot /> : <Tag label="Off" />
              }
              onPress={() => navigation.navigate("NotificationSettings")}
            />
            <CardRow
              icon="fingerprint"
              title="Fingerprint unlock"
              subtitle={
                canBiometric ? "Asked for when you come back" : "No fingerprint enrolled on this phone"
              }
              chevron={false}
              trailing={
                <Switch
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                  disabled={!canBiometric}
                />
              }
            />
            {/* Three choices, always visible: one tap instead of a sheet. */}
            <CardRow
              icon="swatch"
              title="Theme"
              chevron={false}
              trailing={
                <View style={styles.theme}>
                  <SegmentedControl
                    options={THEMES.map((o) => ({ key: o.key, label: o.short }))}
                    value={pref}
                    onChange={(next) => {
                      feedback.select()
                      setPref(next)
                    }}
                  />
                </View>
              }
            />
          </CardRows>
        </Card>

        <SubHeader title="Help and about" />
        <Card>
          <CardRows>
            <CardRow
              icon="assistant"
              tone="violet"
              title="Ask Anu how to…"
              subtitle="Leave kaise apply karun?"
              onPress={() => navigation.navigate("Anu", { ask: "Leave kaise apply karun?" })}
            />
            <CardRow
              icon="gift"
              title="What's new"
              subtitle={`Version ${APP_VERSION}`}
              trailing={<Tag label="New" tone="primary" />}
              onPress={() => navigation.navigate("WhatsNew")}
            />
            {/* The published terms, carried locally (features/profile/legal.ts) so
                they open on a warehouse floor with no signal. */}
            <CardRow
              icon="shield"
              title="Privacy policy"
              subtitle="What Ortex stores, and why"
              onPress={() => navigation.navigate("Legal", { doc: "privacy" })}
            />
            <CardRow
              icon="quote"
              title="Terms of service"
              subtitle="The rules for using this app"
              onPress={() => navigation.navigate("Legal", { doc: "terms" })}
            />
          </CardRows>
        </Card>

        {/* Sign out alone in its own card, red, away from anything a thumb scrolls onto. */}
        <Pressable
          onPress={() => {
            feedback.tap()
            setConfirmOut(true)
          }}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.signOut,
            { backgroundColor: t.surfaceRaised, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name="logout" size={20} color={t.dangerText} variant="Bulk" />
          <Text style={[styles.signOutText, { color: t.dangerText }]}>Sign out</Text>
        </Pressable>

        {/* The foot: which build this is, the first thing asked for when something
            behaves oddly in the field, and when this phone signed in. */}
        <View style={styles.foot}>
          <Text style={[textVariants.caption, styles.footCredit, { color: t.textTertiary }]}>
            {`Ortex ${APP_VERSION}${
              signedInSince ? ` · signed in on this phone since ${signedInSince}` : ""
            }`}
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
  content: { paddingTop: 0, paddingBottom: spacing.md },
  theme: { width: 184 },
  nudgeWell: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  addBtn: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontFamily: fontFamily.semibold,
    fontSize: 14,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 24,
    paddingVertical: 16,
  },
  signOutText: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20 },
  foot: { alignItems: "center", paddingTop: spacing.lg, paddingHorizontal: gutter, gap: 3 },
  footCredit: { textAlign: "center" },
  photoHead: { alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.lg },
})
