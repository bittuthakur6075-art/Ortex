import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { supabase, errorMessage } from "@/data/supabase"
import { formatDate, relativeTime } from "@/domain/format"
import { ROLE_ORDER, ROLE_TONE, isAdmin as isAdminRole, isSuperAdmin, roleLabel, type Profile, type Role } from "@/domain/modules"
import InviteUserSheet from "@/features/profile/InviteUserSheet"
import { callNumber } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing, state } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  ChipGroup,
  EmptyState,
  Icon,
  IconButton,
  ListRefreshControl,
  RowSeparator,
  SearchField,
  SkeletonList,
  useToast,
  type ChipOption,
} from "@/ui"

/**
 * Team — who else is on this Ortex account. A full page, the phone's version of
 * the console's /users table.
 *
 *   · a summary strip (people, active, admins, deactivated) that doubles as the
 *     answer to "is anyone locked out?" before a row is read
 *   · search over name, email and phone, and a filter rail with counts
 *   · one row per person: their own photo (`profiles.avatar_url`, initials when
 *     none) with a live dot, name, email, then role · module reach · when they
 *     last changed anything (from `audit_log`), standing said in words
 *
 * INVITING, ENABLING AND RESETTING ARE HERE; THE REST IS NOT. InviteUserSheet is
 * the console's `admin-create-user`; a row opens UserDetailScreen — the
 * console's /users/:id — which deactivates, reactivates and resets passwords
 * through `admin-manage-user`, where the rules live. Role/module edits and
 * deleting a login stay in the console.
 *
 * ADMIN-ONLY, AND NOT MERELY IN THE UI. `profiles_self_read` (0002) is
 * `id = auth.uid() or is_admin()`, so a Sales Executive gets exactly one row
 * back — themselves — and the page says so.
 */

type Filter = "all" | "active" | "admin" | "accounts" | "sales" | "staff" | "off"
type Activity = Record<string, { at: string; count: number }>

