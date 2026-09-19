import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, daysWords, flagWords, type LeaveBalance } from "@/domain/attendance"
import { clock12, dayLabel, istHHMM } from "@/features/attendance/format"
import PunchRow from "@/features/attendance/PunchRow"
import { leaveDatesWords, todayIST } from "@/features/leave/leaveFormat"
import { balances as leaveBalances, decideLeave, pendingLeave, whoIsOut, type NamedLeave } from "@/lib/leave"
import { feedback } from "@/lib/feedback"
import {
  decideCorrection,
  flaggedPunches,
  pendingCorrections,
  reviewPunch,
  type FlaggedPunch,
  type PendingCorrection,
} from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import {
  AppScreen,
  Avatar,
  Button,
  DataNotice,
  EmptyState,
  ImageViewer,
  ListRefreshControl,
  Panel,
  Sheet,
  SkeletonPanel,
  TextField,
  useToast,
} from "@/ui"

type Decline = { kind: "correction" | "punch" | "leave"; id: string; who: string }

/**
 * Admins: what waits for a decision, as Zoho People's approvals list: a count
 * per kind at the top, then one request card each (face, name, what kind of
 * request on a tinted chip, the dates, the reason in their words, and Reject /
 * Approve on the card itself), so clearing the queue is a run of taps, not a
 * run of pages. Leave first, then corrections (a person is waiting on their
 * pay), then punches the server flagged. Declining asks for a note, because "not approved" with no reason is a
 * conversation someone then has to have anyway.
 *
 * Nobody decides their own: the server refuses it, and the card says who will.
 */
