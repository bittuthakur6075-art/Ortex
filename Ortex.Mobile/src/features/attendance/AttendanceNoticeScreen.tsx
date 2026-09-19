import { Camera } from "expo-camera"
import React from "react"
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { markNoticeSeen } from "@/features/attendance/useAttendance"
import { loadSettings, requestLocationPermission } from "@/lib/attendance"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Button from "@/ui/Button"
import Icon, { type IconName } from "@/ui/Icon"

const FALLBACK_NOTICE =
  "When you clock in or out, Ortex records a selfie, your location at that moment, and the time from our server. We use it only to keep attendance for pay. Your location is never tracked at other times."

/**
 * Before the first clock-in on this handset: what is recorded and why (the DPDP
 * notice, plan §2.5, written by the Super Admin in settings), then the two
 * permissions, each explained before Android asks (World App reference). Shown
 * once per person per phone.
 */
export default function AttendanceNoticeScreen({ navigation, route }: StackScreenProps<"AttendanceNotice">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const [notice, setNotice] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)
  const [blocked, setBlocked] = React.useState<string | null>(null)

  React.useEffect(() => {
    void loadSettings().then((s) => setNotice(s.notice || FALLBACK_NOTICE))
  }, [])

  const proceed = async () => {
    setBusy(true)
    setBlocked(null)
    try {
      const cam = await Camera.requestCameraPermissionsAsync()
      if (!cam.granted) {
        setBlocked(cam.canAskAgain ? "Ortex needs the camera for your clock-in selfie." : "camera")
        return
      }
      const loc = await requestLocationPermission()
      if (!loc.granted) {
        setBlocked(loc.canAskAgain ? "Ortex needs your location to check you are at the office." : "location")
        return
      }
      await markNoticeSeen(session?.user?.id)
      feedback.tap()
      navigation.replace("AttendanceClock", { kind: route.params.kind })
    } finally {
      setBusy(false)
    }
  }

  const permanentlyBlocked = blocked === "camera" || blocked === "location"

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.badge, { backgroundColor: t.primary10 }]}>
          <Icon name="calendar" size={28} color={t.primary} variant="Bulk" />
        </View>
        <Text style={[textVariants.largeTitle, { color: t.text }]}>Before you clock in</Text>
        <Text style={[textVariants.body, { color: t.textSecondary }]}>{notice || FALLBACK_NOTICE}</Text>

        <View style={styles.rows}>
          <Explain icon="camera" title="Camera" body="For your clock-in selfie, so attendance is marked by you." />
          <Explain icon="address" title="Location" body="Checked only at the moment you clock in or out. Never tracked." />
        </View>

        {!!blocked && (
          <View style={[styles.warn, { backgroundColor: t.warningBg }]}>
            <Text style={[textVariants.small, { color: t.warningText }]}>
              {permanentlyBlocked
                ? `${blocked === "camera" ? "Camera" : "Location"} is turned off for Ortex. Turn it on in Settings to clock in.`
                : blocked}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {permanentlyBlocked ? (
          <Button label="Open settings" fullWidth onPress={() => void Linking.openSettings()} />
        ) : (
          <Button label="Continue" fullWidth loading={busy} onPress={() => void proceed()} />
        )}
        <Button label="Not now" variant="ghost" fullWidth onPress={() => navigation.goBack()} />
      </View>
    </View>
  )
}

function Explain({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const t = useTheme()
  return (
    <View style={styles.explain}>
      <View style={[styles.well, { backgroundColor: t.iconWell }]}>
        <Icon name={icon} size={20} color={t.primary} variant="Bulk" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[textVariants.listTitle, { color: t.text }]}>{title}</Text>
        <Text style={[textVariants.small, { color: t.textSecondary }]}>{body}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: gutter, paddingTop: spacing.xxl, gap: spacing.md },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  rows: { gap: spacing.lg, marginTop: spacing.md },
  explain: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  well: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  warn: { borderRadius: radius.card, padding: spacing.md, marginTop: spacing.sm },
  footer: { paddingHorizontal: gutter, gap: spacing.xs, paddingTop: spacing.sm },
})
