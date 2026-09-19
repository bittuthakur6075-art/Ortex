import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, flagWords } from "@/domain/attendance"
import { clock12, dayLabel, istHHMM } from "@/features/attendance/format"
import PunchRow from "@/features/attendance/PunchRow"
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
import { textVariants } from "@/theme/typography"
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

type Decline = { kind: "correction"; id: string; who: string } | { kind: "punch"; id: string; who: string }

/**
 * Admins: what waits for a decision. Corrections first (a person is waiting on
 * their pay), then punches the server flagged. Each is a card with its decision
 * on it (Remote reference), so clearing the queue is a run of taps, not a run of
 * pages. Declining asks for a note, because "not approved" with no reason is a
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
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [decline, setDecline] = React.useState<Decline | null>(null)
  const [note, setNote] = React.useState("")
  const [photo, setPhoto] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const [c, p] = await Promise.all([pendingCorrections(), flaggedPunches()])
      setCorrections(c)
      setPunches(p)
      setError(null)
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
    } else {
      await act(d.id, () => reviewPunch(d.id, "rejected", reason), "Punch not accepted.")
    }
  }

  const loading = corrections === null || punches === null
  const empty = !loading && corrections!.length === 0 && punches!.length === 0

  return (
    <AppScreen
      title="Approvals"
      subtitle="Corrections and punches to review"
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
      {loading ? (
        <>
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={3} />
        </>
      ) : empty ? (
        <EmptyState icon="tick" title="Nothing waiting" hint="Corrections and flagged punches appear here for a decision." />
      ) : (
        <>
          {corrections!.length > 0 && (
            <Panel title="Corrections" meta={`${corrections!.length}`}>
              <View style={styles.cards}>
                {corrections!.map((c) => {
                  const mine = c.user_id === me
                  const times = [
                    c.in_at ? `In ${clock12(istHHMM(c.in_at))}` : null,
                    c.out_at ? `Out ${clock12(istHHMM(c.out_at))}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")
                  return (
                    <View key={c.id} style={[styles.card, { backgroundColor: t.surfaceInset }]}>
                      <View style={styles.cardHead}>
                        <Avatar name={c.person} uri={c.avatarUrl || undefined} size="sm" />
                        <View style={{ flex: 1 }}>
                          <Text style={[textVariants.listTitle, { color: t.text }]}>{c.person}</Text>
                          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                            {dayLabel(c.day)} · {times}
                          </Text>
                        </View>
                      </View>
                      <Text style={[textVariants.body, { color: t.textSecondary }]}>{c.reason}</Text>
                      {mine ? (
                        <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                          Your own request. Another admin reviews this.
                        </Text>
                      ) : (
                        <View style={styles.actions}>
                          <Button
                            label="Decline"
                            variant="outline-danger"
                            size="md"
                            disabled={busy === c.id}
                            onPress={() => setDecline({ kind: "correction", id: c.id, who: c.person })}
                            style={styles.action}
                          />
                          <Button
                            label="Approve"
                            size="md"
                            loading={busy === c.id}
                            onPress={() =>
                              void act(c.id, () => decideCorrection(c.id, true), `Approved. ${c.person}'s day is updated.`)
                            }
                            style={styles.action}
                          />
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            </Panel>
          )}

          {punches!.length > 0 && (
            <Panel title="Punches to review" meta={`${punches!.length}`}>
              <View style={styles.cards}>
                {punches!.map((p) => {
                  const mine = p.user_id === me
                  return (
                    <View key={p.id} style={[styles.card, { backgroundColor: t.surfaceInset }]}>
                      <View style={styles.cardHead}>
                        <Avatar name={p.person} uri={p.avatarUrl || undefined} size="sm" />
                        <View style={{ flex: 1 }}>
                          <Text style={[textVariants.listTitle, { color: t.text }]}>{p.person}</Text>
                          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                            {dayLabel(p.day)} · {clockIST(p.at)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.punch}>
                        <PunchRow punch={p} last onOpenPhoto={setPhoto} />
                      </View>
                      <Text style={[textVariants.small, { color: t.warningText }]}>
                        {flagWords(p.flags).join(", ") || "Flagged by the server"}
                      </Text>
                      {mine ? (
                        <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                          Your own punch. Another admin reviews this.
                        </Text>
                      ) : (
                        <View style={styles.actions}>
                          <Button
                            label="Reject"
                            variant="outline-danger"
                            size="md"
                            disabled={busy === p.id}
                            onPress={() => setDecline({ kind: "punch", id: p.id, who: p.person })}
                            style={styles.action}
                          />
                          <Button
                            label="Accept"
                            size="md"
                            loading={busy === p.id}
                            onPress={() => void act(p.id, () => reviewPunch(p.id, "accepted"), "Punch accepted.")}
                            style={styles.action}
                          />
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
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
        title={decline?.kind === "punch" ? "Reject this punch" : "Decline this correction"}
      >
        <View style={styles.sheet}>
          <Text style={[textVariants.small, { color: t.textSecondary }]}>
            {`Tell ${decline?.who || "them"} why. They see this note on their day.`}
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

const styles = StyleSheet.create({
  cards: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  card: { borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  punch: { marginHorizontal: -gutter },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
})
