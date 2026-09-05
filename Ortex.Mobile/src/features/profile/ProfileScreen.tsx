import React from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { MODULES, canAccess, roleLabel } from "@/domain/modules"
import { biometricAvailable } from "@/features/auth/useAppLock"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useThemePref, type ThemePref } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Avatar, Button, Card, Chip, Dialog, IconButton, RadioGroup, Switch } from "@/ui"

const THEMES: { key: ThemePref; label: string; description?: string }[] = [
  { key: "system", label: "Match the phone", description: "Follows your device's dark mode setting" },
  { key: "light", label: "Always light" },
  { key: "dark", label: "Always dark" },
]

export default function ProfileScreen({ navigation }: StackScreenProps<"Profile">) {
  const { theme: t, pref, setPref } = useThemePref()
  const insets = useSafeAreaInsets()
  const { profile, session, biometricEnabled, setBiometricEnabled, signOut } = useAuth()
  const [canBiometric, setCanBiometric] = React.useState(false)
  const [confirmOut, setConfirmOut] = React.useState(false)

  React.useEffect(() => {
    void biometricAvailable().then(setCanBiometric)
  }, [])

  const name = profile?.name || session?.user?.email || "Signed in"
  const granted = MODULES.filter((m) => canAccess(profile, m.key))

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.identity}>
          <Avatar name={name} uri={profile?.avatar_url ?? undefined} size="lg" />
          <Text style={[styles.name, { color: t.text }]}>{name}</Text>
          <Text style={[styles.email, { color: t.textSecondary }]}>{session?.user?.email}</Text>
          {!!profile?.role && (
            <View style={styles.roleChip}>
              <Chip label={roleLabel(profile.role)} active />
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: t.textTertiary }]}>What you can open</Text>
        <Card padding={16} style={styles.card}>
          <View style={styles.modules}>
            {granted.map((m) => (
              <Chip key={m.key} label={m.label} small active />
            ))}
          </View>
          <Text style={[styles.hint, { color: t.textTertiary }]}>
            Access is set by an admin in the Ortex console, not here.
          </Text>
        </Card>

        <Text style={[styles.sectionTitle, { color: t.textTertiary }]}>Security</Text>
        <Card padding={16} style={styles.card}>
          <Switch
            value={biometricEnabled}
            onValueChange={(on) => {
              feedback.toggle(on)
              setBiometricEnabled(on)
            }}
            disabled={!canBiometric}
            label="Unlock with fingerprint"
            description={
              canBiometric
                ? "Ask for your fingerprint when you come back to the app"
                : "No fingerprint or face is enrolled on this phone"
            }
          />
        </Card>

        <Text style={[styles.sectionTitle, { color: t.textTertiary }]}>Appearance</Text>
        <Card padding={16} style={styles.card}>
          <RadioGroup options={THEMES} value={pref} onChange={setPref} />
        </Card>

        <View style={styles.signOut}>
          <Button
            label="Sign out"
            variant="danger"
            fullWidth
            icon="logout"
            onPress={() => setConfirmOut(true)}
          />
        </View>
      </ScrollView>

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
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: 12, paddingBottom: 4 },
  content: { paddingHorizontal: 20 },
  identity: { alignItems: "center", paddingTop: 6, paddingBottom: 26 },
  name: { marginTop: 12, fontSize: 22, fontFamily: font.bold },
  email: { marginTop: 2, fontSize: 14, fontFamily: font.regular },
  roleChip: { marginTop: 10 },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    fontFamily: font.semibold,
  },
  card: { marginBottom: 20 },
  modules: { flexDirection: "row", flexWrap: "wrap", marginBottom: 2 },
  hint: { marginTop: 6, fontSize: 12.5, lineHeight: 18, fontFamily: font.regular },
  signOut: { marginTop: 4 },
})
