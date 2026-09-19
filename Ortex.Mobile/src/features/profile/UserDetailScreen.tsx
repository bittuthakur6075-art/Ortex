import React from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { HistoryEntry } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { formatDate, formatDateTime, relativeTime } from "@/domain/format"
import { MODULES, ROLE_TONE, isAdmin, isSuperAdmin, roleLabel, roleModulesOf, type Profile } from "@/domain/modules"
import { QuickAction } from "@/features/leads/leadUi"
import { useActorHistory } from "@/hooks/useActorHistory"
import { invalidateDirectory } from "@/hooks/useRecordHistory"
import { callNumber, copy, email as sendEmail, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import { getProfile, randomPassword, resetUserPassword, setUserActive } from "@/lib/users"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { border, gutter, radius, size as sizes, spacing, state } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  Avatar,
  Button,
  DetailSkeleton,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  Sheet,
  Switch,
  TextField,
  useToast,
} from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * One console account, full screen: who they are, how to reach them, what they
 * can open, whether they can sign in, and every audited thing they have done.
 *
 * Laid out as the contact page is (CustomerDetailScreen): a bar whose title
 * fades in once the name scrolls away, the identity, a row of round actions a
 * thumb-length from the name, stat tiles, then full-bleed panels separated by
 * 2dp bands.
 *
 * MIRRORS Ortex.Admin/src/pages/users/UserDetail.jsx and the two account actions
 * of its RowActions.jsx — deactivate/activate and reset password — through the
 * same `admin-manage-user` function, so the rules (an admin cannot disable their
 * own account; a reset signs every session out) live once, on the server. Role
 * and module edits and deleting a login stay in the console.
 *
 * ADMIN-ONLY: `profiles` is owner-or-admin readable, and the Team roster only
 * opens this page for an admin.
 */

// audit_log stores the table name; these are the words people use for them.
const COLLECTION: Record<string, { label: string; icon: IconName }> = {
  products: { label: "product", icon: "product" },
  categories: { label: "category", icon: "catalogue" },
  customers: { label: "customer", icon: "customer" },
  enquiries: { label: "enquiry", icon: "enquiry" },
  leads: { label: "lead", icon: "leads" },
  quotations: { label: "quotation", icon: "quote" },
  invoices: { label: "invoice", icon: "invoice" },
  payments: { label: "payment", icon: "money" },
  work: { label: "work photo", icon: "image" },
  social: { label: "social post", icon: "share" },
  automation_rules: { label: "automation rule", icon: "settings" },
  message_templates: { label: "message template", icon: "send" },
  telecaller_jobs: { label: "telecaller job", icon: "call" },
}

const ACTION_VERB: Record<HistoryEntry["action"], string> = { insert: "Created", update: "Edited", delete: "Deleted" }

const MODULE_ICON: Record<string, IconName> = {
  "voice-leads": "voice",
  enquiries: "enquiry",
  customers: "customer",
  products: "product",
  categories: "catalogue",
  work: "image",
  quotations: "quote",
}

const PAGE = 25
const COLLAPSE = 150

/** "Today", "Yesterday", or the date — the heading over a day of activity. */
function dayLabel(ts: string) {
  const d = new Date(ts)
  const today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(today) - start(d)) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return formatDate(ts)
}

