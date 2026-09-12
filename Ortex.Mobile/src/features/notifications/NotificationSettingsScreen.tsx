import React from "react"
import { Linking, StyleSheet, Text, View } from "react-native"

import { NOTIFICATION_SETTINGS } from "@/domain/notifications"
import { feedback } from "@/lib/feedback"
import { setNotificationPrefs, useNotificationStore } from "@/lib/notificationStore"
import { dismissAll, ensurePushPermission, pushPermissionGranted } from "@/lib/push"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Panel, Section, SectionRow, Switch } from "@/ui"

/**
 * What the phone is allowed to interrupt a rep about.
 *
 * Two separate switches live here and they mean different things, which is why
 * the OS permission is shown as its own row rather than folded into the master
 * toggle: turning notifications off in the app stops the phone announcing
 * anything while keeping every lead listed on the Notifications screen, whereas
 * the OS permission is the rep's own system-level decision and can only be
 * changed in Settings once it has been refused. Conflating the two produces the
 * classic bug — an in-app switch that is on while the shade stays silent, with
 * nothing on screen to explain it.
 */
export default function NotificationSettingsScreen({
  navigation,
}: StackScreenProps<"NotificationSettings">) {
  const t = useTheme()
  const { prefs } = useNotificationStore()
  const [granted, setGranted] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    void pushPermissionGranted().then(setGranted)
  }, [])

  const toggleMaster = (on: boolean) => {
    feedback.toggle(on)
    setNotificationPrefs({ enabled: on })
    // Muting should clear what is already in the shade, or the rep silences the
    // app and still has nine notifications to swipe away.
    if (!on) void dismissAll()
    else void ensurePushPermission().then(setGranted)
  }

  return (
    <AppScreen
      title="Notifications"
      subtitle="What this phone tells you about"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      inset
    >
      <Section title="Alerts">
        <SectionRow
          title="Notify me"
          subtitle={prefs.enabled ? "Leads are announced as they arrive" : "Muted on this phone"}
          leadingIcon="bell"
          trailing={<Switch value={prefs.enabled} onValueChange={toggleMaster} />}
          chevron={false}
        />
        {granted === false && (
          <SectionRow
            title="Allowed by Android"
            subtitle="Turned off in system settings — tap to open them"
            leadingIcon="warning"
            leadingTone="warning"
            onPress={() => void Linking.openSettings()}
          />
        )}
      </Section>

      <Section title="What to announce">
        {NOTIFICATION_SETTINGS.map((s) => (
          <SectionRow
            key={s.key}
            title={s.label}
            subtitle={s.hint}
            trailing={
              <Switch
                value={prefs[s.key]}
                disabled={!prefs.enabled}
                onValueChange={(on) => {
                  feedback.toggle(on)
                  setNotificationPrefs({ [s.key]: on })
                }}
              />
            }
            chevron={false}
          />
        ))}
      </Section>

      <Panel padded>
        <Text style={[textVariants.small, { color: t.textTertiary }]}>
          Notifications are worked out on this phone from the leads it has already loaded, so they
          arrive while the app is running. Invoices, payments and the sales pipeline stay in the
          console and are not announced here.
        </Text>
      </Panel>

      <View style={styles.footer} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  footer: { height: spacing.xl, paddingHorizontal: gutter },
})
