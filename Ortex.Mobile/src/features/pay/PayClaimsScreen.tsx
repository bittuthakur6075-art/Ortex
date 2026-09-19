import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatDate } from "@/domain/format"
import { ClaimIconWell } from "@/features/pay/claimIcons"
import { CLAIM_STATUS_LABEL, money, type Claim, type ClaimStatus } from "@/features/pay/payFormat"
import { ClaimStatusPill, PayListSkeleton, StatStrip } from "@/features/pay/payUi"
import { feedback } from "@/lib/feedback"
import { cancelClaim, myClaims, receiptUrl } from "@/lib/pay"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  DataNotice,
  Dialog,
  EmptyState,
  ImageViewer,
  ListRefreshControl,
  ListRow,
  Panel,
  RowSeparator,
  SegmentedControl,
  Sheet,
  Skeleton,
  useToast,
} from "@/ui"

type Tab = "pending" | "approved" | "paid" | "closed"

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "closed", label: "Rejected" },
]

/** Which tab a claim is listed under. A withdrawn claim sits with the rejected ones: both are closed unpaid. */
const tabOf = (s: ClaimStatus): Tab => (s === "rejected" || s === "cancelled" ? "closed" : s)

const EMPTY: Record<Tab, string> = {
  pending: "Nothing is waiting for approval.",
  approved: "No approved claims waiting for payment. Approved claims are paid with your next salary.",
  paid: "No claims paid yet. Paid claims show on that month's payslip.",
  closed: "No rejected or withdrawn claims.",
}

/**
 * Reimbursement claims, laid out like Zoho Payroll's: the totals by status,
 * then the claims under status tabs (Waiting, Approved, Paid, Rejected), each
 * row led by its category's glyph with the bill date, the amount and a status
 * pill. A row opens a sheet with the bill, the decision and, while it is still
 * waiting, a way to withdraw it.
 */