export default function AttendanceApprovalsScreen({ navigation }: StackScreenProps<"AttendanceApprovals">) {
  const t = useTheme()
  const toast = useToast()
  const { session } = useAuth()
  const me = session?.user?.id
  const [corrections, setCorrections] = React.useState<PendingCorrection[] | null>(null)
  const [punches, setPunches] = React.useState<FlaggedPunch[] | null>(null)
  const [leave, setLeave] = React.useState<NamedLeave[]>([])
  const [out, setOut] = React.useState<NamedLeave[]>([])
  // Each requester's balance for the type they asked for: "4.5 days available".
  const [leaveBal, setLeaveBal] = React.useState<Record<string, LeaveBalance[]>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [decline, setDecline] = React.useState<Decline | null>(null)
  const [note, setNote] = React.useState("")
  const [photo, setPhoto] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const today = todayIST()
      const [c, p, l, o] = await Promise.all([
        pendingCorrections(),
        flaggedPunches(),
        // Leave arrives with migration 0036; until then these are simply empty.
        pendingLeave().catch(() => [] as NamedLeave[]),
        whoIsOut(today, today).catch(() => [] as NamedLeave[]),
      ])
      setCorrections(c)
      setPunches(p)
      setLeave(l)
      setOut(o)
      setError(null)
      const people = [...new Set(l.map((r) => r.user_id))]
      const pairs = await Promise.all(
        people.map(async (uid) => [uid, await leaveBalances(uid).catch(() => [] as LeaveBalance[])] as const),
      )
      setLeaveBal(Object.fromEntries(pairs))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load what is waiting.")
      setCorrections((c) => c ?? [])
      setPunches((p) => p ?? [])
    }
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  const act = async (id: string, run: () => Promise<void>, done: string) => {
    setBusy(id)
    try {
      await run()
      feedback.created()
      toast.show({ message: done, tone: "success" })
      await load()
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "That did not save.", tone: "danger" })
    }
    setBusy(null)
  }

  const confirmDecline = async () => {
    if (!decline) return
    const d = decline
    const reason = note
    setDecline(null)
    setNote("")
    if (d.kind === "correction") {
      await act(d.id, () => decideCorrection(d.id, false, reason), `Correction declined. ${d.who} can see why.`)
    } else if (d.kind === "leave") {
      await act(d.id, () => decideLeave(d.id, false, reason), `Leave declined. ${d.who} can see why.`)
    } else {
      await act(d.id, () => reviewPunch(d.id, "rejected", reason), "Punch not accepted.")
    }
  }


  const loading = corrections === null || punches === null
  const empty = !loading && corrections!.length === 0 && punches!.length === 0 && leave.length === 0

  const counts: { label: string; value: number; tone: "violet" | "amber" | "rose" }[] = loading
    ? []
    : [
        { label: "Leave", value: leave.length, tone: "violet" },
        { label: "Corrections", value: corrections!.length, tone: "amber" },
        { label: "Punches", value: punches!.length, tone: "rose" },
      ]

  return (
    <AppScreen
      title="Approvals"
      subtitle="Leave, corrections and punches to review"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      list={{
        data: [],
        renderItem: () => null,
        refreshControl: (
          <ListRefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await load()
              setRefreshing(false)
            }}
          />
        ),
      }}
    >
      <DataNotice error={error} onRetry={() => void load()} />
      {out.length > 0 && (
        <View style={[styles.outStrip, { backgroundColor: t.tones.violet.bg }]}>
          <View style={styles.faces}>
            {out.slice(0, 4).map((r, i) => (
              <View key={r.id} style={[styles.face, i > 0 && styles.faceOverlap, { borderColor: t.tones.violet.bg }]}>
                <Avatar name={r.person} uri={r.avatarUrl || undefined} size="sm" />
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[textVariants.smallStrong, { color: t.tones.violet.fg }]}>{`Out today · ${out.length}`}</Text>
            <Text style={[textVariants.caption, { color: t.tones.violet.fg }]} numberOfLines={2}>
              {out.map((r) => r.person).join(", ")}
            </Text>
          </View>
        </View>
      )}
      {loading ? (
        <>
          <SkeletonPanel lines={1} head={false} />
          <SkeletonPanel lines={3} block={40} />
          <SkeletonPanel lines={3} block={40} />
        </>
      ) : empty ? (
        <EmptyState icon="tick" title="Nothing waiting" hint="Leave requests, corrections and flagged punches appear here for a decision." />
      ) : (
        <>
          <Panel>
            <View style={styles.counts}>
              {counts.map((c) => (
                <View
                  key={c.label}
                  accessibilityLabel={`${c.label}: ${c.value} waiting`}
                  style={[styles.count, { backgroundColor: c.value ? t.tones[c.tone].bg : t.surfaceInset }]}
                >
                  <Text style={[styles.countValue, { color: c.value ? t.tones[c.tone].fg : t.textTertiary }]}>{c.value}</Text>
                  <Text style={[textVariants.caption, { color: c.value ? t.tones[c.tone].fg : t.textTertiary }]}>{c.label}</Text>
                </View>
              ))}
            </View>
          </Panel>

          {leave.length > 0 && (
            <Panel title="Leave requests" meta={`${leave.length}`}>
              {leave.map((r, i) => {
                const mine = r.user_id === me
                const b = (leaveBal[r.user_id] || []).find((x) => x.code === r.type_code)
                const balanceLine = !b
                  ? ""
                  : b.accrual === "none"
                    ? "Unpaid leave"
                    : `${b.name}: ${daysWords(b.available + r.days)} available before this, ${daysWords(b.available)} after`
                return (
                  <RequestCard
                    key={r.id}
                    first={i === 0}
                    person={r.person}
                    avatarUrl={r.avatarUrl}
                    kind={b?.name || r.type_code}
                    kindIcon="calendar"
                    tone="violet"
                    when={`${leaveDatesWords(r)} · ${daysWords(r.days)}`}
                    reason={r.reason}
                    notes={[
                      balanceLine ? { text: balanceLine, warn: !!b && b.available < 0 } : null,
                      r.attachment_path ? { text: "Has a document attached", warn: false } : null,
                    ]}
                    mine={mine ? "Your own request. Another admin reviews this." : null}
                    busy={busy === r.id}
                    rejectLabel="Decline"
                    approveLabel="Approve"
                    onReject={() => setDecline({ kind: "leave", id: r.id, who: r.person })}
                    onApprove={() =>
                      void act(r.id, () => decideLeave(r.id, true), `Approved. ${r.person}'s balance and attendance are updated.`)
                    }
                  />
                )
              })}
            </Panel>
          )}

          {corrections!.length > 0 && (
            <Panel title="Corrections" meta={`${corrections!.length}`}>
              {corrections!.map((c, i) => {
                const mine = c.user_id === me
                const times = [
                  c.in_at ? `In ${clock12(istHHMM(c.in_at))}` : null,
                  c.out_at ? `Out ${clock12(istHHMM(c.out_at))}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")
                return (
                  <RequestCard
                    key={c.id}
                    first={i === 0}
                    person={c.person}
                    avatarUrl={c.avatarUrl}
                    kind="Attendance correction"
                    kindIcon="edit"
                    tone="amber"
                    when={`${dayLabel(c.day)} · ${times}`}
                    reason={c.reason}
                    mine={mine ? "Your own request. Another admin reviews this." : null}
                    busy={busy === c.id}
                    rejectLabel="Decline"
                    approveLabel="Approve"
                    onReject={() => setDecline({ kind: "correction", id: c.id, who: c.person })}
                    onApprove={() =>
                      void act(c.id, () => decideCorrection(c.id, true), `Approved. ${c.person}'s day is updated.`)
                    }
                  />
                )
              })}
            </Panel>
          )}

          {punches!.length > 0 && (
            <Panel title="Punches to review" meta={`${punches!.length}`}>
              {punches!.map((p, i) => {
                const mine = p.user_id === me
                return (
                  <RequestCard
                    key={p.id}
                    first={i === 0}
                    person={p.person}
                    avatarUrl={p.avatarUrl}
                    kind={p.kind === "in" ? "Flagged clock-in" : "Flagged clock-out"}
                    kindIcon="warning"
                    tone="rose"
                    when={`${dayLabel(p.day)} · ${clockIST(p.at)}`}
                    notes={[{ text: flagWords(p.flags).join(", ") || "Flagged by the server", warn: true }]}
                    mine={mine ? "Your own punch. Another admin reviews this." : null}
                    busy={busy === p.id}
                    rejectLabel="Reject"
                    approveLabel="Accept"
                    onReject={() => setDecline({ kind: "punch", id: p.id, who: p.person })}
                    onApprove={() => void act(p.id, () => reviewPunch(p.id, "accepted"), "Punch accepted.")}
                  >
                    <View style={styles.punch}>
                      <PunchRow punch={p} last onOpenPhoto={setPhoto} />
                    </View>
                  </RequestCard>
                )
              })}
            </Panel>
          )}
        </>
      )}

      <Sheet
        visible={!!decline}
        onClose={() => {
          setDecline(null)
          setNote("")
        }}
        title={
          decline?.kind === "punch" ? "Reject this punch" : decline?.kind === "leave" ? "Decline this leave" : "Decline this correction"
        }
      >
        <View style={styles.sheet}>
          <Text style={[textVariants.small, { color: t.textSecondary }]}>
            {`Tell ${decline?.who || "them"} why. They see this note on their ${decline?.kind === "leave" ? "request" : "day"}.`}
          </Text>
          <TextField value={note} onChangeText={setNote} placeholder="For example: the gate register shows 7:10 PM" multiline />
          <Button
            label={decline?.kind === "punch" ? "Reject" : "Decline"}
            variant="danger"
            fullWidth
            disabled={note.trim().length < 3}
            onPress={() => void confirmDecline()}
          />
        </View>
      </Sheet>
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

/**
 * One request, Zoho People style: the person, what kind of request on a tinted
 * chip, the dates, their reason in a quiet well, anything the approver should
 * know, and the decision on the card. Rows inside the panel split by a
 * hairline: flat, not floating.
 */
function RequestCard({
  first,
  person,
  avatarUrl,
  kind,
  kindIcon,
  tone,
  when,
  reason,
  notes = [],
  mine,
  busy,
  rejectLabel,
  approveLabel,
  onReject,
  onApprove,
  children,
}: {
  first: boolean
  person: string
  avatarUrl?: string
  kind: string
  kindIcon: IconName
  tone: "violet" | "amber" | "rose"
  when: string
  reason?: string
  notes?: ({ text: string; warn: boolean } | null)[]
  mine: string | null
  busy: boolean
  rejectLabel: string
  approveLabel: string
  onReject: () => void
  onApprove: () => void
  children?: React.ReactNode
}) {
  const t = useTheme()
  const tint = t.tones[tone]
  return (
    <View style={[styles.card, !first && { borderTopWidth: 1, borderTopColor: t.divider }]}>
      <View style={styles.cardHead}>
        <Avatar name={person} uri={avatarUrl || undefined} size="md" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[textVariants.listTitle, { color: t.text }]} numberOfLines={1}>
            {person}
          </Text>
          <View style={[styles.kind, { backgroundColor: tint.bg }]}>
            <Icon name={kindIcon} size={12} color={tint.fg} variant="Bulk" />
            <Text style={[textVariants.captionStrong, { color: tint.fg }]} numberOfLines={1}>
              {kind}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.when}>
        <Icon name="calendar" size={14} color={t.textTertiary} variant="Bulk" />
        <Text style={[textVariants.small, { color: t.textSecondary, flex: 1 }]}>{when}</Text>
      </View>
      {reason ? (
        <View style={[styles.reason, { backgroundColor: t.surfaceInset }]}>
          <Text style={[textVariants.small, { color: t.textSecondary }]}>{reason}</Text>
        </View>
      ) : null}
      {children}
      {notes.map((n) =>
        n ? (
          <Text key={n.text} style={[textVariants.caption, { color: n.warn ? t.warningText : t.textTertiary }]}>
            {n.text}
          </Text>
        ) : null,
      )}
      {mine ? (
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>{mine}</Text>
      ) : (
        <View style={styles.actions}>
          <Button
            label={rejectLabel}
            variant="outline-danger"
            size="md"
            icon="close"
            disabled={busy}
            onPress={onReject}
            style={styles.action}
          />
          <Button label={approveLabel} size="md" icon="tick" loading={busy} onPress={onApprove} style={styles.action} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  counts: { flexDirection: "row", gap: spacing.sm, padding: gutter },
  count: { flex: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
  countValue: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, fontVariant: ["tabular-nums"] },
  card: { paddingHorizontal: gutter, paddingVertical: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  kind: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    maxWidth: "100%",
  },
  when: { flexDirection: "row", alignItems: "center", gap: 6 },
  reason: { borderRadius: radius.card, padding: 12 },
  punch: { marginHorizontal: -gutter },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs },
  action: { flex: 1 },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
  outStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: gutter,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
  },
  faces: { flexDirection: "row" },
  face: { borderWidth: 2, borderRadius: 999 },
  faceOverlap: { marginLeft: -10 },
})
