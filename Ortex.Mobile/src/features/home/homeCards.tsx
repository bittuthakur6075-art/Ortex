import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import type { AttentionItem, Delta } from "@/domain/dashboard"
import { formatCurrency } from "@/domain/format"
import { quoteSummary } from "@/domain/lists"
import type { Quotation } from "@/domain/schema"
import { dayLabel } from "@/features/attendance/format"
import { money as payMoney, monthLabel, type Claim, type Payslip } from "@/features/pay/payFormat"
import { decideCorrection, pendingCorrections } from "@/lib/attendance"
import { useCardLoad } from "@/features/home/cardLoad"
import { useCollection } from "@/hooks/useCollection"
import { callNumber } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import * as leaveLib from "@/lib/leave"
import { latestPayslip, myClaims } from "@/lib/pay"
import { useTheme } from "@/store/ThemeContext"
import { gutter } from "@/theme/tokens"
import { fontFamily } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import {
  Card,
  CardDivider,
  CardRow,
  CardRows,
  ONE_UI,
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

const money = (n: number) => (n ? formatCurrency(n, { compact: true }) : "₹0")

/** In place of a card that could not load: its name, and a way to try again. */
function LoadFailed({ title, onRetry }: { title: string; onRetry: () => void }) {
  const t = useTheme()
  return (
    <>
      <SubHeader title={title} />
      <Card>
        <CardRow
          icon="warning"
          tone="danger"
          title="Couldn't load"
          subtitle="Try again"
          accessibilityLabel={`Couldn't load ${title}. Try again`}
          onPress={onRetry}
          chevron={false}
          trailing={<Icon name="refresh" size={20} color={t.primary} />}
        />
      </Card>
    </>
  )
}

/** An 18dp line of text made a 48dp touch. */
const TEXT_LINK_SLOP = { top: 15, bottom: 15, left: 12, right: 12 }

/** "Show 3 more" under a card's rows: a full-width 48dp button. */
function MoreLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={() => {
        feedback.tap()
        onPress()
      }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.more, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.moreText, { color: t.primary }]}>{label}</Text>
    </Pressable>
  )
}

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
  icon?: IconName
  tone?: OneTone
  title: string
  count?: number
  countTone?: OneTone
  action?: string
  onAction?: () => void
}) {
  const t = useTheme()
  return (
    <View style={styles.head}>
      {icon ? <Well icon={icon} tone={tone} size={28} /> : null}
      <Text style={[styles.headTitle, { color: t.text }]}>{title}</Text>
      {count ? <Tag label={String(count)} tone={countTone} /> : null}
      <View style={styles.flex} />
      {action && onAction ? (
        <Pressable
          onPress={() => {
            feedback.tap()
            onAction()
          }}
          accessibilityRole="button"
          accessibilityLabel={`${action}, ${title}`}
          hitSlop={TEXT_LINK_SLOP}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[styles.headAction, { color: t.primary }]}>{`${action} ›`}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Quotations at a glance (moved here from the Quotations list): the open
 * value, how many lapse within three days, and what was won this month, as
 * compact pills. "All" opens the list.
 */
export function QuotesCard({ onAll }: { onAll: () => void }) {
  const t = useTheme()
  const { items, loading } = useCollection<Quotation>("quotations")
  // The clock is read when the quotes change, not per render.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    setNow(Date.now())
  }, [items])
  const s = React.useMemo(() => quoteSummary(items, now), [items, now])
  if (loading || !items.length) return null
  const pills = [
    { label: `Open · ${s.openCount}`, value: money(s.openValue), bg: t.surfaceInset, fg: t.text, sub: t.textSecondary },
    {
      label: "Expiring",
      value: String(s.expiring),
      bg: s.expiring ? t.warningBg : t.surfaceInset,
      fg: s.expiring ? t.warningText : t.text,
      sub: s.expiring ? t.warningText : t.textSecondary,
    },
    { label: `Won · ${s.wonCount}`, value: money(s.wonValue), bg: t.successBg, fg: t.successText, sub: t.successText },
  ]
  return (
    <Card style={styles.headed}>
      <CardHead icon="quote" tone="primary" title="Quotations" action="All" onAction={onAll} />
      <View style={styles.quotePills}>
        {pills.map((p) => (
          <View key={p.label} style={[styles.quotePill, { backgroundColor: p.bg }]} accessibilityLabel={`${p.label}: ${p.value}`}>
            <Text style={[styles.quoteValue, { color: p.fg }]} numberOfLines={1}>
              {p.value}
            </Text>
            <Text style={[styles.quoteLabel, { color: p.sub }]} numberOfLines={1}>
              {p.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

/** A small round pill button (Chase, Quote, Approve). */
function PillButton({
  label,
  kind = "tonal",
  onPress,
  busy,
  accessibilityLabel,
}: {
  label: string
  kind?: "primary" | "tonal" | "grey"
  onPress: () => void
  busy?: boolean
  accessibilityLabel?: string
}) {
  const t = useTheme()
  const bg = kind === "primary" ? t.primary : kind === "tonal" ? t.primaryBg : t.surfaceInset
  const ink = kind === "primary" ? t.textOnPrimary : kind === "tonal" ? t.primaryText : t.text
  return (
    <Pressable
      disabled={busy}
      onPress={() => {
        feedback.tap()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      // A 36dp pill: the slop makes it a 48dp touch.
      hitSlop={6}
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
      <Card style={styles.headed}>
        <CardHead title="All Caught Up" />
        <Text style={[styles.needsSummary, { color: t.textSecondary }]}>
          No lead is waiting and no quote is about to lapse
        </Text>
      </Card>
    )
  }
  const quotes = items.filter((i) => i.target.screen === "QuotationDetail").length
  const leads = items.length - quotes
  const summary = [
    leads ? `${leads} ${leads === 1 ? "lead" : "leads"} to call` : null,
    quotes ? `${quotes} ${quotes === 1 ? "quote" : "quotes"} to chase` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const urgent = items.some((i) => i.tone === "rose")
  const rest = items.length - limit
  return (
    <Card style={styles.headed}>
      <CardHead
        icon="bell"
        tone={urgent ? "danger" : "warning"}
        title="Needs You Now"
        count={items.length}
        countTone={urgent ? "danger" : "warning"}
        action="All"
        onAction={onAll}
      />
      <Text style={[styles.needsSummary, { color: t.textSecondary }]}>{summary}</Text>
      <CardRows>
        {items.slice(0, limit).map((it) => (
          <CardRow
            key={it.id}
            icon={it.icon}
            tone={ATTENTION_TONE[it.tone]}
            title={it.title}
            subtitle={it.amount ? `${it.detail} · ${money(it.amount)}` : it.detail}
            chevron={!it.phone}
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
              ) : undefined
            }
          />
        ))}
      </CardRows>
      {rest > 0 ? <MoreLink label={`Show ${rest} more`} onPress={onAll} /> : null}
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
            <Text style={[styles.quickLabel, { color: t.text }]} numberOfLines={2}>
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
        <Text
          style={[styles.tileValue, { color: t.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
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
      <SquircleBackground fill={t.surfaceRaised} radius={ONE_UI.radius} />
      <View style={styles.widgetHead}>
        <Well icon={icon} tone={tone} size={24} />
        <Text style={[styles.tileLabel, { color: t.textSecondary }]} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      </View>
      <View style={styles.tileValueRow}>
        <Text
          style={[styles.widgetValue, { color: t.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
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

/** How long an approval waits for Undo before it is written. */
const UNDO_MS = 5000

/**
 * Approvals, decided in place: leave and attendance corrections waiting for an
 * admin. Approve is one tap; Decline asks for a reason, so it opens the
 * approvals page (the database requires the note to reach the person).
 */
export function ApprovalsCard({ onAll }: { onAll: () => void }) {
  const toast = useToast()
  const { data: items, error, retry } = useCardLoad<Decision[]>("approvals", async () => {
    const [leave, corr] = await Promise.all([leaveLib.pendingLeave(), pendingCorrections()])
    return [
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
    ]
  })
  // Approved but still inside the Undo window, and the one being written now:
  // both show the row as busy until the list reloads without it.
  const [held, setHeld] = React.useState<Set<string>>(() => new Set())
  const [busy, setBusy] = React.useState<string | null>(null)
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const release = (id: string) =>
    setHeld((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })

  const commit = async (d: Decision) => {
    timers.current.delete(d.id)
    setBusy(d.id)
    try {
      if (d.kind === "leave") await leaveLib.decideLeave(d.id, true)
      else await decideCorrection(d.id, true)
      feedback.created()
      retry()
    } catch (e) {
      feedback.error()
      toast.show({ message: (e as Error).message, tone: "danger" })
      release(d.id)
    } finally {
      setBusy(null)
    }
  }

  // Approve waits out the Undo toast before it writes, so a slip of the thumb
  // costs nothing; Decline needs a note, so it opens the approvals page.
  const approve = (d: Decision) => {
    setHeld((s) => new Set(s).add(d.id))
    timers.current.set(d.id, setTimeout(() => void commit(d), UNDO_MS))
    toast.show({
      message: d.kind === "leave" ? "Leave approved" : "Correction approved",
      tone: "success",
      durationMs: UNDO_MS,
      onUndo: () => {
        clearTimeout(timers.current.get(d.id))
        timers.current.delete(d.id)
        release(d.id)
      },
    })
  }

  if (error) return <LoadFailed title="Approvals" onRetry={retry} />
  const shown = items ?? []
  const pending = (id: string) => held.has(id) || busy === id
  if (!shown.length) return null
  return (
    <Card style={styles.headed}>
      <CardHead
        icon="tick"
        tone="violet"
        title="Approvals"
        count={shown.length}
        countTone="violet"
        action="All"
        onAction={onAll}
      />
      {shown.slice(0, 3).map((d, i) => (
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
                <PillButton
                  label="Decline"
                  kind="grey"
                  busy={pending(d.id)}
                  accessibilityLabel={`Decline ${d.title}`}
                  onPress={onAll}
                />
              </View>
              <View style={styles.flex}>
                <PillButton
                  label={pending(d.id) ? "Approving" : "Approve"}
                  kind="primary"
                  busy={pending(d.id)}
                  accessibilityLabel={`Approve ${d.title}`}
                  onPress={() => approve(d)}
                />
              </View>
            </View>
          </View>
        </React.Fragment>
      ))}
      {shown.length > 3 ? <MoreLink label={`Show ${shown.length - 3} more`} onPress={onAll} /> : null}
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
  const { data, error, retry } = useCardLoad("requests", async () => {
    const [leave, claims] = await Promise.all([leaveLib.myRequests(), myClaims()])
    const recent = (d: string) => Date.now() - new Date(d).getTime() < 30 * 86400000
    return [
      ...leave
        .filter((r) => r.status === "pending" || recent(r.created_at))
        .map((r) => ({
          key: `l${r.id}`,
          icon: "calendar" as IconName,
          tone: "violet" as OneTone,
          title: `Leave, ${dayLabel(r.from_day)}${r.to_day !== r.from_day ? ` to ${dayLabel(r.to_day)}` : ""}`,
          sub: r.days === 1 ? "1 day" : `${r.days} days`,
          status: r.status,
          open: onLeave,
        })),
      ...claims
        .filter((c: Claim) => c.status === "pending" || recent(c.created_at))
        .map((c: Claim) => ({
          key: `c${c.id}`,
          icon: "invoice" as IconName,
          tone: "success" as OneTone,
          title: `${c.category} claim, ${payMoney(c.amount)}`,
          sub: dayLabel(c.bill_date),
          status: c.status,
          open: onClaims,
        })),
    ].slice(0, 3)
  })
  if (error) return <LoadFailed title="Your requests" onRetry={retry} />
  const rows = data ?? []
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
  const { data, error, retry } = useCardLoad("leave", async () =>
    (await leaveLib.balances()).filter((b) => b.paid).slice(0, 4),
  )
  if (error) return <LoadFailed title="Leave balance" onRetry={retry} />
  const rows = data ?? []
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
  const { data: slip, error, retry } = useCardLoad<Payslip | null>("pay", latestPayslip)
  if (error) return <LoadFailed title="Pay" onRetry={retry} />
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
  quotePills: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  quotePill: { flex: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignItems: "flex-start" },
  quoteValue: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
  quoteLabel: { fontFamily: fontFamily.medium, fontSize: 11.5, lineHeight: 15 },
  needsSummary: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 18, paddingHorizontal: gutter, paddingBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: gutter, paddingBottom: 8 },
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
    paddingHorizontal: gutter,
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
  more: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  moreText: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
})
