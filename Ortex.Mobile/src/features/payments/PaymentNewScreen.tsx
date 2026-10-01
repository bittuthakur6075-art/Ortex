import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { formatCurrency, formatDate } from "@/domain/format"
import { isAdmin } from "@/domain/modules"
import { PAYMENT_METHODS, type Payment } from "@/domain/schema"
import { dayLabel } from "@/features/attendance/format"
import { todayIST } from "@/features/leave/leaveFormat"
import { shiftDay } from "@/features/pay/payFormat"
import { amountOf, METHOD_ICON, paymentBlocker, sameReference, type PaymentDraft } from "@/features/payments/payments"
import { useCollection } from "@/hooks/useCollection"
import { useSettings } from "@/hooks/useSettings"
import { feedback } from "@/lib/feedback"
import { recordPayment } from "@/lib/payments"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, Button, EmptyState, Icon, IconButton, Panel, SegmentedControl, TextField, useToast } from "@/ui"

// A payment can be logged a while after it happened (a cheque that cleared),
// but not before the financial year before last.
const MAX_AGE_DAYS = 365

/**
 * Record a payment received or a payout made, laid out like New claim: which
 * way the money went, how much, who, how, the day, the UTR, a note. The one
 * thing still missing is said in words above Save, a UTR already in the ledger
 * is called out as it is typed, and Save carries the amount.
 */
