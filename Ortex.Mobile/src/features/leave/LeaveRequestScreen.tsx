import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { daysWords, type LeaveRequest } from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { leaveDatesWords, todayIST } from "@/features/leave/leaveFormat"
import { LeaveStatusPill } from "@/features/leave/leaveUi"
import { loadDirectory } from "@/hooks/useRecordHistory"
import { feedback } from "@/lib/feedback"
import { attachmentUrl, cancel, getRequest, types as loadTypes } from "@/lib/leave"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Button, DataNotice, DetailSkeleton, Dialog, FactRow, ImageViewer, Panel, useToast } from "@/ui"

const WHEN = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
})

/**
 * One leave request: what was asked, and what happened to it, as a timeline
 * (Revolut Business reference): submitted, then waiting or decided, by whom,
 * with their note. Cancel while it is pending, or once approved if it has not
 * started (the server gives the days back).
 */
export default function LeaveRequestScreen({ navigation, route }: StackScreenProps<"LeaveRequest">) {
  const t = useTheme()
  const toast = useToast()
  const { session } = useAuth()
  const [req, setReq] = React.useState<LeaveRequest | null | undefined>(undefined)
  const [typeName, setTypeName] = React.useState("")
  const [decider, setDecider] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const [r, ty, dir] = await Promise.all([getRequest(route.params.id), loadTypes().catch(() => []), loadDirectory()])
      setReq(r)
      setTypeName(ty.find((x) => x.code === r?.type_code)?.name || r?.type_code || "Leave")
      setDecider(r?.decided_by ? dir[r.decided_by]?.name || "An admin" : "")
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that request.")
      setReq((r) => (r === undefined ? null : r))
    }
  }, [route.params.id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (req === undefined) return <DetailSkeleton onBack={() => navigation.goBack()} />

  const mine = req?.user_id === session?.user?.id
  const canCancel =
    !!req && mine && (req.status === "pending" || (req.status === "approved" && req.from_day > todayIST()))

  const doCancel = async () => {
    if (!req) return
    setConfirm(false)
    setBusy(true)
    try {
      await cancel(req.id)
      feedback.created()
      toast.show({
        message: req.status === "approved" ? "Leave cancelled. The days are back in your balance." : "Request cancelled.",
        tone: "success",
      })
      await load()
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "Could not cancel.", tone: "danger" })
    }
    setBusy(false)
  }

  const openAttachment = async () => {
    const url = await attachmentUrl(req?.attachment_path)
    if (url) setPhoto(url)
    else toast.show({ message: "The document could not be opened.", tone: "danger" })
  }

  const decidedWord =
    req?.status === "approved" ? "Approved" : req?.status === "rejected" ? "Not approved" : req?.status === "cancelled" ? "Cancelled" : ""

  return (
    <AppScreen title={typeName || "Leave"} subtitle={req ? leaveDatesWords(req) : undefined} back onBack={() => navigation.goBack()} inTabs={false}>
      <DataNotice error={error} onRetry={() => void load()} />
      {!req ? (
        <Panel padded>
          <Text style={[textVariants.body, { color: t.textSecondary }]}>This request no longer exists.</Text>
        </Panel>
      ) : (
        <>
          <Panel title="Request" action={<LeaveStatusPill status={req.status} />}>
            <FactRow icon="calendar" label="Dates" value={leaveDatesWords(req)} />
            <FactRow icon="clock" label="Counts as" value={daysWords(req.days)} />
            {req.sandwich ? (
              <FactRow icon="info" label="Rule" value="Includes a weekly off or holiday (sandwich rule)" />
            ) : null}
            <FactRow icon="edit" label="Reason" value={req.reason} />
            {req.attachment_path ? (
              <View style={styles.pad}>
                <Button label="Open the document" icon="image" variant="secondary" size="md" onPress={() => void openAttachment()} />
              </View>
            ) : null}
          </Panel>

          <Panel title="What happened">
            <View style={styles.timeline}>
              <Step done title="Submitted" detail={WHEN.format(new Date(req.created_at))} first />
              {req.status === "pending" ? (
                <Step title="Waiting for approval" detail="An admin decides. You'll be notified." last />
              ) : (
                <Step
                  done
                  tone={req.status === "approved" ? "success" : req.status === "rejected" ? "danger" : "muted"}
                  title={`${decidedWord}${decider && req.status !== "cancelled" ? ` by ${decider}` : ""}`}
                  detail={[req.decided_at ? WHEN.format(new Date(req.decided_at)) : "", req.decision_note || ""]
                    .filter(Boolean)
                    .join(" · ")}
                  last
                />
              )}
            </View>
          </Panel>

          {canCancel ? (
            <View style={styles.actions}>
              <Button
                label={req.status === "approved" ? "Cancel this leave" : "Cancel request"}
                variant="outline-danger"
                fullWidth
                loading={busy}
                onPress={() => setConfirm(true)}
              />
            </View>
          ) : null}
          {mine && req.status === "approved" && req.from_day <= todayIST() ? (
            <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
              {`Leave that has started (${dayLabel(req.from_day)}) can only be cancelled by an admin.`}
            </Text>
          ) : null}
        </>
      )}

      <Dialog
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={req?.status === "approved" ? "Cancel this leave?" : "Cancel this request?"}
        message={
          req?.status === "approved"
            ? "The days go back into your balance, and your attendance for those days is worked out again."
            : "The request is withdrawn before an admin decides."
        }
        actions={[
          { label: "Keep it", onPress: () => setConfirm(false) },
          { label: "Cancel it", tone: "danger", onPress: () => void doCancel() },
        ]}
      />
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

function Step({
  title,
  detail,
  done,
  tone = "primary",
  first,
  last,
}: {
  title: string
  detail?: string
  done?: boolean
  tone?: "primary" | "success" | "danger" | "muted"
  first?: boolean
  last?: boolean
}) {
  const t = useTheme()
  const color =
    tone === "success" ? t.success : tone === "danger" ? t.danger : tone === "muted" ? t.textTertiary : t.primary
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.line, { backgroundColor: first ? "transparent" : t.border }]} />
        <View
          style={[
            styles.node,
            done ? { backgroundColor: color } : { borderWidth: 2, borderColor: t.border, backgroundColor: t.surface },
          ]}
        />
        <View style={[styles.line, { backgroundColor: last ? "transparent" : t.border }]} />
      </View>
      <View style={styles.stepBody}>
        <Text style={[textVariants.bodyStrong, { color: t.text }]}>{title}</Text>
        {detail ? <Text style={[textVariants.small, { color: t.textTertiary }]}>{detail}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: gutter, paddingVertical: spacing.sm },
  timeline: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  step: { flexDirection: "row", gap: spacing.md },
  rail: { width: 14, alignItems: "center" },
  line: { width: 2, flex: 1, minHeight: 8 },
  node: { width: 14, height: 14, borderRadius: radius.pill },
  stepBody: { flex: 1, paddingVertical: spacing.sm, gap: 2 },
  actions: { paddingHorizontal: gutter, paddingVertical: spacing.lg },
  hint: { paddingHorizontal: gutter, paddingBottom: spacing.lg },
})