export default function UserDetailScreen({ navigation, route }: StackScreenProps<"UserDetail">) {
  const { id } = route.params
  const t = useTheme()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const { profile: me } = useAuth()
  const isSelf = me?.id === id

  const [user, setUser] = React.useState<Profile | null | undefined>(undefined) // undefined = loading
  const [loadError, setLoadError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [confirmDisable, setConfirmDisable] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [visible, setVisible] = React.useState(PAGE)
  const { entries, loading: loadingActivity, error: activityError } = useActorHistory(id)
  const scrollY = React.useRef(new Animated.Value(0)).current

  const load = React.useCallback(async () => {
    try {
      setUser(await getProfile(id))
      setLoadError("")
    } catch (e) {
      setLoadError(errorMessage(e, "Could not load this account"))
      setUser(null)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  const counts = React.useMemo(() => {
    const c = { insert: 0, update: 0, delete: 0 }
    for (const e of entries) if (e.action in c) c[e.action] += 1
    return c
  }, [entries])

  // The records they touch most, so "what does this person actually work on"
  // is answered before the timeline is read.
  const focus = React.useMemo(() => {
    const byTable: Record<string, number> = {}
    for (const e of entries) byTable[e.collection] = (byTable[e.collection] || 0) + 1
    return Object.entries(byTable)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [entries])

  const goBack = () => navigation.goBack()

  if (user === undefined) return <DetailSkeleton onBack={goBack} panels={[3, 2, 4, 3]} />

  if (!user) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <EmptyState
          icon={loadError ? "warning" : "customer"}
          title={loadError ? "Could not load this account" : "That account no longer exists"}
          hint={loadError || "It was deleted, or the link is out of date."}
          actionLabel="Go back"
          onAction={goBack}
        />
      </View>
    )
  }

  const active = user.active !== false
  const admin = isAdmin(user)
  const roleTone = t.tones[ROLE_TONE[user.role || ""] || "slate"]
  // Migration 0032's rules, mirrored so the page never offers what the server
  // refuses: the Super Admin is only ever changed by themselves and can never be
  // disabled; only the Super Admin acts on an Admin.
  const canManage = isSelf || isSuperAdmin(me) || !admin
  const canToggle = canManage && !isSelf && user.role !== "super_admin"
  const name = user.name?.trim() || user.email || "Unnamed user"
  const hasPhone = String(user.phone || "").replace(/\D/g, "").length >= 10
  // What they reach: their role's grants plus their own extras. This page does
  // not load `role_permissions`, so for someone else the role's grants shown are
  // the seed defaults; the caption below points to where the live ones are set.
  const reach = new Set([...(user.modules || []), ...roleModulesOf(user)])
  const modules = MODULES.filter((m) => !m.always && reach.has(m.key))
  // The console grants modules this app has no screen for.
  const otherGrants = [...reach].filter((k) => !MODULES.some((m) => m.key === k))
  const shown = entries.slice(0, visible)

  const barTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE * 0.6, COLLAPSE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })

  const applyActive = async (next: boolean) => {
    setBusy(true)
    const res = await setUserActive(user.id!, next)
    setBusy(false)
    setConfirmDisable(false)
    if (res.error) {
      feedback.error()
      toast.show({ message: res.error, tone: "danger" })
      return
    }
    feedback.created()
    toast.show({ message: next ? `${name} can sign in again` : `${name} can no longer sign in`, tone: "success" })
    invalidateDirectory()
    void load()
  }

  const toggleActive = () => {
    if (!canToggle || busy) return
    feedback.tap()
    // Deactivating cuts someone off mid-session, so it asks first. Re-enabling
    // is harmless and stays one tap.
    if (active) setConfirmDisable(true)
    else void applyActive(true)
  }

  const copyValue = async (value: string, what: string) => {
    await copy(value)
    toast.show({ message: `${what} copied`, tone: "success" })
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: t.surface,
            borderBottomColor: t.divider,
            paddingTop: insets.top,
            height: insets.top + sizes.appBar,
          },
        ]}
      >
        <IconButton name="back" onPress={goBack} accessibilityLabel="Back" />
        <Animated.Text
          numberOfLines={1}
          style={[styles.barTitle, textVariants.appBarTitleBack, { color: t.text, opacity: barTitleOpacity }]}
        >
          {name}
        </Animated.Text>
        {canManage ? (
          <IconButton name="refresh" onPress={() => setResetting(true)} accessibilityLabel="Reset password" />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      >
        {/* Identity */}
        <Panel>
          <View style={styles.identity}>
            <View>
              <Avatar name={name} uri={user.avatar_url || undefined} size={104} ring={active ? "primary" : "danger"} />
              <View
                style={[styles.liveDot, { backgroundColor: active ? t.success : t.danger, borderColor: t.surface }]}
              />
            </View>
            <Text style={[styles.name, { color: t.text }]} numberOfLines={2}>
              {name}
            </Text>
            {!!user.email && user.email !== name && (
              <Text selectable style={[styles.email, { color: t.textSecondary }]} numberOfLines={1}>
                {user.email}
              </Text>
            )}
            <View style={styles.pills}>
              <Pill
                icon={admin ? "lock" : "customer"}
                label={roleLabel(user.role) || "No role"}
                fg={roleTone.fg}
                bg={roleTone.bg}
              />
              <Pill
                icon={active ? "tick" : "warning"}
                label={active ? "Active" : "Deactivated"}
                fg={active ? t.successText : t.dangerText}
                bg={active ? t.successBg : t.dangerBg}
              />
              {isSelf && <Pill label="You" fg={t.primary} bg={t.primary10} />}
            </View>
          </View>
        </Panel>

        {/* Round actions: reach them, then the two account controls. */}
        <Panel>
          <View style={styles.quickRow}>
            <QuickAction
              icon="call"
              label="Call"
              tone="blue"
              disabled={!hasPhone}
              onPress={() => void callNumber(user.phone || "")}
            />
            <QuickAction
              icon="whatsapp"
              label="WhatsApp"
              tone="emerald"
              disabled={!hasPhone}
              onPress={() => void whatsapp(user.phone || "")}
            />
            <QuickAction
              icon="mail"
              label="Email"
              tone="amber"
              disabled={!user.email}
              onPress={() => void sendEmail(user.email || "")}
            />
            <QuickAction
              icon="lock"
              label={active ? "Disable" : "Enable"}
              tone={active ? "rose" : "emerald"}
              disabled={!canToggle || busy}
              onPress={toggleActive}
            />
          </View>
        </Panel>

        {/* Stats */}
        <Panel>
          <View style={styles.statRow}>
            <Stat label="Created" value={loadingActivity ? "–" : String(counts.insert)} />
            <Stat label="Edited" value={loadingActivity ? "–" : String(counts.update)} />
            <Stat label="Deleted" value={loadingActivity ? "–" : String(counts.delete)} />
            <Stat
              label="Last active"
              value={loadingActivity ? "–" : entries[0] ? relativeTime(entries[0].at) : "Never"}
              small
            />
          </View>
        </Panel>

        {/* Contact */}
        <Panel title="Contact">
          <InfoRow
            icon="call"
            label="Mobile"
            value={user.phone ? prettyPhone(user.phone) : "Not added"}
            muted={!user.phone}
            onPress={hasPhone ? () => void callNumber(user.phone || "") : undefined}
            onLongPress={user.phone ? () => void copyValue(user.phone || "", "Number") : undefined}
          />
          <InfoRow
            icon="mail"
            label="Sign-in email"
            value={user.email || "Not recorded"}
            onPress={user.email ? () => void sendEmail(user.email || "") : undefined}
            onLongPress={user.email ? () => void copyValue(user.email || "", "Email") : undefined}
          />
          <InfoRow
            icon="calendar"
            label="Added"
            value={user.created_at ? `${formatDate(user.created_at)} · ${relativeTime(user.created_at)}` : "Not recorded"}
            muted={!user.created_at}
            last
          />
        </Panel>

        {/* Access */}
        <Panel title="Access">
          <InfoRow icon="gst" label="Role" value={roleLabel(user.role) || "No role"} />
          <InfoRow
            icon={active ? "tick" : "warning"}
            label="Sign-in"
            value={active ? "Allowed: password or emailed code" : "Blocked until reactivated"}
            last
          />
          <View style={[styles.modules, { borderTopColor: t.divider }]}>
            <Text style={[textVariants.tileLabel, { color: t.textTertiary }]}>MODULES</Text>
            {admin ? (
              <Text style={[textVariants.small, { color: t.textSecondary }]}>Every module, by role.</Text>
            ) : modules.length === 0 && otherGrants.length === 0 ? (
              <Text style={[textVariants.small, { color: t.warningText }]}>
                No modules granted. They see the console dashboard only.
              </Text>
            ) : (
              <View style={styles.moduleGrid}>
                {modules.map((m) => (
                  <View key={m.key} style={[styles.moduleChip, { backgroundColor: t.surfaceInset }]}>
                    <Icon name={MODULE_ICON[m.key] || "tick"} size={15} color={t.primary} variant="Bulk" />
                    <Text style={[styles.moduleText, { color: t.text }]}>{m.label}</Text>
                  </View>
                ))}
                {otherGrants.map((k) => (
                  <View key={k} style={[styles.moduleChip, { backgroundColor: t.surfaceInset }]}>
                    <Icon name="settings" size={15} color={t.textTertiary} variant="Bulk" />
                    <Text style={[styles.moduleText, { color: t.textSecondary }]}>
                      {k.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={[textVariants.caption, { color: t.textTertiary }]}>
              What a role opens is set by the Super Admin; extras per person are ticked in the Ortex console.
            </Text>
          </View>
        </Panel>

        {/* Account controls */}
        {canManage ? (
        <Panel title="Account">
          <ActionRow
            icon={active ? "lock" : "tick"}
            tone={active ? "danger" : "success"}
            title={active ? "Deactivate account" : "Activate account"}
            subtitle={
              isSelf
                ? "You can't disable your own account"
                : user.role === "super_admin"
                  ? "The Super Admin can't be disabled"
                  : active
                    ? "Sign them out everywhere and block sign-in"
                    : "Let them sign in again"
            }
            onPress={canToggle ? toggleActive : undefined}
          />
          <ActionRow
            icon="refresh"
            tone="primary"
            title="Reset password"
            subtitle="Set a temporary password and sign them out"
            onPress={() => {
              feedback.tap()
              setResetting(true)
            }}
            last
          />
        </Panel>
        ) : null}

        {/* Activity */}
        <Panel title="Activity">
          {focus.length > 0 && (
            <View style={styles.focusRow}>
              {focus.map(([table, n]) => (
                <View key={table} style={[styles.focusChip, { backgroundColor: t.iconWell }]}>
                  <Icon name={COLLECTION[table]?.icon || "info"} size={14} color={t.primary} variant="Bulk" />
                  <Text style={[styles.focusText, { color: t.primary }]}>
                    {n} {COLLECTION[table]?.label || table}
                    {n === 1 ? "" : "s"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.timeline}>
            {activityError ? (
              <Text style={[textVariants.small, { color: t.dangerText }]}>{activityError}</Text>
            ) : loadingActivity ? (
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>Loading activity…</Text>
            ) : entries.length === 0 ? (
              // Three different nothings, and only one of them means idle.
              <Text style={[textVariants.small, { color: t.textTertiary, lineHeight: 20 }]}>
                Nothing audited for this account. Work done before the audit trail was switched on carries no record,
                and the machine-written tables (website visits, event logs, message sends) are deliberately not
                audited.
              </Text>
            ) : (
              <>
                {shown.map((e, i) => {
                  const day = dayLabel(e.at)
                  const newDay = i === 0 || dayLabel(shown[i - 1].at) !== day
                  const lastOfDay = i === shown.length - 1 || dayLabel(shown[i + 1].at) !== day
                  return (
                    <View key={e.id}>
                      {newDay && (
                        <Text style={[textVariants.tileLabel, styles.day, { color: t.textTertiary }]}>
                          {day.toUpperCase()}
                        </Text>
                      )}
                      <Entry entry={e} isLast={lastOfDay} />
                    </View>
                  )
                })}
                {entries.length > visible && (
                  <Button
                    label={`Show ${Math.min(PAGE, entries.length - visible)} more`}
                    variant="secondary"
                    size="md"
                    fullWidth
                    onPress={() => setVisible((v) => v + PAGE)}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
                {entries.length >= 200 && visible >= entries.length && (
                  <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: spacing.md }]}>
                    Showing the most recent 200 changes.
                  </Text>
                )}
              </>
            )}
          </View>
        </Panel>
      </Animated.ScrollView>

      <Dialog
        visible={confirmDisable}
        onClose={() => !busy && setConfirmDisable(false)}
        title="Deactivate account"
        message={`${user.email || name} is signed out everywhere and cannot sign in again, by password or by emailed code, until you reactivate them. Their records stay exactly as they are.`}
        actions={[
          { label: "Cancel", onPress: () => setConfirmDisable(false) },
          { label: busy ? "Deactivating…" : "Deactivate", tone: "danger", onPress: () => void applyActive(false) },
        ]}
      />

      <ResetPasswordSheet visible={resetting} user={user} isSelf={isSelf} onClose={() => setResetting(false)} />
    </View>
  )
}

/** A full-bleed section: surface, no radius, a 2dp band beneath (ui/Section.tsx's language). */
function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  const t = useTheme()
  return (
    <>
      <View style={{ backgroundColor: t.surface }}>
        {!!title && <Text style={[styles.sectionLabel, { color: t.textTertiary }]}>{title}</Text>}
        {children}
      </View>
      <View style={[styles.band, { backgroundColor: t.border }]} />
    </>
  )
}

function Pill({ icon, label, fg, bg }: { icon?: IconName; label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {!!icon && <Icon name={icon} size={13} color={fg} variant="Bold" />}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  const t = useTheme()
  return (
    <View style={[styles.stat, { backgroundColor: t.surfaceInset }]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[small ? styles.statValueSmall : styles.statValue, { color: t.text }]}
      >
        {value}
      </Text>
      <Text numberOfLines={1} style={[styles.statLabel, { color: t.textTertiary }]}>
        {label}
      </Text>
    </View>
  )
}

function InfoRow({
  icon,
  label,
  value,
  muted,
  onPress,
  onLongPress,
  last,
}: {
  icon: IconName
  label: string
  value: string
  muted?: boolean
  onPress?: () => void
  onLongPress?: () => void
  last?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => ({ opacity: pressed && onPress ? state.pressedOpacity : 1 })}
    >
      <View style={styles.infoRow}>
        <View style={[styles.infoWell, { backgroundColor: t.iconWell }]}>
          <Icon name={icon} size={18} color={t.primary} variant="Bulk" />
        </View>
        <View style={[styles.infoBody, !last && { borderBottomColor: t.divider, borderBottomWidth: border.hairline }]}>
          <Text style={[styles.infoLabel, { color: t.textTertiary }]}>{label}</Text>
          <Text style={[styles.infoValue, { color: muted ? t.textTertiary : t.text }]}>{value}</Text>
        </View>
        {!!onPress && <Icon name="forward" size={16} color={t.textTertiary} />}
      </View>
    </Pressable>
  )
}

function ActionRow({
  icon,
  tone,
  title,
  subtitle,
  onPress,
  last,
}: {
  icon: IconName
  tone: "primary" | "danger" | "success"
  title: string
  subtitle: string
  onPress?: () => void
  last?: boolean
}) {
  const t = useTheme()
  const ink = { primary: t.primary, danger: t.danger, success: t.success }[tone]
  const well = { primary: t.iconWell, danger: t.dangerBg, success: t.successBg }[tone]
  const text = { primary: t.text, danger: t.dangerText, success: t.successText }[tone]
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({ opacity: !onPress ? 0.5 : pressed ? state.pressedOpacity : 1 })}
    >
      <View style={styles.infoRow}>
        <View style={[styles.infoWell, { backgroundColor: well }]}>
          <Icon name={icon} size={18} color={ink} variant="Bulk" />
        </View>
        <View style={[styles.infoBody, !last && { borderBottomColor: t.divider, borderBottomWidth: border.hairline }]}>
          <Text style={[styles.actionTitle, { color: text }]}>{title}</Text>
          <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 2 }]}>{subtitle}</Text>
        </View>
        {!!onPress && <Icon name="forward" size={16} color={t.textTertiary} />}
      </View>
    </Pressable>
  )
}

function Entry({ entry, isLast }: { entry: HistoryEntry; isLast: boolean }) {
  const t = useTheme()
  const meta = COLLECTION[entry.collection]
  const kind = meta?.label || entry.collection
  // The label is resolved at write time and kept, so a deleted record still says
  // what it was; one that never had a name is shown by its collection alone.
  const label = entry.label && entry.label !== kind ? entry.label : ""
  const fields =
    entry.action === "update"
      ? Object.keys(entry.changes || {})
          .map((k) => k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase())
          .slice(0, 6)
      : []
  const tone = entry.action === "insert" ? t.tones.emerald : entry.action === "delete" ? t.tones.rose : t.tones.blue

  return (
    <View style={styles.entry}>
      <View style={styles.rail}>
        <View style={[styles.entryWell, { backgroundColor: tone.bg }]}>
          <Icon name={meta?.icon || "edit"} size={15} color={tone.fg} variant="Bulk" />
        </View>
        {!isLast && <View style={[styles.line, { backgroundColor: t.border }]} />}
      </View>
      <View style={styles.entryBody}>
        <Text style={[textVariants.small, { color: t.textSecondary }]}>
          <Text style={{ fontFamily: font.semibold, color: tone.fg }}>{ACTION_VERB[entry.action] || entry.action}</Text>{" "}
          {kind}
          {label ? (
            <Text style={{ fontFamily: font.semibold, color: t.text }}>
              {"  "}
              {label}
            </Text>
          ) : null}
        </Text>
        {fields.length > 0 && (
          <Text style={[textVariants.caption, { color: t.textSecondary }]} numberOfLines={2}>
            Changed <Text style={{ color: t.text }}>{fields.join(", ")}</Text>
          </Text>
        )}
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>
          {formatDateTime(entry.at)} · {relativeTime(entry.at)}
        </Text>
      </View>
    </View>
  )
}

function ResetPasswordSheet({
  visible,
  user,
  isSelf,
  onClose,
}: {
  visible: boolean
  user: Profile
  isSelf: boolean
  onClose: () => void
}) {
  const t = useTheme()
  const toast = useToast()
  const [password, setPassword] = React.useState(randomPassword)
  const [notify, setNotify] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()
  /** Set when the reset worked but no email went: the password must not be lost. */
  const [handOver, setHandOver] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!visible) return
    setPassword(randomPassword())
    setNotify(true)
    setError(undefined)
    setHandOver(null)
  }, [visible])

  const submit = async () => {
    if (password.trim().length < 6) {
      setError("At least 6 characters")
      feedback.error()
      return
    }
    setBusy(true)
    const res = await resetUserPassword(user.id!, password.trim(), notify)
    setBusy(false)
    if (res.error) {
      feedback.error()
      toast.show({ message: res.error, tone: "danger" })
      return
    }
    feedback.created()
    if (notify && res.emailed) {
      toast.show({ message: `Password reset and emailed to ${user.email}`, tone: "success" })
      onClose()
    } else {
      // Not emailed (by choice or because the mail failed): keep the sheet open
      // holding the one thing that is otherwise gone for good.
      setHandOver(password.trim())
    }
  }

  return (
    <Sheet visible={visible} onClose={() => !busy && onClose()} title="Reset password">
      {handOver ? (
        <View style={styles.form}>
          <Text style={[textVariants.subtitle, { color: t.text }]}>Password reset</Text>
          <Text style={[textVariants.small, { color: t.textSecondary }]}>
            {notify
              ? "The email could not be sent from this project, so pass this on yourself."
              : "Share it with them securely."}{" "}
            It is not stored anywhere and will not be shown again.
          </Text>
          <View style={[styles.credentials, { backgroundColor: t.surfaceInset }]}>
            <Text style={[textVariants.tileLabel, { color: t.textTertiary }]}>EMAIL</Text>
            <Text selectable style={[textVariants.bodyStrong, { color: t.text }]}>
              {user.email}
            </Text>
            <Text style={[textVariants.tileLabel, { color: t.textTertiary, marginTop: spacing.sm }]}>
              TEMPORARY PASSWORD
            </Text>
            <Text selectable style={[textVariants.bodyStrong, { color: t.text }]}>
              {handOver}
            </Text>
          </View>
          <Button label="Done" onPress={onClose} fullWidth />
        </View>
      ) : (
        <View style={styles.form}>
          <Text
            style={[
              textVariants.small,
              styles.warning,
              { color: isSelf ? t.dangerText : t.warningText, backgroundColor: isSelf ? t.dangerBg : t.warningBg },
            ]}
          >
            {isSelf
              ? "This is your own account. Your current password stops working immediately and you are signed out here and everywhere else."
              : "Their current password stops working immediately, and every session they have open is signed out."}
          </Text>
          <TextField
            label="New Temporary Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v)
              setError(undefined)
            }}
            error={error}
            autoCapitalize="none"
            autoCorrect={false}
            hint="They can change it themselves from Profile → Change password."
          />
          <Button
            label="Generate another"
            variant="ghost"
            size="sm"
            icon="refresh"
            onPress={() => setPassword(randomPassword())}
          />
          <Switch
            value={notify}
            onValueChange={setNotify}
            label="Email them the new password"
            description={`Sent to ${user.email}. Turn off to hand it over in person.`}
          />
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
            <Button label="Reset password" loading={busy} onPress={() => void submit()} style={styles.action} />
          </View>
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { justifyContent: "center" },
  // The first panel under this bar is white, so the bar needs the hairline to
  // have an edge at all.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: border.hairline,
  },
  barTitle: { flex: 1, marginHorizontal: 4 },
  band: { height: 2 },

  identity: { alignItems: "center", paddingTop: spacing.xl, paddingBottom: spacing.xl, paddingHorizontal: gutter },
  liveDot: { position: "absolute", right: 8, bottom: 8, width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
  name: { marginTop: spacing.md, fontSize: 25, lineHeight: 32, textAlign: "center", fontFamily: font.bold },
  email: { marginTop: 4, fontSize: 15, lineHeight: 20, textAlign: "center", fontFamily: font.regular },
  pills: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12.5, lineHeight: 16, fontFamily: font.semibold },

  quickRow: { flexDirection: "row", justifyContent: "space-evenly", paddingVertical: spacing.lg, paddingHorizontal: spacing.sm },

  statRow: { flexDirection: "row", gap: 10, paddingHorizontal: gutter, paddingVertical: spacing.lg },
  stat: { flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 6, alignItems: "center" },
  statValue: { fontSize: 20, lineHeight: 26, fontFamily: font.bold },
  statValueSmall: { fontSize: 14, lineHeight: 26, fontFamily: font.bold },
  statLabel: { marginTop: 2, fontSize: 11.5, fontFamily: font.regular },

  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingHorizontal: gutter,
    paddingTop: gutter,
    paddingBottom: spacing.xs,
    fontFamily: font.semibold,
  },

  infoRow: { flexDirection: "row", alignItems: "center", paddingLeft: gutter, paddingRight: gutter },
  infoWell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  infoBody: { flex: 1, minWidth: 0, paddingVertical: 14 },
  infoLabel: { fontSize: 11.5, fontFamily: font.semibold, textTransform: "uppercase", letterSpacing: 0.3 },
  infoValue: { marginTop: 3, fontSize: 15.5, lineHeight: 21, fontFamily: font.medium },
  actionTitle: { fontSize: 15.5, lineHeight: 21, fontFamily: font.semibold },

  modules: {
    marginHorizontal: gutter,
    paddingTop: spacing.md,
    paddingBottom: gutter,
    gap: spacing.sm,
    borderTopWidth: border.hairline,
  },
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  moduleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  moduleText: { fontSize: 13, fontFamily: font.medium },

  focusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: gutter, paddingTop: spacing.sm },
  focusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  focusText: { fontSize: 12, fontFamily: font.semibold },

  timeline: { paddingHorizontal: gutter, paddingTop: spacing.sm, paddingBottom: gutter },
  day: { marginTop: spacing.md, marginBottom: spacing.sm },
  entry: { flexDirection: "row", gap: spacing.md },
  rail: { width: 30, alignItems: "center" },
  entryWell: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, marginVertical: 3, borderRadius: 1 },
  entryBody: { flex: 1, paddingBottom: spacing.lg, gap: 3, paddingTop: 5 },

  form: { gap: spacing.md, paddingBottom: spacing.sm },
  warning: { borderRadius: 12, padding: spacing.md },
  credentials: { borderRadius: 16, padding: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
})
