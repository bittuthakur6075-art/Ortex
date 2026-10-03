import React from "react"
import { Alert, Pressable, StyleSheet, Text, View } from "react-native"

import { getCollectionSnapshot, loadCollection } from "@/data/collectionStore"
import { errorMessage } from "@/data/supabase"
import { amountInWords, formatCurrency } from "@/domain/format"
import { canAccess } from "@/domain/modules"
import { PAYMENT_METHODS, type Payment } from "@/domain/schema"
import { dayLabel } from "@/features/attendance/format"
import { todayIST } from "@/features/leave/leaveFormat"
import { shiftDay } from "@/features/pay/payFormat"
import {
  amountOf,
  BIG_AMOUNT,
  justSaved,
  METHOD_ICON,
  paymentBlocker,
  paymentDay,
  sameReference,
  type PaymentDraft,
} from "@/features/payments/payments"
import { useCollection } from "@/hooks/useCollection"
import { useSettings } from "@/hooks/useSettings"
import { isNetworkFailure, learnServerClock, serverNow } from "@/lib/attendance"
import { feedback } from "@/lib/feedback"
import { recordPayment } from "@/lib/payments"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  SegmentedControl,
  TextField,
  useToast,
} from "@/ui"

// A payment can be logged a while after it happened (a cheque that cleared),
// but not more than a year back.
const MAX_AGE_DAYS = 365
// A save with no answer by then is reported, not left spinning.
const SAVE_TIMEOUT_MS = 20000
const TIMED_OUT = "timed-out"

/** Cancel / OK as a promise. */
const ask = (title: string, message: string, ok: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: ok, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  )

/**
 * Record a payment received or a payout made, laid out like New claim: which
 * way the money went, how much, who, how, the day, the UTR, a note. The one
 * thing still missing is said in words above Save, a UTR already in the ledger
 * is called out as it is typed, and Save carries the amount.
 *
 * Gated on the `payments` module (as the database is) BEFORE the form mounts,
 * so a person without it never fetches the ledger.
 */
export default function PaymentNewScreen(props: StackScreenProps<"PaymentNew">) {
  const { profile } = useAuth()
  if (!canAccess(profile, "payments")) {
    return (
      <AppScreen title="Record payment" back onBack={() => props.navigation.goBack()} inTabs={false}>
        <Panel>
          <EmptyState
            icon="lock"
            title="Not in your access"
            hint="Recording payments needs the Payments module. An admin can grant it."
          />
        </Panel>
      </AppScreen>
    )
  }
  return <PaymentForm {...props} />
}

