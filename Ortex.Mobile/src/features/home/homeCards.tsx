import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import type { AttentionItem, Delta } from "@/domain/dashboard"
import { formatCurrency } from "@/domain/format"
import { dayLabel } from "@/features/attendance/format"
import { money as payMoney, monthLabel, type Claim, type Payslip } from "@/features/pay/payFormat"
import { decideCorrection, pendingCorrections } from "@/lib/attendance"
import { callNumber } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import * as leaveLib from "@/lib/leave"
import { latestPayslip, myClaims } from "@/lib/pay"
import { useTheme } from "@/store/ThemeContext"
import { fontFamily } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import {
  Card,
  CardDivider,
  CardRow,
  CardRows,
  SubHeader,
  Tag,
  Well,
  useOneTone,
  type OneTone,
} from "@/ui/OneUi"
import { useToast } from "@/ui"
import { SquircleBackground } from "@/ui/Squircle"

/**
 * The cards of the One UI Home (Figma "V2 · One UI 8 · Mobile Home by role"),
 * each drawn to its frame: a card head is a 28 round well, a 17 semibold title,
 * an optional count tag and an "All ›" link, 20 in; rows are the shared CardRow.
 * HomeScreen picks which cards a role gets.
 */

const money = (n: number) => formatCurrency(n, { compact: true })

/** The head every Home card opens with. */
export function CardHead({
  icon,
  tone,
  title,
  count,
  countTone = "primary",
  action,
  onAction,
}: {
  icon: IconName
  tone: OneTone
  title: string
  count?: number
  countTone?: OneTone
  action?: string
  onAction?: () => void
}) {
  const t = useTheme()
  return (
    <View style={styles.head}>
      <Well icon={icon} tone={tone} size={28} />
      <Text style={[styles.headTitle, { color: t.text }]}>{title}</Text>
      {count ? <Tag label={String(count)} tone={countTone} /> : null}
      <View style={styles.flex} />
      {action && onAction ? (
        <Text
          onPress={() => {
            feedback.tap()
            onAction()
          }}
          suppressHighlighting
          accessibilityRole="link"
          style={[styles.headAction, { color: t.primary }]}
        >
          {`${action} ›`}
        </Text>
      ) : null}
    </View>
  )
}

/** A small round pill button (Chase, Quote, Approve). */
function PillButton({
  label,
  kind = "tonal",
  onPress,
  busy,
}: {
  label: string
  kind?: "primary" | "tonal" | "grey"
  onPress: () => void
  busy?: boolean
}) {
  const t = useTheme()
  const bg = kind === "primary" ? t.primary : kind === "tonal" ? t.primary10 : t.surfaceInset
  const ink = kind === "primary" ? t.textOnPrimary : kind === "tonal" ? t.primary : t.text
  return (
    <Pressable
      disabled={busy}
      onPress={() => {
        feedback.tap()
        onPress()
      }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.pill, { backgroundColor: bg, opacity: pressed || busy ? 0.6 : 1 }]}
    >
      <Text style={[styles.pillText, { color: ink }]}>{label}</Text>
    </Pressable>
  )
}

const ATTENTION_TONE: Record<AttentionItem["tone"], OneTone> = {
  rose: "danger",
  amber: "warning",
  primary: "primary",
}

