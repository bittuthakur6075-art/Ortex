import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { supabase, errorMessage } from "@/data/supabase"
import { MODULES, ROLE_LABEL } from "@/domain/modules"
import { emailProblem } from "@/features/contacts/validateContact"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { Button, RadioGroup, Sheet, TextField, useToast } from "@/ui"

/**
 * Invite a colleague — the console's `admin-create-user` function, reachable
 * from the phone.
 *
 * ADMIN-ONLY, ENFORCED ON THE SERVER. The function opens with
 * `requireStaff(req, ["admin"])` and only then touches the service-role key, so
 * a non-admin calling it directly is refused whatever this app renders. The
 * button is hidden for them as a courtesy, not as the control.
 *
 * WHAT IT CREATES, AND WHAT IT DOES NOT. A login with a role and the sales
 * default grants — the four modules this app itself is built around
 * (`voice-leads, enquiries, customers, quotations`), matching the console's
 * SALES_DEFAULT_MODULES. Per-module tailoring, invoices, payments and the
 * catalogue stay in the console: those grants have no surface on the phone, and
 * a form that silently narrowed someone's console access would be worse than
 * one that does not offer it.
 *
 * THE PASSWORD IS SHOWN WHEN THE MAIL DOES NOT GO. The function emails the new
 * user their sign-in details and reports `emailed` honestly; an unconfigured
 * SMTP on the project is not a failed invite — the account exists — so the
 * temporary password is put on screen for the admin to pass on by hand.
 */

/** Ambiguity-free alphabet: no O/0, no l/1 — this gets read aloud down a phone. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

function temporaryPassword(length = 10) {
  let out = ""
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

/** The console's SALES_DEFAULT_MODULES, which is every module this app has. */
/** Supabase's own floor for a password. */
const MIN_PASSWORD = 6
const SALES_DEFAULT = ["voice-leads", "enquiries", "customers", "quotations"]

const ROLES = [
  { key: "sales", label: ROLE_LABEL.sales, description: "The four modules this app is built around" },
  { key: "admin", label: ROLE_LABEL.admin, description: "Everything, in the console as well" },
]

export default function InviteUserSheet({
  visible,
  onClose,
  onInvited,
}: {
  visible: boolean
  onClose: () => void
  onInvited: () => void
}) {
  const t = useTheme()
  const toast = useToast()

  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState("sales")
  const [password, setPassword] = React.useState(temporaryPassword)
  const [busy, setBusy] = React.useState(false)
  const [errors, setErrors] = React.useState<{ name?: string; email?: string; password?: string }>({})
  /** Set when the account was made but the mail did not go: show it, do not lose it. */
  const [handOver, setHandOver] = React.useState<{ email: string; password: string } | null>(null)

  React.useEffect(() => {
    if (!visible) return
    setName("")
    setEmail("")
    setRole("sales")
    setPassword(temporaryPassword())
    setHandOver(null)
  }, [visible])

  const invite = async () => {
    const address = email.trim().toLowerCase()
    // The messages land UNDER the field rather than in a toast: a toast for a
    // field-level mistake makes the person hunt for which input it meant, and it
    // has faded by the time they look. The old test was `includes("@")`, which
    // accepts "@" on its own.
    const found: { name?: string; email?: string; password?: string } = {}
    if (!name.trim()) found.name = "Enter their name — the invite email greets them by it"
    if (!address) found.email = "Enter their email address"
    else found.email = emailProblem(address) ?? undefined
    // Supabase refuses a password under six characters, and the refusal reaches
    // this sheet as a generic edge-function failure with nothing to act on.
    if (password.trim().length < MIN_PASSWORD) found.password = `At least ${MIN_PASSWORD} characters`
    setErrors(found)
    if (found.name || found.email || found.password) {
      feedback.error()
      return
    }
    setBusy(true)
    try {
      const modules = role === "admin" ? [] : SALES_DEFAULT
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: address,
          password,
          name: name.trim(),
          role,
          modules,
          notify: true,
          moduleLabels: MODULES.filter((m) => modules.includes(m.key)).map((m) => m.label),
        },
      })
      // A function that refuses reports it in the BODY as well as the status, and
      // supabase-js turns a non-2xx into a generic FunctionsHttpError — so the
      // body is what carries "Admin access required" rather than "failed".
      const failure = error?.message || (data as { error?: string } | null)?.error
      if (failure) throw new Error(failure)

      feedback.created()
      onInvited()
      if ((data as { emailed?: boolean } | null)?.emailed) {
        toast.show({ message: `Invite sent to ${address}`, tone: "success" })
        onClose()
      } else {
        // The login works; only the mail did not. Keep the sheet open holding
        // the one thing that would otherwise be gone for good.
        setHandOver({ email: address, password })
      }
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not send the invite"), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={() => !busy && onClose()} title="Invite a colleague">
      {handOver ? (
        <View style={styles.form}>
          <Text style={[styles.doneTitle, { color: t.text }]}>Account created</Text>
          <Text style={[styles.doneBody, { color: t.textSecondary }]}>
            The welcome email could not be sent from this project, so pass these on yourself. This
            password is not stored anywhere and will not be shown again.
          </Text>
          <View style={[styles.credentials, { backgroundColor: t.surfaceInset }]}>
            <Text style={[styles.credLabel, { color: t.textTertiary }]}>EMAIL</Text>
            <Text style={[styles.credValue, { color: t.text }]}>{handOver.email}</Text>
            <Text style={[styles.credLabel, { color: t.textTertiary, marginTop: spacing.sm }]}>
              TEMPORARY PASSWORD
            </Text>
            <Text style={[styles.credValue, { color: t.text }]}>{handOver.password}</Text>
          </View>
          <Button label="Done" onPress={onClose} fullWidth />
        </View>
      ) : (
        <View style={styles.form}>
          <TextField
            label="Full Name"
            value={name}
            onChangeText={(v) => {
              setName(v)
              setErrors((e) => ({ ...e, name: undefined }))
            }}
            error={errors.name}
            placeholder="Enter full name"
            autoCapitalize="words"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v)
              setErrors((e) => ({ ...e, email: undefined }))
            }}
            error={errors.email}
            placeholder="Enter email address"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View>
            <Text style={[styles.label, { color: t.textSecondary }]}>Role</Text>
            <RadioGroup options={ROLES} value={role} onChange={setRole} />
          </View>
          <TextField
            label="Temporary Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v)
              setErrors((e) => ({ ...e, password: undefined }))
            }}
            error={errors.password}
            placeholder="Enter temporary password"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Emailed to them with the sign-in link. They can change it once inside."
          />

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={onClose}
              disabled={busy}
              style={styles.action}
            />
            <Button label="Send invite" loading={busy} onPress={() => void invite()} style={styles.action} />
          </View>
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  form: { gap: spacing.md, paddingBottom: spacing.sm },
  label: { marginBottom: 6, fontSize: 13, fontFamily: font.medium },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
  doneTitle: { fontSize: 18, fontFamily: font.bold },
  doneBody: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  credentials: { borderRadius: 16, padding: spacing.md },
  credLabel: { fontSize: 11, letterSpacing: 0.4, fontFamily: font.semibold },
  credValue: { marginTop: 3, fontSize: 16, fontFamily: font.medium },
})
