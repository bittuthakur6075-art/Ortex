import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { supabase, errorMessage } from "@/data/supabase"
import { MODULES, roleLabel, type Profile } from "@/domain/modules"
import InviteUserSheet from "@/features/profile/InviteUserSheet"
import { callNumber, prettyPhone } from "@/lib/contact"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { AppScreen, Badge, EmptyState, IconButton, Section, SectionRow, Spinner, useToast } from "@/ui"

/**
 * Team — who else is on this Ortex account.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\screens\user\TeamScreen.jsx:
 * the roster as a grouped list, one row per person, standing said in words rather
 * than in colour alone.
 *
 * INVITING IS HERE; MANAGING IS NOT. An admin can create a login from the phone
 * (InviteUserSheet, which calls the console's own `admin-create-user`), because
 * meeting someone who needs an account happens away from a desk. Changing a
 * role, deactivating and deleting stay in the console: those rules live
 * server-side in `admin-manage-user` — an admin cannot disable their own
 * account, deleting cascades `profiles.id` — and a phone that could half-do
 * them would be a second place to get it wrong.
 *
 * ADMIN-ONLY, AND NOT MERELY IN THE UI. `profiles_self_read` (migration 0002) is
 * `id = auth.uid() or is_admin()`, so a Sales Executive asking for the roster gets
 * exactly one row back — themselves. The Profile hub hides the door for them; this
 * says so plainly for anyone who reaches it another way.
 */
export default function TeamScreen({ navigation }: StackScreenProps<"Team">) {
  const t = useTheme()
  const toast = useToast()
  const { profile } = useAuth()

  const [people, setPeople] = React.useState<Profile[]>([])
  const [failed, setFailed] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [inviting, setInviting] = React.useState(false)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        // `select("*")`, NOT a column list. Naming columns makes this screen
        // fail closed on schema drift: `phone` arrived in migration 0021, and
        // against a database that has not run it yet PostgREST rejects the whole
        // request — so the roster came back EMPTY because of one optional field
        // nothing here requires. A star selects what exists; a person with no
        // phone column simply has no phone.
        const { data, error } = await supabase.from("profiles").select("*").order("email")
        if (error) throw error
        if (alive) setPeople((data as Profile[]) || [])
      } catch (e) {
        const message = errorMessage(e, "Could not load the team")
        if (alive) setFailed(message)
        if (alive) toast.show({ message, tone: "danger" })
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [toast, reloadKey])

  // Admins first, then everyone alphabetically — the console's Users list order.
  const roster = React.useMemo(
    () =>
      [...people].sort((a, b) => {
        if ((a.role === "admin") !== (b.role === "admin")) return a.role === "admin" ? -1 : 1
        return (a.name || a.email || "").localeCompare(b.name || b.email || "")
      }),
    [people],
  )

  // What came back IS the answer on access: RLS returns everyone to an admin and
  // only the caller to anybody else, so one row that is you means "not an admin"
  // without the client having to decide that for itself.
  const onlyMe = roster.length === 1 && roster[0]?.id === profile?.id
  const active = roster.filter((p) => p.active !== false)
  const disabled = roster.filter((p) => p.active === false)

  return (
    <AppScreen
      title="Team"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      headerRight={
        profile?.role === "admin" ? (
          <IconButton
            name="add"
            accessibilityLabel="Invite a colleague"
            onPress={() => setInviting(true)}
          />
        ) : undefined
      }
    >
      {loading ? (
        <View style={styles.centre}>
          <Spinner label="Loading the team" />
        </View>
      ) : failed ? (
        // Say WHY. An empty roster and a refused query look identical otherwise,
        // and the two have nothing to do with each other.
        <EmptyState icon="warning" title="Could not load the team" hint={failed} />
      ) : roster.length === 0 ? (
        <EmptyState
          icon="customer"
          title="No one to show"
          hint="The account has no other logins yet."
        />
      ) : (
        <>
          <Section title={`Active · ${active.length}`}>
            {active.map((p) => (
              <PersonRow key={p.id} person={p} you={p.id === profile?.id} />
            ))}
          </Section>

          {disabled.length > 0 && (
            <Section title={`Deactivated · ${disabled.length}`}>
              {disabled.map((p) => (
                <PersonRow key={p.id} person={p} you={p.id === profile?.id} />
              ))}
            </Section>
          )}

          <Text style={[styles.note, { color: t.textTertiary }]}>
            {onlyMe
              ? "Only your own account is visible. Ask an administrator to see the rest of the team."
              : "Logins, roles and module access are managed in the Ortex console."}
          </Text>
        </>
      )}

      <InviteUserSheet
        visible={inviting}
        onClose={() => setInviting(false)}
        onInvited={() => setReloadKey((n) => n + 1)}
      />
    </AppScreen>
  )
}

/**
 * One person. The subtitle carries what an admin actually opens this list to
 * check — the role, and how much of the app that role can reach — rather than
 * repeating the email that is already the row's own fallback title.
 */
function PersonRow({ person, you }: { person: Profile; you: boolean }) {
  const name = person.name?.trim() || person.email || "Unnamed"
  const granted = person.role === "admin" ? MODULES.length : (person.modules || []).length
  const reach = person.role === "admin" ? "Everything" : `${granted} of ${MODULES.length} modules`
  const phone = String(person.phone || "").replace(/\D/g, "")

  return (
    <SectionRow
      leadingIcon="profile"
      leadingTone={person.active === false ? "danger" : "primary"}
      title={you ? `${name} (you)` : name}
      subtitle={`${roleLabel(person.role) || "No role"} · ${reach}`}
      chevron={!!phone}
      onPress={phone ? () => void callNumber(person.phone || "") : undefined}
      accessibilityLabel={
        phone ? `${name}, ${roleLabel(person.role)}. Call ${prettyPhone(person.phone || "")}` : undefined
      }
      trailing={person.active === false ? <Badge label="Off" tone="danger" /> : undefined}
    />
  )
}

const styles = StyleSheet.create({
  centre: { paddingVertical: spacing.xxxl, alignItems: "center" },
  note: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: font.regular,
  },
})