function PaymentForm({ navigation, route }: StackScreenProps<"PaymentNew">) {
  const t = useTheme()
  const toast = useToast()
  const { settings, loading: settingsLoading, error: settingsError } = useSettings()
  const { items, loading } = useCollection<Payment>("payments")
  const [today, setToday] = React.useState(todayIST)
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
  // Set synchronously: a second tap lands before `busy` re-renders the button.
  const saving = React.useRef(false)
  const set = (patch: Partial<PaymentDraft>) => setD((x) => ({ ...x, ...patch }))

  // A phone set to the wrong date would pick the wrong day (and financial year):
  // learn the server's clock, and move an untouched "today" with it.
  React.useEffect(() => {
    void learnServerClock().then(() => {
      const real = todayIST()
      setToday((was) => {
        setD((x) => (x.date === was ? { ...x, date: real } : x))
        return real
      })
    })
  }, [])

  const payout = d.type === "payout"
  const value = amountOf(d.amount)
  const blocker =
    paymentBlocker(d) ||
    (settingsLoading
      ? "Loading the company settings."
      : settingsError
      ? `${settingsError}. The payment number needs them; try again.`
      : null)
  const duplicate = sameReference(d.reference, items)

  const step = (delta: number) => {
    const next = shiftDay(d.date, delta)
    if (next > today || next < earliest) return
    feedback.select()
    set({ date: next })
  }

  /** The row a failed or silent save may have written anyway, after a fresh read. */
  const findSaved = async (before: ReadonlySet<string>) => {
    await loadCollection("payments")
    const snap = getCollectionSnapshot<Payment>("payments")
    return snap.fromCache || snap.error ? null : justSaved(d, snap.items, serverNow(), before)
  }

  const done = (p: Payment, note = "recorded") => {
    feedback.created()
    toast.show({ message: `${p.number} ${note}.`, tone: "success" })
    navigation.goBack()
  }

  const save = async () => {
    if (blocker || saving.current) return
    saving.current = true
    setBusy(true)
    const release = () => {
      saving.current = false
      setBusy(false)
    }

    // The duplicate check needs the ledger: wait for a load still running.
    if (loading) await loadCollection("payments")
    const ledger = getCollectionSnapshot<Payment>("payments")
    const dup = sameReference(d.reference, ledger.items)
    if (dup) {
      const again = await ask(
        "This UTR is already recorded",
        `${dup.number}: ${formatCurrency(dup.amount)} on ${paymentDay(dup.date)}${
          dup.party ? `, ${dup.party}` : ""
        }. Record it again?`,
        "Record again",
      )
      if (!again) return release()
    } else if (d.reference.trim() && ledger.error && !ledger.items.length) {
      const anyway = await ask(
        "Could not check for duplicates",
        "The ledger did not load, so this UTR was not checked. Save anyway?",
        "Save",
      )
      if (!anyway) return release()
    }
    if (value >= BIG_AMOUNT) {
      const sure = await ask(
        "Over ₹1 crore",
        `Save ${formatCurrency(value)}? That is ${amountInWords(value)}.`,
        "Save",
      )
      if (!sure) return release()
    }

    // What was there before this save, so a look-alike older row never counts.
    const before = new Set(getCollectionSnapshot<Payment>("payments").items.map((p) => p.id))
    const pending = recordPayment(d, settings)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const saved = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(TIMED_OUT)), SAVE_TIMEOUT_MS)
        }),
      ])
      clearTimeout(timer)
      // Show it at once, realtime or not.
      void loadCollection("payments")
      done(saved)
    } catch (e) {
      clearTimeout(timer)
      const timedOut = (e as Error)?.message === TIMED_OUT
      // Only a lost answer can hide a saved row; a refusal means nothing was written.
      const lost = timedOut || isNetworkFailure(e)
      const landed = lost ? await findSaved(before).catch(() => null) : null
      if (landed) return done(landed, "was saved")
      feedback.error()
      toast.show({
        message: timedOut
          ? "No answer from the server. Check the list before trying again."
          : `${errorMessage(e, "The payment was not saved")}. Not saved.`,
        tone: "danger",
      })
      if (!timedOut) return release()
      // Keep Save locked until the slow request settles: a late success is
      // reported, so pressing Save again cannot write it twice.
      pending
        .then((p) => {
          void loadCollection("payments")
          done(p, "was saved")
        })
        .catch(() => {})
        .finally(release)
    }
  }

  const dayWords =
    d.date === today ? "Today" : d.date === shiftDay(today, -1) ? "Yesterday" : dayLabel(d.date)

  return (
    <AppScreen
      title={payout ? "Record payout" : "Record payment"}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
    >
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
            maxLength={14}
            accessibilityLabel="Amount in rupees"
          />
          {value ? (
            <Text style={[textVariants.caption, styles.caption, { color: t.textTertiary }]}>
              {amountInWords(value)}
            </Text>
          ) : null}
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
            accessibilityLabel={payout ? "Paid to" : "Received from"}
          />
        </View>
      </Panel>

      <Panel title="Method">
        <View style={styles.methods} accessibilityRole="radiogroup" accessibilityLabel="Method">
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
                accessibilityLabel={m}
                accessibilityState={{ checked: active }}
                hitSlop={6}
                style={[
                  styles.method,
                  {
                    backgroundColor: active ? t.primary10 : t.surfaceInset,
                    borderColor: active ? t.primary : "transparent",
                  },
                ]}
              >
                <Icon
                  name={METHOD_ICON[m] || "wallet"}
                  size={18}
                  color={active ? t.primary : t.textSecondary}
                  variant="Bulk"
                />
                <Text
                  style={[
                    textVariants.small,
                    { color: active ? t.primary : t.text, fontFamily: font.medium },
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Panel>

      <Panel title="Date">
        <View style={styles.dateRow}>
          <IconButton
            name="back"
            onPress={() => step(-1)}
            disabled={d.date <= earliest}
            accessibilityLabel="A day earlier"
          />
          <View style={styles.dateMid}>
            <Text style={[styles.date, { color: t.text }]}>{dayWords}</Text>
            {dayWords !== dayLabel(d.date) ? (
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>{dayLabel(d.date)}</Text>
            ) : null}
          </View>
          <IconButton
            name="forward"
            onPress={() => step(1)}
            disabled={d.date >= today}
            accessibilityLabel="A day later"
          />
        </View>
        <View style={styles.quick} accessibilityRole="radiogroup" accessibilityLabel="Date">
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
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                hitSlop={10}
              >
                <Text
                  style={[
                    textVariants.caption,
                    { color: active ? t.primary : t.textSecondary, fontFamily: font.medium },
                  ]}
                >
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
            accessibilityLabel="UTR or transaction ID"
          />
          {duplicate ? (
            <View style={[styles.alert, { backgroundColor: t.dangerBg }]} accessibilityLiveRegion="polite">
              <Icon name="warning" size={16} color={t.danger} variant="Bulk" />
              <Text style={[textVariants.small, { color: t.dangerText, flex: 1 }]}>
                Already recorded: {duplicate.number}, {formatCurrency(duplicate.amount)} on{" "}
                {paymentDay(duplicate.date)}.
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.pad}>
          <TextField
            value={d.note}
            onChangeText={(note) => set({ note })}
            placeholder="Note (optional)"
            multiline
            maxLength={200}
            accessibilityLabel="Note, optional"
          />
        </View>
      </Panel>

      <View style={styles.submit}>
        {blocker ? (
          <View
            style={[styles.alert, { backgroundColor: settingsError ? t.dangerBg : t.warningBg }]}
            accessibilityLiveRegion="polite"
          >
            <Icon
              name={settingsError ? "warning" : "info"}
              size={16}
              color={settingsError ? t.danger : t.warning}
              variant="Bulk"
            />
            <Text
              style={[textVariants.small, { color: settingsError ? t.dangerText : t.warningText, flex: 1 }]}
            >
              {blocker}
            </Text>
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
  methods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: gutter,
    paddingBottom: spacing.md,
  },
  method: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.md,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter - 10,
  },
  dateMid: { flex: 1, alignItems: "center", gap: 2 },
  date: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
  quick: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.card,
    padding: spacing.sm + 4,
  },
  submit: { paddingHorizontal: gutter, paddingVertical: spacing.lg, gap: spacing.md },
})
