import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { errorMessage } from "@/data/supabase"
import { formatDate } from "@/domain/format"
import { dayAt10, outcomePatch, snoozePresets, undoPatch, type LeadDoc } from "@/domain/leads"
import { ENQUIRY_STATUS, LOST_REASONS } from "@/domain/schema"
import { newPunchId } from "@/lib/attendance"
import { feedback } from "@/lib/feedback"
import { spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { Button, Chip, IconButton, Sheet, TextField, useTheme, useToast } from "@/ui"
import type { Channel } from "@/features/leads/leadWrites"

/**
 * "How did it go?": outcome, next follow-up (never in the past) and a note,
 * written as the console writes them (domain/leads.ts `outcomePatch`). On a
 * folded call the activity goes on the newest row and the status on every row.
 */
export default function CallOutcomeSheet({
  channel,
  rows,
  me,
  onClose,
}: {
  channel: Channel | null
  rows: LeadDoc[]
  me: string
  onClose: () => void
}) {
  const t = useTheme()
  const toast = useToast()
  const [status, setStatus] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [follow, setFollow] = React.useState<string | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [days, setDays] = React.useState(1)
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // A fresh form every time it opens; the presets are read off the clock then.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!channel) return
    setStatus("")
    setReason("")
    setFollow(null)
    setPicking(false)
    setDays(1)
    setNote("")
    setNow(Date.now())
  }, [channel])

  const lead = rows[0]
  if (!lead) return null
  const current = lead.status || "new"
  const presets = snoozePresets(now)
  const followAt = picking ? dayAt10(days, now) : follow
  const lostWithoutReason = status === "lost" && !reason

  const save = async () => {
    if (!channel || lostWithoutReason) return
    setSaving(true)
    try {
      const at = Date.now()
      const patch = outcomePatch(lead, { channel, status, lostReason: reason, followUpAt: followAt, note }, me, at, newPunchId)
      const { activity: _activity, ...rest } = patch as Record<string, unknown>
      const moved = "status" in rest
      const before = rows.map((r) => ({ id: r.id, prev: { ...undoPatch(r), ...(r === lead ? { activity: r.activity || [] } : {}) } }))
      await repo.update("enquiries", lead.id, patch)
      // The status (and its follow-up) reach every folded row, as the console's.
      if (moved && rows.length > 1) await Promise.all(rows.slice(1).map((r) => repo.update("enquiries", r.id, rest)))
      feedback.created()
      toast.show({
        message: channel === "call" ? "Call logged" : "Logged",
        tone: "success",
        onUndo: () =>
          void Promise.all(before.map(({ id, prev }) => repo.update("enquiries", id, prev))).then(
            () => toast.show({ message: "Put back", tone: "success" }),
            (e) => toast.show({ message: errorMessage(e, "Could not undo"), tone: "danger" }),
          ),
      })
      onClose()
    } catch (e) {
      feedback.error()
      toast.show({ message: errorMessage(e, "Could not save"), tone: "danger" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet visible={!!channel} onClose={onClose} title="How did it go?">
      <Text style={[textVariants.sectionLabel, styles.label, { color: t.textTertiary }]}>OUTCOME</Text>
      <View style={styles.chips}>
        {ENQUIRY_STATUS.map((s) => (
          <Chip
            key={s.id}
            label={s.id === current ? `${s.label} (now)` : s.label}
            active={(status || (channel === "call" && current === "new" ? "contacted" : current)) === s.id}
            onPress={() => {
              feedback.select()
              setStatus(s.id)
              if (s.id !== "lost") setReason("")
            }}
          />
        ))}
      </View>
      {status === "lost" ? (
        <>
          <Text style={[textVariants.sectionLabel, styles.label, { color: t.textTertiary }]}>WHY WAS IT LOST?</Text>
          <View style={styles.chips}>
            {LOST_REASONS.map((r) => (
              <Chip key={r} label={r} active={reason === r} onPress={() => (feedback.select(), setReason(r))} />
            ))}
          </View>
        </>
      ) : null}

      <Text style={[textVariants.sectionLabel, styles.label, { color: t.textTertiary }]}>NEXT FOLLOW-UP</Text>
      <View style={styles.chips}>
        <Chip label="None" active={!picking && !follow} onPress={() => (setPicking(false), setFollow(null))} />
        {presets.map((p) => (
          <Chip key={p.key} label={p.label} active={!picking && follow === p.at} onPress={() => (setPicking(false), setFollow(p.at))} />
        ))}
        <Chip label="Pick a date" active={picking} onPress={() => setPicking(true)} />
      </View>
      {picking ? (
        <View style={styles.stepper}>
          <IconButton name="minus" onPress={() => setDays((d) => Math.max(1, d - 1))} disabled={days <= 1} accessibilityLabel="A day earlier" />
          <Text style={[textVariants.bodyStrong, styles.day, { color: t.text }]}>{`${formatDate(dayAt10(days, now))}, 10 am`}</Text>
          <IconButton name="add" onPress={() => setDays((d) => Math.min(90, d + 1))} accessibilityLabel="A day later" />
        </View>
      ) : null}

      <TextField
        label="Note"
        value={note}
        onChangeText={setNote}
        placeholder={channel === "whatsapp" ? "What did you send?" : "What did they say?"}
        multiline
        numberOfLines={3}
      />
      <Button
        label={lostWithoutReason ? "Pick why it was lost" : "Save"}
        onPress={() => void save()}
        loading={saving}
        disabled={lostWithoutReason}
        fullWidth
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.sm, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  day: { flex: 1, textAlign: "center" },
})