export default function TeamScreen({ navigation }: StackScreenProps<"Team">) {
  const t = useTheme()
  const toast = useToast()
  const { profile } = useAuth()
  const isAdmin = isAdminRole(profile)

  const [people, setPeople] = React.useState<Profile[]>([])
  const [activity, setActivity] = React.useState<Activity>({})
  const [failed, setFailed] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("all")
  const [inviting, setInviting] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      // `select("*")`, NOT a column list: `phone` arrived in migration 0021, and
      // naming it fails the WHOLE read against a project that has not run it.
      const [{ data, error }, recent] = await Promise.all([
        supabase.from("profiles").select("*").order("email"),
        // Nice to have, never a reason for the roster to fail.
        repo.lastActivityByActor().catch(() => ({}) as Activity),
      ])
      if (error) throw error
      setPeople((data as Profile[]) || [])
      setActivity(recent)
      setFailed(null)
    } catch (e) {
      const message = errorMessage(e, "Could not load the team")
      setFailed(message)
      toast.show({ message, tone: "danger" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  // Load on every focus: coming back from a user's page after deactivating them
  // should show the new standing without a pull. The first focus is the mount.
  React.useEffect(() => navigation.addListener("focus", () => void load()), [navigation, load])

  const roster = React.useMemo(
    () =>
      [...people].sort((a, b) => {
        // Active before deactivated, then by role (Super Admin first), then by name.
        if ((a.active === false) !== (b.active === false)) return a.active === false ? 1 : -1
        const ra = ROLE_ORDER.indexOf(a.role as Role)
        const rb = ROLE_ORDER.indexOf(b.role as Role)
        if (ra !== rb) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb)
        return (a.name || a.email || "").localeCompare(b.name || b.email || "")
      }),
    [people],
  )

  const counts = React.useMemo(
    () => ({
      all: roster.length,
      active: roster.filter((p) => p.active !== false).length,
      admin: roster.filter((p) => isAdminRole(p)).length,
      accounts: roster.filter((p) => p.role === "accounts").length,
      sales: roster.filter((p) => p.role === "sales").length,
      staff: roster.filter((p) => p.role === "staff").length,
      off: roster.filter((p) => p.active === false).length,
    }),
    [roster],
  )

  const needle = query.trim().toLowerCase()
  const digits = needle.replace(/\D/g, "")
  const shown = roster.filter((p) => {
    if (filter === "active" && p.active === false) return false
    if (filter === "off" && p.active !== false) return false
    if (filter === "admin" && !isAdminRole(p)) return false
    if ((filter === "accounts" || filter === "sales" || filter === "staff") && p.role !== filter) return false
    if (!needle) return true
    return (
      (p.name || "").toLowerCase().includes(needle) ||
      (p.email || "").toLowerCase().includes(needle) ||
      (!!digits && String(p.phone || "").includes(digits))
    )
  })

  const filters: ChipOption<Filter>[] = [
    { key: "all", label: `All ${counts.all}` },
    { key: "active", label: `Active ${counts.active}` },
    { key: "admin", label: `Admins ${counts.admin}` },
    // One chip per role that someone actually holds, so an all-sales team is not
    // offered three empty filters.
    ...(counts.accounts ? [{ key: "accounts" as const, label: `Accounts ${counts.accounts}` }] : []),
    ...(counts.sales ? [{ key: "sales" as const, label: `Sales ${counts.sales}` }] : []),
    ...(counts.staff ? [{ key: "staff" as const, label: `Staff ${counts.staff}` }] : []),
    ...(counts.off ? [{ key: "off" as const, label: `Deactivated ${counts.off}`, tint: t.danger }] : []),
  ]

  const onlyMe = roster.length === 1 && roster[0]?.id === profile?.id

  const open = (p: Profile) => {
    feedback.tap()
    if (isAdmin) navigation.navigate("UserDetail", { id: p.id! })
    else if (p.phone) void callNumber(p.phone)
  }

  const header = loading || failed || roster.length === 0 ? null : (
    <View>
      <View style={styles.stats}>
        <Stat icon="customer" label="People" value={counts.all} tone="primary" />
        <Stat icon="tick" label="Active" value={counts.active} tone="success" />
        <Stat icon="lock" label="Admins" value={counts.admin} tone="primary" />
        <Stat icon="warning" label="Off" value={counts.off} tone={counts.off ? "danger" : "muted"} />
      </View>
      {onlyMe && (
        <Text style={[textVariants.small, styles.notice, { color: t.warningText, backgroundColor: t.warningBg }]}>
          Only your own account is visible. Ask an administrator to see the rest of the team.
        </Text>
      )}
      <RowSeparator />
    </View>
  )

  return (
    <>
      <AppScreen
        title="Team"
        subtitle={loading ? "Loading…" : `${counts.all} ${counts.all === 1 ? "person" : "people"} · ${counts.active} active`}
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        headerRight={
          isAdmin ? (
            <IconButton name="add" accessibilityLabel="Invite a colleague" onPress={() => setInviting(true)} />
          ) : undefined
        }
        list={{
          data: loading || failed ? [] : shown,
          keyExtractor: (p: unknown) => (p as Profile).id!,
          refreshControl: (
            <ListRefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void load()
              }}
            />
          ),
          ListHeaderComponent: header,
          ItemSeparatorComponent: RowSeparator,
          ListFooterComponent:
            shown.length > 0 ? (
              <View>
                <RowSeparator />
                <Text style={[textVariants.caption, styles.footer, { color: t.textTertiary }]}>
                  {isAdmin
                    ? isSuperAdmin(profile)
                      ? "Tap a person for their activity, to deactivate them or to reset their password. Roles and module access are edited in the Ortex console."
                      : "Tap a person for their activity, to deactivate them or to reset their password. Admin accounts are managed by the Super Admin. Roles and module access are edited in the Ortex console."
                    : "Roles and module access are managed by an administrator in the Ortex console."}
                </Text>
              </View>
            ) : null,
          ListEmptyComponent: loading ? (
            <SkeletonList count={6} leading="avatar" leadingSize={48} />
          ) : failed ? (
            <EmptyState
              icon="warning"
              title="Could not load the team"
              hint={failed}
              actionLabel="Try again"
              onAction={() => void load()}
            />
          ) : roster.length === 0 ? (
            <EmptyState icon="customer" title="No one to show" hint="The account has no logins yet." />
          ) : (
            <EmptyState
              icon="search"
              title="No one matches"
              hint={needle ? `Nobody on the team matches “${query.trim()}”.` : "Nobody in this group."}
              actionLabel="Clear filters"
              onAction={() => {
                setQuery("")
                setFilter("all")
              }}
            />
          ),
          renderItem: ({ item }: { item: unknown }) => {
            const p = item as Profile
            return (
              <PersonRow
                person={p}
                you={p.id === profile?.id}
                lastAt={activity[p.id!]?.at}
                onPress={isAdmin || p.phone ? () => open(p) : undefined}
              />
            )
          },
        }}
      >
        <View style={styles.tools}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search name, email or phone" />
        </View>
        {roster.length > 1 && <ChipGroup options={filters} value={filter} onChange={setFilter} />}
      </AppScreen>

      <InviteUserSheet visible={inviting} onClose={() => setInviting(false)} onInvited={() => void load()} />
    </>
  )
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentProps<typeof Icon>["name"]
  label: string
  value: number
  tone: "primary" | "success" | "danger" | "muted"
}) {
  const t = useTheme()
  const ink = { primary: t.primary, success: t.success, danger: t.danger, muted: t.textTertiary }[tone]
  const well = { primary: t.iconWell, success: t.successBg, danger: t.dangerBg, muted: t.surface }[tone]
  return (
    <View style={[styles.stat, { backgroundColor: t.surfaceInset }]}>
      <View style={[styles.statWell, { backgroundColor: well }]}>
        <Icon name={icon} size={16} color={ink} variant="Bulk" />
      </View>
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      <Text style={[textVariants.caption, { color: t.textTertiary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/**
 * One person. Two lines under the name because an admin opens this list to
 * check three things at once — who, can they sign in, and are they actually
 * using it — and a single truncated subtitle could only answer one.
 */
function PersonRow({
  person,
  you,
  lastAt,
  onPress,
}: {
  person: Profile
  you: boolean
  lastAt?: string
  onPress?: () => void
}) {
  const t = useTheme()
  const name = person.name?.trim() || person.email || "Unnamed"
  const off = person.active === false
  const admin = isAdminRole(person)
  const tone = t.tones[ROLE_TONE[person.role || ""] || "slate"]
  const extras = (person.modules || []).length
  const reach = admin
    ? "All modules"
    : extras
      ? `Role + ${extras} extra ${extras === 1 ? "module" : "modules"}`
      : "Role access"
  const seen = lastAt
    ? `Active ${relativeTime(lastAt)}`
    : person.created_at
      ? `Joined ${formatDate(person.created_at)}`
      : "No recent activity"

  const body = (
    <View style={[styles.row, off && { opacity: 0.72 }]}>
      <View>
        <Avatar name={name} uri={person.avatar_url || undefined} size={48} />
        <View
          style={[
            styles.dot,
            { backgroundColor: off ? t.danger : t.success, borderColor: t.surface },
          ]}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.nameLine}>
          <Text numberOfLines={1} style={[textVariants.listTitle, styles.name, { color: t.text }]}>
            {name}
          </Text>
          {you && <Pill label="You" fg={t.primary} bg={t.primary10} />}
        </View>
        {!!person.email && person.email !== name && (
          <Text numberOfLines={1} style={[textVariants.small, { color: t.textSecondary }]}>
            {person.email}
          </Text>
        )}
        <View style={styles.metaLine}>
          <Pill
            label={roleLabel(person.role) || "No role"}
            fg={tone.fg}
            bg={tone.bg}
          />
          {off ? (
            <Pill label="Deactivated" fg={t.dangerText} bg={t.dangerBg} />
          ) : (
            <Text numberOfLines={1} style={[textVariants.caption, styles.meta, { color: t.textTertiary }]}>
              {reach} · {seen}
            </Text>
          )}
        </View>
      </View>

      {!!onPress && <Icon name="forward" size={18} color={t.textTertiary} />}
    </View>
  )

  if (!onPress) return body
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${roleLabel(person.role)}${off ? ", deactivated" : ""}`}
      style={({ pressed }) => ({ opacity: pressed ? state.pressedOpacity : 1 })}
    >
      {body}
    </Pressable>
  )
}

function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // SearchField carries its own gutter margin.
  tools: { paddingBottom: spacing.sm },
  stats: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: gutter, paddingVertical: spacing.md },
  stat: { flex: 1, borderRadius: 16, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: "center", gap: 4 },
  statWell: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, lineHeight: 26, fontFamily: font.bold },
  notice: { marginHorizontal: gutter, marginBottom: spacing.md, padding: spacing.md, borderRadius: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: gutter,
    paddingVertical: spacing.md,
  },
  dot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flexShrink: 1 },
  metaLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 3 },
  meta: { flexShrink: 1 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, lineHeight: 14, fontFamily: font.semibold },
  footer: { paddingHorizontal: gutter, paddingTop: spacing.md, paddingBottom: spacing.xxl, lineHeight: 18 },
})