export default function PayClaimsScreen({ navigation }: StackScreenProps<"PayClaims">) {
  const t = useTheme()
  const toast = useToast()
  const [claims, setClaims] = React.useState<Claim[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [tab, setTab] = React.useState<Tab>("pending")
  const [open, setOpen] = React.useState<Claim | null>(null)
  const [confirm, setConfirm] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [photo, setPhoto] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      setClaims(await myClaims())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your claims.")
      setClaims((c) => c ?? [])
    }
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  const all = claims || []
  const totalOf = (s: ClaimStatus) => all.filter((c) => c.status === s).reduce((sum, c) => sum + c.amount, 0)
  const countOf = (k: Tab) => all.filter((c) => tabOf(c.status) === k).length
  const shown = all.filter((c) => tabOf(c.status) === tab)

  const newClaim = () => {
    feedback.tap()
    navigation.navigate("PayClaimNew")
  }

  const doCancel = async () => {
    if (!open) return
    setConfirm(false)
    setBusy(true)
    try {
      await cancelClaim(open.id)
      feedback.created()
      toast.show({ message: "Claim withdrawn.", tone: "success" })
      setOpen(null)
      await load()
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "Could not cancel the claim.", tone: "danger" })
    }
    setBusy(false)
  }

  const showReceipt = async () => {
    const url = await receiptUrl(open?.receipt_path)
    if (url) setPhoto(url)
    else toast.show({ message: "The receipt could not be opened.", tone: "danger" })
  }

  const outcome = (c: Claim): string | null => {
    if (c.status === "pending") return "Waiting for payroll to decide."
    if (c.status === "approved") return "Approved. It is paid with your next salary."
    if (c.status === "paid") return "Paid with your salary. It is on that month's payslip."
    if (c.status === "rejected") return "Not approved."
    if (c.status === "cancelled") return "You withdrew this claim."
    return null
  }

  return (
    <AppScreen
      title="Claims"
      subtitle="Reimbursements paid with your salary"
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

      {claims === null ? (
        <>
          <View style={[styles.top, { backgroundColor: t.surface }]}>
            <Skeleton height={62} radius={radius.card} />
            <Skeleton height={48} radius={radius.card} style={{ marginTop: spacing.md }} />
            <Skeleton height={44} radius={radius.pill} style={{ marginTop: spacing.md }} />
          </View>
          <View style={[styles.band, { backgroundColor: t.border }]} />
          <PayListSkeleton count={4} />
        </>
      ) : claims.length === 0 ? (
        <>
          <View style={styles.top}>
            <Button label="New claim" icon="add" fullWidth onPress={newClaim} />
          </View>
          <Panel>
            <EmptyState
              icon="invoice"
              title="No claims yet"
              hint="Spent on fuel, travel or a client lunch for work? Photograph the bill and claim it here. Approved claims are paid with your next salary."
            />
          </Panel>
        </>
      ) : (
        <>
          <View style={[styles.top, { backgroundColor: t.surface }]}>
            <StatStrip
              stats={[
                { key: "w", label: "Waiting", value: money(totalOf("pending")) },
                { key: "a", label: "To be paid", value: money(totalOf("approved")) },
                { key: "p", label: "Paid", value: money(totalOf("paid")) },
              ]}
            />
            <Button label="New claim" icon="add" fullWidth onPress={newClaim} style={styles.topGap} />
            <View style={styles.topGap}>
              <SegmentedControl<Tab>
                options={TABS.map((x) => {
                  const n = countOf(x.key)
                  return { key: x.key, label: n > 0 ? `${x.label} ${n}` : x.label }
                })}
                value={tab}
                onChange={(k) => {
                  feedback.select()
                  setTab(k)
                }}
              />
            </View>
          </View>
          <View style={[styles.band, { backgroundColor: t.border }]} />

          {shown.length === 0 ? (
            <Panel>
              <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>{EMPTY[tab]}</Text>
            </Panel>
          ) : (
            <Panel>
              {shown.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <RowSeparator />}
                  <ListRow
                    leading={<ClaimIconWell category={c.category} />}
                    title={c.category}
                    subtitle={`Bill of ${formatDate(c.bill_date)}${c.description ? ` · ${c.description}` : ""}`}
                    value={money(c.amount)}
                    valueSub={<ClaimStatusPill status={c.status} />}
                    onPress={() => {
                      feedback.tap()
                      setOpen(c)
                    }}
                  />
                </React.Fragment>
              ))}
            </Panel>
          )}
        </>
      )}

      <Sheet visible={!!open && !confirm} onClose={() => setOpen(null)} title={open ? `${open.category} claim` : undefined}>
        {open ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <ClaimIconWell category={open.category} size={48} />
              <View style={styles.sheetHeadBody}>
                <Text style={[textVariants.statLarge, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(open.amount)}
                </Text>
                <ClaimStatusPill status={open.status} />
              </View>
            </View>

            <View style={[styles.facts, { backgroundColor: t.surfaceInset }]}>
              <Fact label="Bill date" value={formatDate(open.bill_date)} />
              <Fact label="Sent on" value={formatDate(open.created_at)} />
              {open.decided_at && open.status !== "cancelled" ? (
                <Fact label="Decided on" value={formatDate(open.decided_at)} />
              ) : null}
              <Fact label="Status" value={CLAIM_STATUS_LABEL[open.status]} />
            </View>

            {open.description ? (
              <Text style={[textVariants.body, { color: t.textSecondary }]}>{open.description}</Text>
            ) : null}
            {outcome(open) ? (
              <Text style={[textVariants.small, { color: t.textTertiary }]}>{outcome(open)}</Text>
            ) : null}
            {open.decision_note ? (
              <View style={[styles.note, { backgroundColor: t.tones[open.status === "rejected" ? "rose" : "slate"].bg }]}>
                <Text style={[textVariants.captionStrong, { color: t.tones[open.status === "rejected" ? "rose" : "slate"].fg }]}>
                  Note from payroll
                </Text>
                <Text style={[textVariants.small, { color: t.text }]}>{open.decision_note}</Text>
              </View>
            ) : null}

            {open.receipt_path ? (
              <Button label="Open the receipt" icon="image" variant="secondary" fullWidth onPress={() => void showReceipt()} />
            ) : null}
            {open.status === "pending" ? (
              <Button label="Withdraw claim" variant="outline-danger" fullWidth loading={busy} onPress={() => setConfirm(true)} />
            ) : null}
          </View>
        ) : (
          <View />
        )}
      </Sheet>

      <Dialog
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Withdraw this claim?"
        message="It is cancelled before payroll decides. You can send it again as a new claim."
        actions={[
          { label: "Keep it", onPress: () => setConfirm(false) },
          { label: "Withdraw", tone: "danger", onPress: () => void doCancel() },
        ]}
      />
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={styles.fact}>
      <Text style={[textVariants.small, { color: t.textTertiary, flex: 1 }]}>{label}</Text>
      <Text style={[textVariants.smallStrong, { color: t.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: gutter, paddingVertical: gutter },
  topGap: { marginTop: spacing.md },
  band: { height: 2 },
  empty: { paddingHorizontal: gutter, paddingVertical: spacing.xl, textAlign: "center" },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sheetHeadBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  facts: { borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  fact: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: spacing.md },
  note: { borderRadius: radius.card, padding: spacing.md, gap: 2 },
})
