import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { describeDevice } from "@/domain/sessions"
import { formatDateTime, relativeTime } from "@/domain/format"
import { listSessions, logoutOtherDevices, revokeSession, type LoginSession } from "@/lib/auth"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Badge, Button, Dialog, Section, SectionRow, Spinner, useToast } from "@/ui"

/**
 * Login sessions: every device signed in to this account, with a way to sign
 * any of them out (migration 0063). PORT OF Ortex.Admin/src/pages/profile/SessionsCard.jsx.
 *
 * A signed-out device can no longer refresh its session; the access token it
 * already holds lapses within the hour.
 */
export default function LoginSessionsScreen({ navigation }: StackScreenProps<"LoginSessions">) {
  const t = useTheme()
  const toast = useToast()
  const [sessions, setSessions] = React.useState<LoginSession[] | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState("")

  const load = React.useCallback(async () => {
    const res = await listSessions()
    if ("error" in res) setError(res.error)
    else {
      setError("")
      setSessions(res.sessions)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const revoke = async (id: string) => {
    setBusy(id)
    const res = await revokeSession(id)
    setBusy("")
    if ("error" in res) {
      feedback.error()
      return toast.show({ message: res.error, tone: "danger" })
    }
    feedback.tap()
    toast.show({ message: "That device has been signed out", tone: "success" })
    void load()
  }

  const [confirmOthers, setConfirmOthers] = React.useState(false)
  const revokeOthers = async () => {
    setConfirmOthers(false)
    setBusy("others")
    const res = await logoutOtherDevices()
    setBusy("")
    if ("error" in res) {
      feedback.error()
      return toast.show({ message: res.error, tone: "danger" })
    }
    feedback.tap()
    toast.show({ message: "Signed out of every other device", tone: "success" })
    void load()
  }

  const others = (sessions ?? []).filter((s) => !s.is_current).length

  return (
    <AppScreen title="Login sessions" back onBack={() => navigation.goBack()} inTabs={false} contentStyle={styles.content}>
      <Text style={[textVariants.body, styles.pageText, { color: t.textSecondary }]}>
        Devices signed in to your account. Sign out any you do not recognise, then change your password.
      </Text>

      {error ? (
        <Text style={[textVariants.body, styles.pageText, { color: t.danger }]}>{error}</Text>
      ) : !sessions ? (
        <View style={styles.loading}>
          <Spinner />
        </View>
      ) : (
        <Section title={`${sessions.length} active ${sessions.length === 1 ? "session" : "sessions"}`}>
          {sessions.map((s) => {
            const device = describeDevice(s.user_agent)
            const meta = [
              s.ip && `IP ${s.ip}`,
              `Signed in ${formatDateTime(s.created_at)}`,
              s.is_current ? "Active now" : `Last active ${relativeTime(s.last_active)}`,
            ]
              .filter(Boolean)
              .join(" · ")
            return (
              <SectionRow
                key={s.id}
                leadingIcon={device.kind === "phone" ? "mobile" : "monitor"}
                leadingTone={s.is_current ? "success" : "primary"}
                title={
                  <View style={styles.titleRow}>
                    <Text style={[textVariants.bodyStrong, { color: t.text }]}>{device.label}</Text>
                    {s.is_current && <Badge label="This device" tone="accent" />}
                  </View>
                }
                subtitle={meta}
                trailing={
                  s.is_current ? undefined : (
                    <Button
                      label="Log out"
                      size="sm"
                      variant="outline-danger"
                      loading={busy === s.id}
                      disabled={!!busy && busy !== s.id}
                      onPress={() => void revoke(s.id)}
                    />
                  )
                }
              />
            )
          })}
        </Section>
      )}

      {others > 0 && (
        <View style={styles.action}>
          <Button
            label="Log out all other devices"
            variant="outline-danger"
            fullWidth
            loading={busy === "others"}
            disabled={!!busy && busy !== "others"}
            onPress={() => setConfirmOthers(true)}
          />
        </View>
      )}

      <Dialog
        visible={confirmOthers}
        onClose={() => setConfirmOthers(false)}
        title="Log out all other devices?"
        message="Every other phone and browser will need your password again."
        actions={[
          { label: "Cancel", onPress: () => setConfirmOthers(false) },
          { label: "Log out", tone: "danger", onPress: () => void revokeOthers() },
        ]}
      />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  pageText: { paddingHorizontal: gutter, marginBottom: spacing.md },
  loading: { paddingVertical: spacing.xl, alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  action: { paddingHorizontal: gutter, marginTop: spacing.lg },
})