export default function PaymentNewScreen({ navigation, route }: StackScreenProps<"PaymentNew">) {
  const t = useTheme()
  const toast = useToast()
  const { profile } = useAuth()
  const { settings } = useSettings()
  const { items } = useCollection<Payment>("payments")
  const today = todayIST()
  const earliest = shiftDay(today, -MAX_AGE_DAYS)

  const [d, setD] = React.useState<PaymentDraft>({
    type: route.params?.type || "inflow",
    amount: "",
    party: "",
    method: "UPI",
    date: today,
    reference: "",
    note: "",
  })
  const [busy, setBusy] = React.useState(false)
  const set = (patch: Partial<PaymentDraft>) => setD((x) => ({ ...x, ...patch }))

  const payout = d.type === "payout"
  const value = amountOf(d.amount)
  const blocker = paymentBlocker(d)
  const duplicate = sameReference(d.reference, items)

  if (!isAdmin(profile)) {
    return (
      <AppScreen title="Record payment" back onBack={() => navigation.goBack()} inTabs={false}>
        <Panel>
          <EmptyState icon="lock" title="Admins only" hint="Payments are open to the Super Admin and Admins." />
        </Panel>
      </AppScreen>
    )
  }

  const step = (delta: number) => {
    const next = shiftDay(d.date, delta)
    if (next > today || next < earliest) return
    feedback.select()
    set({ date: next })
  }

  const save = async () => {
    if (blocker || busy) return
    setBusy(true)
    try {
      const saved = await recordPayment(d, settings)
      feedback.created()
      toast.show({ message: `${saved.number} recorded.`, tone: "success" })
      navigation.goBack()
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "The payment was not saved.", tone: "danger" })
      setBusy(false)
    }
  }

  const dayWords = d.date === today ? "Today" : d.date === shiftDay(today, -1) ? "Yesterday" : dayLabel(d.date)

  return (
    <AppScreen title={payout ? "Record payout" : "Record payment"} back onBack={() => navigation.goBack()} inTabs={false}>
      <View style={styles.top}>
        <SegmentedControl<PaymentDraft["type"]>
          options={[
            { key: "inflow", label: "Received" },
            { key: "payout", label: "Paid out" },
          ]}
          value={d.type}
          onChange={(type) => {
            feedback.select()
            set({ type })
          }}
        />
      </View>

      <Panel title="Amount">
        <View style={styles.pad}>
          <TextField
            value={d.amount}
            onChangeText={(s) => set({ amount: s.replace(/[^\d.,]/g, "") })}
            placeholder="0"
            keyboardType="decimal-pad"
            leadingIcon="money"
            maxLength={12}
            accessibilityLabel="Amount in rupees"
          />
          {value ? <Text style={[textVariants.caption, styles.caption, { color: t.textTertiary }]}>{formatCurrency(value)}</Text> : null}
        </View>
      </Panel>

      <Panel title={payout ? "Paid to" : "Received from"}>
        <View style={styles.pad}>
          <TextField
            value={d.party}
            onChangeText={(party) => set({ party })}
            placeholder={payout ? "Vendor name" : "Customer name"}
            autoCapitalize="words"
            maxLength={120}
          />
        </View>
      </Panel>

      <Panel title="Method">
        <View style={styles.methods}>
          {PAYMENT_METHODS.map((m) => {
            const active = m === d.method
            return (
              <Pressable
                key={m}
                onPress={() => {
                  feedback.select()
                  set({ method: m })
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.method, { backgroundColor: active ? t.primary10 : t.surfaceInset, borderColor: active ? t.primary : "transparent" }]}
              >
                <Icon name={METHOD_ICON[m] || "wallet"} size={18} color={active ? t.primary : t.textSecondary} variant="Bulk" />
                <Text style={[textVariants.small, { color: active ? t.primary : t.text, fontFamily: font.medium }]}>{m}</Text>
              </Pressable>
            )
          })}
        </View>
      </Panel>

      <Panel title="Date">
        <View style={styles.dateRow}>
          <IconButton name="back" onPress={() => step(-1)} disabled={d.date <= earliest} accessibilityLabel="A day earlier" />
          <View style={styles.dateMid}>
            <Text style={[styles.date, { color: t.text }]}>{dayWords}</Text>
            {dayWords !== dayLabel(d.date) ? <Text style={[textVariants.caption, { color: t.textTertiary }]}>{dayLabel(d.date)}</Text> : null}
          </View>
          <IconButton name="forward" onPress={() => step(1)} disabled={d.date >= today} accessibilityLabel="A day later" />
        </View>
        <View style={styles.quick}>
          {[0, 1, 2, 7].map((n) => {
            const day = shiftDay(today, -n)
            const active = day === d.date
            return (
              <Pressable
                key={n}
                onPress={() => {
                  feedback.select()
                  set({ date: day })
                }}
                style={[styles.quickChip, { backgroundColor: active ? t.primary10 : t.surfaceInset }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[textVariants.caption, { color: active ? t.primary : t.textSecondary, fontFamily: font.medium }]}>
                  {n === 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Panel>

      <Panel title="Reference and note">
        <View style={styles.pad}>
          <TextField
            value={d.reference}
            onChangeText={(reference) => set({ reference })}
            placeholder="UTR or transaction ID"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
          />
          {duplicate ? (
            <View style={[styles.alert, { backgroundColor: t.dangerBg }]}>
              <Icon name="warning" size={16} color={t.danger} variant="Bulk" />
              <Text style={[textVariants.small, { color: t.dangerText, flex: 1 }]}>
                Already recorded: {duplicate.number}, {formatCurrency(duplicate.amount)} on {formatDate(duplicate.date)}.
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.pad}>
          <TextField value={d.note} onChangeText={(note) => set({ note })} placeholder="Note (optional)" multiline maxLength={200} />
        </View>
      </Panel>

      <View style={styles.submit}>
        {blocker ? (
          <View style={[styles.alert, { backgroundColor: t.warningBg }]}>
            <Icon name="info" size={16} color={t.warning} variant="Bulk" />
            <Text style={[textVariants.small, { color: t.warningText, flex: 1 }]}>{blocker}</Text>
          </View>
        ) : null}
        <Button
          label={value ? `Save ${formatCurrency(value).replace(/\.00$/, "")}` : "Save"}
          icon="tick"
          fullWidth
          loading={busy}
          disabled={!!blocker}
          onPress={() => void save()}
        />
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: gutter, paddingVertical: gutter },
  pad: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  caption: { marginTop: -spacing.xs },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.md },
  method: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.md,
  },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter - 10 },
  dateMid: { flex: 1, alignItems: "center", gap: 2 },
  date: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: gutter, paddingTop: spacing.sm, paddingBottom: spacing.md },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  alert: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.card, padding: spacing.sm + 4 },
  submit: { paddingHorizontal: gutter, paddingVertical: spacing.lg, gap: spacing.md },
})
