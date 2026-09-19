import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatDate } from "@/domain/format"
import { money, type Claim } from "@/features/pay/payFormat"
import { ClaimStatusPill } from "@/features/pay/payUi"
import { feedback } from "@/lib/feedback"
import { cancelClaim, myClaims, receiptUrl } from "@/lib/pay"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
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
  Sheet,
  SkeletonPanel,
  useToast,
} from "@/ui"

/**
 * Reimbursement claims (Zoho Payroll's "Reimbursements"): what is waiting, then
 * everything decided. A row opens a sheet with the bill, the decision and, while
 * it is still waiting, a way to withdraw it. Approved claims are paid with the
 * next salary and show on that payslip.
 */
export default function PayClaimsScreen({ navigation }: StackScreenProps<"PayClaims">) {
  const t = useTheme()
  const toast = useToast()
  const [claims, setClaims] = React.useState<Claim[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
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

  const waiting = (claims || []).filter((c) => c.status === "pending")
  const rest = (claims || []).filter((c) => c.status !== "pending")
  const waitingTotal = waiting.reduce((s, c) => s + c.amount, 0)

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

  const row = (c: Claim, i: number) => (
    <React.Fragment key={c.id}>
      {i > 0 && <RowSeparator />}
      <ListRow
        leadingIcon="invoice"
        leadingTone={c.status === "pending" ? "amber" : c.status === "paid" ? "emerald" : "slate"}
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
  )

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
      <View style={styles.cta}>
        <Button label="New claim" icon="add" fullWidth onPress={newClaim} />
      </View>
      {claims === null ? (
        <SkeletonPanel lines={4} />
      ) : claims.length === 0 ? (
        <Panel>
          <EmptyState
            icon="invoice"
            title="No claims yet"
            hint="Spent on fuel, travel or a client lunch for work? Photograph the bill and claim it here. Approved claims are paid with your next salary."
          />
        </Panel>
      ) : (
        <>
          {waiting.length > 0 ? (
            <Panel title="Waiting for approval" meta={`${waiting.length} · ${money(waitingTotal)}`}>
              {waiting.map(row)}
            </Panel>
          ) : null}
          {rest.length > 0 ? (
            <Panel title="Decided" meta={`${rest.length}`}>
              {rest.map(row)}
            </Panel>
          ) : null}
        </>
      )}

      <Sheet visible={!!open && !confirm} onClose={() => setOpen(null)} title={open ? `${open.category} · ${money(open.amount)}` : undefined}>
        {open ? (
          <View style={styles.sheet}>
            <ClaimStatusPill status={open.status} />
            <Text style={[textVariants.body, { color: t.textSecondary }]}>
              {[
                `Bill of ${formatDate(open.bill_date)}, sent ${formatDate(open.created_at)}.`,
                open.description || "",
                open.status === "approved" ? "Approved. It is paid with your next salary." : "",
                open.status === "paid" ? "Paid with your salary; it is on that month's payslip." : "",
                open.status === "rejected" ? `Not approved${open.decided_at ? ` on ${formatDate(open.decided_at)}` : ""}.` : "",
                open.decision_note ? `Note from payroll: ${open.decision_note}` : "",
              ]
                .filter(Boolean)
                .join("\n")}
            </Text>
            {open.receipt_path ? (
              <Button label="Open the receipt" icon="image" variant="secondary" fullWidth onPress={() => void showReceipt()} />
            ) : null}
            {open.status === "pending" ? (
              <Button
                label="Withdraw claim"
                variant="outline-danger"
                fullWidth
                loading={busy}
                onPress={() => setConfirm(true)}
              />
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

const styles = StyleSheet.create({
  cta: { paddingHorizontal: gutter, paddingVertical: spacing.md },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
})