/** Needs you now: the attention list, each row ending in its action. */
export function NeedsYouCard({
  items,
  limit,
  onOpen,
  onAll,
}: {
  items: AttentionItem[]
  limit: number
  onOpen: (it: AttentionItem) => void
  onAll: () => void
}) {
  const t = useTheme()
  if (!items.length) {
    return (
      <Card>
        <CardHead icon="bell" tone="success" title="Needs you now" />
        <CardRow
          icon="tick"
          tone="success"
          title="You're all caught up"
          subtitle="No lead is waiting and no quote is about to lapse"
        />
      </Card>
    )
  }
  return (
    <Card style={styles.headed}>
      <CardHead
        icon="bell"
        tone="danger"
        title="Needs you now"
        count={items.length}
        action="All"
        onAction={onAll}
      />
      <CardRows>
        {items.slice(0, limit).map((it) => (
          <CardRow
            key={it.id}
            icon={it.icon}
            tone={ATTENTION_TONE[it.tone]}
            title={it.title}
            subtitle={it.amount ? `${it.detail} · ${money(it.amount)}` : it.detail}
            chevron={false}
            onPress={() => onOpen(it)}
            trailing={
              it.phone ? (
                <Pressable
                  onPress={() => void callNumber(it.phone)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${it.title}`}
                  style={[styles.call, { backgroundColor: t.successBg }]}
                >
                  <Icon name="call" size={20} color={t.successText} variant="Bulk" />
                </Pressable>
              ) : (
                <PillButton label={it.icon === "quote" ? "Chase" : "Open"} onPress={() => onOpen(it)} />
              )
            }
          />
        ))}
      </CardRows>
    </Card>
  )
}

/** Four shortcuts in one card, at thumb height: a 52 round well over a label. */
export function QuickActionsCard({
  items,
}: {
  items: { icon: IconName; label: string; tone?: OneTone; onPress: () => void }[]
}) {
  const t = useTheme()
  return (
    <Card style={styles.quick}>
      <View style={styles.quickRow}>
        {items.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              feedback.tap()
              a.onPress()
            }}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={({ pressed }) => [styles.quickItem, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Well icon={a.icon} tone={a.tone || "primary"} size={52} />
            <Text style={[styles.quickLabel, { color: t.textSecondary }]} numberOfLines={1}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  )
}

/** "↑ 23%", "+4 pts", "No change" as a tag. */
export function DeltaTag({ d, points }: { d: Delta | null | undefined; points?: boolean }) {
  if (!d || d.dir === "flat") return null
  const up = d.dir === "up"
  const label = points
    ? `${up ? "+" : ""}${Math.round(d.diff)} pts`
    : d.pct == null
    ? "New"
    : `${up ? "↑" : "↓"} ${Math.abs(d.pct)}%`
  return <Tag label={label} tone={up ? "success" : "danger"} />
}

/** An inset tile inside a card: UPPERCASE label, 22 value, optional tag and note. */
export function InsetTile({
  label,
  value,
  tag,
  note,
}: {
  label: string
  value: string
  tag?: React.ReactNode
  note?: string
}) {
  const t = useTheme()
  return (
    <View style={styles.tile}>
      <SquircleBackground fill={t.surfaceInset} radius={18} />
      <Text style={[styles.tileLabel, { color: t.textTertiary }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.tileValueRow}>
        <Text style={[styles.tileValue, { color: t.text }]} numberOfLines={1}>
          {value}
        </Text>
        {tag}
      </View>
      {note ? (
        <Text style={[styles.tileNote, { color: t.textTertiary }]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </View>
  )
}

/** Fourteen thin columns, the last one solid: the period at a glance. */
export function Columns({ values }: { values: number[] }) {
  const t = useTheme()
  const max = Math.max(1, ...values)
  return (
    <View style={styles.columns}>
      {values.map((v, i) => (
        <View
          key={i}
          style={[
            styles.column,
            {
              height: Math.max(6, Math.round((v / max) * 60)),
              backgroundColor: t.primary,
              opacity: i === values.length - 1 ? 1 : 0.22,
            },
          ]}
        />
      ))}
    </View>
  )
}

/** Four cells: open quotes by age, the old ones tinted to be chased. */
export function AgeCells({
  cells,
}: {
  cells: { key: string; label: string; count: number; tone: "emerald" | "amber" | "rose" }[]
}) {
  const t = useTheme()
  const tint = useOneTone()
  return (
    <View style={styles.cells}>
      {cells.map((c) => {
        const hot = c.count > 0 && c.tone !== "emerald"
        const tone = hot ? tint(c.tone === "rose" ? "danger" : "warning") : null
        return (
          <View key={c.key} style={styles.cell}>
            <SquircleBackground fill={tone ? tone.bg : t.surfaceInset} radius={18} />
            <Text style={[styles.cellValue, { color: tone ? tone.fg : t.text }]}>{c.count}</Text>
            <Text style={[styles.cellLabel, { color: tone ? tone.fg : t.textTertiary }]} numberOfLines={1}>
              {c.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/** A white widget on the canvas (Business grid, Leave balance): 22 radius, 16 padding. */
export function Widget({
  icon,
  tone,
  label,
  value,
  tag,
  note,
}: {
  icon: IconName
  tone: OneTone
  label: string
  value: string
  tag?: React.ReactNode
  note?: string
}) {
  const t = useTheme()
  return (
    <View style={styles.widget}>
      <SquircleBackground fill={t.surfaceRaised} radius={22} />
      <View style={styles.widgetHead}>
        <Well icon={icon} tone={tone} size={24} />
        <Text style={[styles.tileLabel, { color: t.textSecondary }]} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      </View>
      <View style={styles.tileValueRow}>
        <Text style={[styles.widgetValue, { color: t.text }]} numberOfLines={1}>
          {value}
        </Text>
        {tag}
      </View>
      {note ? (
        <Text style={[styles.tileNote, { color: t.textTertiary }]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </View>
  )
}

export function WidgetGrid({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children)
  const rows: React.ReactNode[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return (
    <View style={styles.grid}>
      {rows.map((r, i) => (
        <View key={i} style={styles.gridRow}>
          {r}
        </View>
      ))}
    </View>
  )
}

// ---- admins: approvals ---------------------------------------------------------------

type Decision = { id: string; kind: "leave" | "correction"; title: string; sub: string }

/**
 * Approvals, decided in place: leave and attendance corrections waiting for an
 * admin. Approve is one tap; Decline asks for a reason, so it opens the
 * approvals page (the database requires the note to reach the person).
 */
export function ApprovalsCard({ onAll }: { onAll: () => void }) {
  const t = useTheme()
  const toast = useToast()
  const [items, setItems] = React.useState<Decision[] | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const [leave, corr] = await Promise.all([
      leaveLib.pendingLeave().catch(() => []),
      pendingCorrections().catch(() => []),
    ])
    setItems([
      ...leave.map((r) => ({
        id: r.id,
        kind: "leave" as const,
        title: `${r.person} · ${r.days === 1 ? "1 day" : `${r.days} days`} leave`,
        sub: `${dayLabel(r.from_day)}${r.to_day !== r.from_day ? ` to ${dayLabel(r.to_day)}` : ""}${
          r.reason ? ` · ${r.reason}` : ""
        }`,
      })),
      ...corr.map((c) => ({
        id: c.id,
        kind: "correction" as const,
        title: `${c.person} · correction`,
        sub: `${dayLabel(c.day)}${c.reason ? ` · ${c.reason}` : ""}`,
      })),
    ])
  }, [])
  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  if (!items?.length) return null
  const approve = async (d: Decision) => {
    setBusy(d.id)
    try {
      if (d.kind === "leave") await leaveLib.decideLeave(d.id, true)
      else await decideCorrection(d.id, true)
      feedback.created()
      toast.show({ message: d.kind === "leave" ? "Leave approved" : "Correction approved", tone: "success" })
      await load()
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "danger" })
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card style={styles.headed}>
      <CardHead
        icon="tick"
        tone="violet"
        title="Approvals"
        count={items.length}
        countTone="violet"
        action="All"
        onAction={onAll}
      />
      {items.slice(0, 3).map((d, i) => (
        <React.Fragment key={d.id}>
          {i > 0 ? <CardDivider inset={16} /> : null}
          <View style={styles.decide}>
            <CardRow
              icon={d.kind === "leave" ? "calendar" : "clock"}
              tone={d.kind === "leave" ? "violet" : "warning"}
              title={d.title}
              subtitle={d.sub}
            />
            <View style={styles.decideButtons}>
              <View style={styles.flex}>
                <PillButton label="Decline" kind="grey" onPress={onAll} />
              </View>
              <View style={styles.flex}>
                <PillButton
                  label={busy === d.id ? "Approving" : "Approve"}
                  kind="primary"
                  busy={busy === d.id}
                  onPress={() => void approve(d)}
                />
              </View>
            </View>
          </View>
        </React.Fragment>
      ))}
      {items.length > 3 ? (
        <Text onPress={onAll} style={[styles.more, { color: t.primary }]}>{`Show ${
          items.length - 3
        } more`}</Text>
      ) : null}
    </Card>
  )
}

// ---- staff: requests, leave, pay, coming up ---------------------------------------------

const REQ_TAG: Record<string, { label: string; tone: OneTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  paid: { label: "Paid", tone: "success" },
}

/** What the office owes this person an answer on: recent leave requests and claims. */
export function RequestsCard({ onLeave, onClaims }: { onLeave: () => void; onClaims: () => void }) {
  const [rows, setRows] = React.useState<
    {
      key: string
      icon: IconName
      tone: OneTone
      title: string
      sub: string
      status: string
      open: () => void
    }[]
  >([])
  useFocusEffect(
    React.useCallback(() => {
      let alive = true
      void Promise.all([leaveLib.myRequests().catch(() => []), myClaims().catch(() => [] as Claim[])]).then(
        ([leave, claims]) => {
          if (!alive) return
          const recent = (d: string) => Date.now() - new Date(d).getTime() < 30 * 86400000
          setRows(
            [
              ...leave
                .filter((r) => r.status === "pending" || recent(r.created_at))
                .map((r) => ({
                  key: `l${r.id}`,
                  icon: "calendar" as IconName,
                  tone: "violet" as OneTone,
                  title: `Leave, ${dayLabel(r.from_day)}${
                    r.to_day !== r.from_day ? ` to ${dayLabel(r.to_day)}` : ""
                  }`,
                  sub: r.days === 1 ? "1 day" : `${r.days} days`,
                  status: r.status,
                  open: onLeave,
                })),
              ...claims
                .filter((c) => c.status === "pending" || recent(c.created_at))
                .map((c) => ({
                  key: `c${c.id}`,
                  icon: "invoice" as IconName,
                  tone: "success" as OneTone,
                  title: `${c.category} claim, ${payMoney(c.amount)}`,
                  sub: dayLabel(c.bill_date),
                  status: c.status,
                  open: onClaims,
                })),
            ].slice(0, 3),
          )
        },
      )
      return () => {
        alive = false
      }
    }, [onLeave, onClaims]),
  )
  if (!rows.length) return null
  return (
    <>
      <SubHeader title="Your requests" action="All" onAction={onLeave} />
      <Card>
        <CardRows>
          {rows.map((r) => (
            <CardRow
              key={r.key}
              icon={r.icon}
              tone={r.tone}
              title={r.title}
              subtitle={r.sub}
              chevron={false}
              trailing={
                REQ_TAG[r.status] ? (
                  <Tag label={REQ_TAG[r.status].label} tone={REQ_TAG[r.status].tone} />
                ) : undefined
              }
              onPress={r.open}
            />
          ))}
        </CardRows>
      </Card>
    </>
  )
}

const LEAVE_LOOK: Record<string, { icon: IconName; tone: OneTone }> = {
  CL: { icon: "calendar", tone: "primary" },
  SL: { icon: "warning", tone: "danger" },
  EL: { icon: "tick", tone: "success" },
  CO: { icon: "clock", tone: "warning" },
}

/** Leave balance as a 2 × 2 grid of white widgets (paid types only). */
export function LeaveBalanceGrid({ onOpen }: { onOpen: () => void }) {
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof leaveLib.balances>>>([])
  useFocusEffect(
    React.useCallback(() => {
      let alive = true
      void leaveLib
        .balances()
        .then((r) => alive && setRows(r.filter((b) => b.paid).slice(0, 4)))
        .catch(() => undefined)
      return () => {
        alive = false
      }
    }, []),
  )
  if (!rows.length) return null
  return (
    <>
      <SubHeader title="Leave balance" action="Ledger" onAction={onOpen} />
      <WidgetGrid>
        {rows.map((b) => (
          <Widget
            key={b.code}
            icon={LEAVE_LOOK[b.code]?.icon || "calendar"}
            tone={LEAVE_LOOK[b.code]?.tone || "primary"}
            label={b.name}
            value={String(Number((b.available || 0).toFixed(1)))}
            note={b.annual ? `of ${b.annual} this year` : b.pending ? `${b.pending} pending` : "days left"}
          />
        ))}
      </WidgetGrid>
    </>
  )
}

/** The last payslip, one row, only once there is one. */
export function PayCard({ onOpen }: { onOpen: (id: string) => void }) {
  const [slip, setSlip] = React.useState<Payslip | null>(null)
  useFocusEffect(
    React.useCallback(() => {
      let alive = true
      void latestPayslip().then((s) => alive && setSlip(s))
      return () => {
        alive = false
      }
    }, []),
  )
  if (!slip) return null
  return (
    <>
      <SubHeader title="Pay" />
      <Card>
        <CardRow
          icon="money"
          tone="success"
          title={`${monthLabel(slip.data.month)} payslip`}
          subtitle={`Paid ${dayLabel(slip.released_at.slice(0, 10))} · ${payMoney(
            slip.data.netPay ?? slip.net_pay,
          )} in hand`}
          onPress={() => onOpen(slip.id)}
        />
      </Card>
    </>
  )
}

/** The next holiday, when there is one. */
export function ComingUpCard({ holiday }: { holiday: { name: string; day: string } | null | undefined }) {
  if (!holiday) return null
  return (
    <>
      <SubHeader title="Coming up" />
      <Card>
        <CardRow
          icon="calendar"
          tone="violet"
          title={`${holiday.name}, ${dayLabel(holiday.day)}`}
          subtitle="Holiday · office closed"
        />
      </Card>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headed: { paddingTop: 18 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  headTitle: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22 },
  headAction: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 18 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontFamily: fontFamily.semibold, fontSize: 13.5, lineHeight: 17 },
  call: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  quick: { paddingVertical: 16 },
  quickRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 },
  quickItem: { width: 82, alignItems: "center", gap: 8 },
  quickLabel: { fontFamily: fontFamily.medium, fontSize: 12.5, lineHeight: 16, textAlign: "center" },
  tile: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12, gap: 5 },
  tileLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5, lineHeight: 14, letterSpacing: 0.5 },
  tileValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileValue: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 28, flexShrink: 1 },
  tileNote: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
  columns: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    height: 60,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  column: { flex: 1, borderRadius: 4 },
  cells: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  cell: { flex: 1, paddingVertical: 12, alignItems: "center", gap: 2 },
  cellValue: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 28 },
  cellLabel: { fontFamily: fontFamily.medium, fontSize: 11.5, lineHeight: 14 },
  widget: { flex: 1, minWidth: 0, padding: 16, gap: 6 },
  widgetHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  widgetValue: {
    fontFamily: fontFamily.semibold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  grid: { paddingHorizontal: 12, gap: 10, marginBottom: 12 },
  gridRow: { flexDirection: "row", gap: 10 },
  decide: { paddingBottom: 14 },
  decideButtons: { flexDirection: "row", gap: 8, paddingLeft: 16 + 38 + 14, paddingRight: 16, marginTop: -2 },
  more: { fontFamily: fontFamily.semibold, fontSize: 13.5, textAlign: "center", paddingVertical: 10 },
})
