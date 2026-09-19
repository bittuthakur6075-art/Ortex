import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { daysWords, type LeaveRequest } from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { leaveDatesWords, todayIST } from "@/features/leave/leaveFormat"
import { daysFigure, dayUnit } from "@/features/leave/leaveLook"
import { DateBadge, LeaveStatusPill, TypeWell } from "@/features/leave/leaveUi"
import { loadDirectory } from "@/hooks/useRecordHistory"
import { feedback } from "@/lib/feedback"
import { attachmentUrl, cancel, getRequest, types as loadTypes } from "@/lib/leave"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  DataNotice,
  DetailSkeleton,
  Dialog,
  FactRow,
  Icon,
  type IconName,
  ImageViewer,
  Panel,
  useToast,
} from "@/ui"

const WHEN = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
})

/**
 * One leave request (Zoho People's leave detail): a header naming the type in
 * its colour, the From and To leaves with the day count beside them and the
 * status chip; then what happened to it as a timeline (applied, then waiting or
 * decided, by whom, when, with their note); then the facts. Cancel while it is
 * pending, or once approved if it has not started (the server gives the days
 * back). Approving and rejecting stay on the approvals page, where an admin
 * decides a queue rather than one request at a time.
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
    req?.status === "approved" ? "Approved" : req?.status === "rejected" ? "Rejected" : req?.status === "cancelled" ? "Cancelled" : ""
  const code = req?.type_code || ""
  const oneDay = !!req && req.from_day === req.to_day

  return (
    <AppScreen title="Leave request" back onBack={() => navigation.goBack()} inTabs={false}>
      <DataNotice error={error} onRetry={() => void load()} />
      {!req ? (
        <Panel padded>
          <Text style={[textVariants.body, { color: t.textSecondary }]}>This request no longer exists.</Text>
        </Panel>
      ) : (
        <>
          <Panel>
            <View style={styles.hero}>
              <View style={styles.heroHead}>
                <TypeWell code={code} size={44} />
                <View style={styles.heroTitle}>
                  <Text numberOfLines={2} style={[textVariants.title, { color: t.text }]}>
                    {typeName || "Leave"}
                  </Text>
                  <Text style={[textVariants.small, { color: t.textTertiary }]}>{leaveDatesWords(req)}</Text>
                </View>
                <LeaveStatusPill status={req.status} />
              </View>

              <View style={[styles.range, { backgroundColor: t.surfaceInset }]}>
                <DateBadge day={req.from_day} code={code} />
                {oneDay ? null : (
                  <>
                    <Icon name="forward" size={18} color={t.textTertiary} />
                    <DateBadge day={req.to_day} code={code} />
                  </>
                )}
                <View style={styles.rangeCount}>
                  <Text style={[textVariants.stat, { color: t.text }]}>{daysFigure(req.days)}</Text>
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                    {`${dayUnit(req.days)} of leave`}
                  </Text>
                </View>
              </View>
            </View>
          </Panel>

          <Panel title="Status">
            <View style={styles.timeline}>
              <Step icon="send" tone="primary" title="Applied" detail={WHEN.format(new Date(req.created_at))} first />
              {req.status === "pending" ? (
                <Step icon="clock" tone="pending" title="Waiting for approval" detail="An admin decides. You'll be notified." last />
              ) : (
                <Step
                  icon={req.status === "approved" ? "tick" : "close"}
                  tone={req.status === "approved" ? "success" : req.status === "rejected" ? "danger" : "muted"}
                  title={`${decidedWord}${decider && req.status !== "cancelled" ? ` by ${decider}` : ""}`}
                  detail={req.decided_at ? WHEN.format(new Date(req.decided_at)) : undefined}
                  note={req.decision_note || undefined}
                  last
                />
              )}
            </View>
          </Panel>

          <Panel title="Details">
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

type StepTone = "primary" | "pending" | "success" | "danger" | "muted"

function Step({
  icon,
  title,
  detail,
  note,
  tone,
  first,
  last,
}: {
  icon: IconName
  title: string
  detail?: string
  note?: string
  tone: StepTone
  first?: boolean
  last?: boolean
}) {
  const t = useTheme()
  // A decided step is a solid node; a waiting one is its tinted well, because
  // nothing has happened yet.
  const fill =
    tone === "success" ? t.success : tone === "danger" ? t.danger : tone === "muted" ? t.textTertiary : t.primary
  const pending = tone === "pending"
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.line, { backgroundColor: first ? "transparent" : t.border }]} />
        <View style={[styles.node, { backgroundColor: pending ? t.warningBg : fill }]}>
          <Icon name={icon} size={14} color={pending ? t.warning : t.textOnPrimary} variant={pending ? "Bulk" : "Linear"} />
        </View>
        <View style={[styles.line, { backgroundColor: last ? "transparent" : t.border }]} />
      </View>
      <View style={styles.stepBody}>
        <Text style={[textVariants.bodyStrong, { color: t.text }]}>{title}</Text>
        {detail ? <Text style={[textVariants.small, { color: t.textTertiary }]}>{detail}</Text> : null}
        {note ? (
          <View style={[styles.note, { backgroundColor: t.surfaceInset }]}>
            <Text style={[textVariants.small, { color: t.textSecondary }]}>{note}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  heroHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  heroTitle: { flex: 1, minWidth: 0, gap: 2 },
  range: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  rangeCount: { flex: 1, alignItems: "flex-end" },
  pad: { paddingHorizontal: gutter, paddingVertical: spacing.sm },
  timeline: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  step: { flexDirection: "row", gap: spacing.md },
  rail: { width: 26, alignItems: "center" },
  line: { width: 2, flex: 1, minHeight: 8 },
  node: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  stepBody: { flex: 1, paddingVertical: spacing.sm, gap: 2 },
  note: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: radius.sm },
  actions: { paddingHorizontal: gutter, paddingVertical: spacing.lg },
  hint: { paddingHorizontal: gutter, paddingBottom: spacing.lg },
})
