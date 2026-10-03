import React from "react"
import { Pressable, StyleSheet, Text, type TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { getCollectionSnapshot, loadCollection } from "@/data/collectionStore"
import { errorMessage } from "@/data/supabase"
import { amountInWords, formatCurrency } from "@/domain/format"
import { canAccess, isSuperAdmin } from "@/domain/modules"
import { PAYMENT_METHODS, type Payment } from "@/domain/schema"
import { dayLabel } from "@/features/attendance/format"
import { todayIST } from "@/features/leave/leaveFormat"
import { shiftDay } from "@/features/pay/payFormat"
import DayPickerSheet from "@/features/payments/DayPickerSheet"
import {
  amountOf,
  BIG_AMOUNT,
  draftOf,
  inTally,
  justSaved,
  METHOD_ICON,
  paymentBlocker,
  paymentDay,
  sameReference,
  TALLY_LOCKED,
  type PaymentDraft,
} from "@/features/payments/payments"
import { useCollection } from "@/hooks/useCollection"
import { useSettings } from "@/hooks/useSettings"
import { isNetworkFailure, learnServerClock, serverNow } from "@/lib/attendance"
import { feedback } from "@/lib/feedback"
import { recordPayment, updatePayment } from "@/lib/payments"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useCompany } from "@/store/CompanyContext"
import { ChipGroup } from "@/ui/Chips"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  ScreenLoader,
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


type Ask = { title: string; message: string; ok: string; resolve: (yes: boolean) => void }

/**
 * Record a payment received or a payout made, laid out like New claim: which
 * way the money went, how much, who, how, the day, the UTR, a note. The one
 * thing still missing is said above Save once the form is touched or Save is
 * pressed, a UTR already in the ledger is called out as it is typed, and the
 * sticky Save carries the amount and the direction.
 *
 * With `id` it edits that payment as the console's RecordPaymentModal does: the
 * number stays, only changed fields are written, and a payment already in Tally
 * is changed only by the Super Admin (migration 0066 refuses anyone else).
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
  const id = props.route.params?.id
  return id ? <PaymentEdit {...props} id={id} /> : <PaymentForm {...props} />
}

/** Finds the payment, then opens the form on it; one in Tally stays shut to all but the Super Admin. */
function PaymentEdit(props: StackScreenProps<"PaymentNew"> & { id: string }) {
  const { profile } = useAuth()
  const { items, loading } = useCollection<Payment>("payments", { everyCompany: true })
  const found = items.find((p) => p.id === props.id) || null
  // Taken once: a realtime refresh must not reset what is being typed.
  const [payment, setPayment] = React.useState<Payment | null>(null)
  React.useEffect(() => {
    if (found && !payment) setPayment(found)
  }, [found, payment])
  const shell = (body: React.ReactNode) => (
    <AppScreen title="Edit payment" back onBack={() => props.navigation.goBack()} inTabs={false}>
      {body}
    </AppScreen>
  )
  if (payment) {
    if (inTally(payment) && !isSuperAdmin(profile)) {
      return shell(
        <Panel>
          <EmptyState icon="lock" title="Cannot be edited here" hint={TALLY_LOCKED} />
        </Panel>,
      )
    }
    return <PaymentForm {...props} editing={payment} />
  }
  if (loading) return shell(<ScreenLoader label="Loading payment" />)
  return shell(
    <Panel>
      <EmptyState icon="wallet" title="Payment not found" hint="It may have been deleted in the console." />
    </Panel>,
  )
}

function PaymentForm({ navigation, route, editing }: StackScreenProps<"PaymentNew"> & { editing?: Payment }) {
  const t = useTheme()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  // The company it is recorded for (Admin migration 0075): an edited payment's
  // own, else the one being worked in; in the All companies view, picked here.
  // Its settings give the number prefix.
  const company = useCompany()
  const [picked, setPicked] = React.useState("")
  const companyId = editing?.companyId || company.defaultCompany || picked
  const { settings, loading: settingsLoading, error: settingsError } = useSettings(companyId)
  const { items, loading } = useCollection<Payment>("payments")
  const [today, setToday] = React.useState(todayIST)
  const [initial] = React.useState<PaymentDraft>(() =>
    editing
      ? draftOf(editing)
      : {
          type: route.params?.type || "inflow",
          amount: "",
          party: "",
          method: "UPI",
          date: todayIST(),
          reference: "",
          note: "",
        },
  )
  // A year back, or further when the payment being edited is older.
  const yearBack = shiftDay(today, -MAX_AGE_DAYS)
  const earliest = initial.date && initial.date < yearBack ? initial.date : yearBack

  const [d, setD] = React.useState<PaymentDraft>(initial)
  const [busy, setBusy] = React.useState(false)
  // The blocker stays quiet until the form is touched or Save is pressed.
  const [touched, setTouched] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [asking, setAsking] = React.useState<Ask | null>(null)
  const [footerH, setFooterH] = React.useState(0)
  // Set synchronously: a second tap lands before `busy` re-renders the button.
  const saving = React.useRef(false)
  const mounted = React.useRef(true)
  React.useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )
  const partyRef = React.useRef<TextInput>(null)
  const referenceRef = React.useRef<TextInput>(null)
  const noteRef = React.useRef<TextInput>(null)
  const set = (patch: Partial<PaymentDraft>) => {
    setTouched(true)
    setD((x) => ({ ...x, ...patch }))
  }

  /** Cancel / OK as a promise, on the app's own dialog. */
  const ask = (title: string, message: string, ok: string) =>
    new Promise<boolean>((resolve) => setAsking({ title, message, ok, resolve }))
  const answer = (yes: boolean) => {
    asking?.resolve(yes)
    setAsking(null)
  }

  // A phone set to the wrong date would pick the wrong day (and financial year):
  // learn the server's clock, and move an untouched "today" with it.
  React.useEffect(() => {
    void learnServerClock().then(() => {
      const real = todayIST()
      setToday((was) => {
        if (!editing) setD((x) => (x.date === was ? { ...x, date: real } : x))
        return real
      })
    })
  }, [editing])

  const payout = d.type === "payout"
  const value = amountOf(d.amount)
  // An edit keeps its number, so it does not need the company settings.
  const settingsBlocker = editing
    ? null
    : company.multi && !companyId
      ? "Choose the company first."
      : settingsLoading
      ? "Loading the company settings."
      : settingsError
        ? `${settingsError}. The payment number needs them; try again.`
        : null
  const blocker = paymentBlocker(d) || settingsBlocker
  const shownBlocker = touched || settingsError ? blocker : null
  // The payment being edited is never its own duplicate.
  const others = editing ? items.filter((p) => p.id !== editing.id) : items
  const duplicate = sameReference(d.reference, others)
  const linked = !!editing?.invoiceId

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

  // A late answer can arrive after the person has left the form: then it only says so.
  const done = (p: Payment, note = editing ? "updated" : "recorded") => {
    feedback.created()
    toast.show({ message: `${p.number} ${note}.`, tone: "success" })
    if (mounted.current && navigation.isFocused()) navigation.goBack()
  }

  const save = async () => {
    if (saving.current) return
    if (blocker) {
      setTouched(true)
      feedback.warn()
      return
    }
    saving.current = true
    setBusy(true)
    const release = () => {
      saving.current = false
      if (mounted.current) setBusy(false)
    }

    // The duplicate check needs the ledger: wait for a load still running.
    if (loading) await loadCollection("payments")
    const ledger = getCollectionSnapshot<Payment>("payments")
    const dup = sameReference(
      d.reference,
      ledger.items.filter((p) => p.id !== editing?.id),
    )
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
    const pending = editing ? updatePayment(editing, d) : recordPayment(d, settings, companyId)
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
      // Only a lost answer to a NEW payment can hide a saved row; a refusal means nothing was written.
      const lost = !editing && (timedOut || isNetworkFailure(e))
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
  const what = value ? ` ${formatCurrency(value).replace(/\.00$/, "")} ${payout ? "paid out" : "received"}` : ""
  const saveLabel = `${editing ? "Update" : "Save"}${what}`

  return (
    <AppScreen
      title={editing ? (payout ? "Edit payout" : "Edit payment") : payout ? "Record payout" : "Record payment"}
      subtitle={editing ? `${editing.number}, the number stays the same` : undefined}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      overlay={
        <View
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          style={[
            styles.footer,
            { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: insets.bottom + spacing.sm },
          ]}
        >
          {shownBlocker ? (
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
                {shownBlocker}
              </Text>
            </View>
          ) : null}
          <Button
            label={saveLabel}
            icon="tick"
            fullWidth
            loading={busy}
            disabled={!!settingsBlocker}
            onPress={() => void save()}
          />
        </View>
      }
    >
      {editing && inTally(editing) ? (
        <View style={[styles.alert, styles.banner, { backgroundColor: t.dangerBg }]}>
          <Icon name="warning" size={16} color={t.danger} variant="Bulk" />
          <Text style={[textVariants.small, { color: t.dangerText, flex: 1 }]}>
            This payment is already in Tally. Change it in Tally too, or the books will not match.
          </Text>
        </View>
      ) : null}

      <View style={styles.top}>
        <SegmentedControl<PaymentDraft["type"]>
          options={[
            { key: "inflow", label: "Received" },
            { key: "payout", label: "Paid out" },
          ]}
          value={d.type}
          onChange={(type) => {
            // A payment against an invoice is always money received (0066).
            if (linked) return
            feedback.select()
            set({ type })
          }}
        />
        {linked ? (
          <Text style={[textVariants.caption, styles.gapTop, { color: t.textTertiary }]}>
            Paid against {editing?.invoiceNumber || "an invoice"}, so it stays money received.
          </Text>
        ) : null}
      </View>

      {company.choice === "all" && !editing ? (
        <Panel title="Company">
          <View style={styles.pad}>
            <ChipGroup
              options={company.companies.map((c) => ({ key: c.id, label: c.name }))}
              value={picked}
              onChange={(key: string) => {
                feedback.select()
                setPicked(key)
              }}
            />
          </View>
        </Panel>
      ) : null}

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
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => partyRef.current?.focus()}
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
            ref={partyRef}
            value={d.party}
            onChangeText={(party) => set({ party })}
            placeholder={payout ? "Vendor name" : "Customer name"}
            autoCapitalize="words"
            maxLength={120}
            accessibilityLabel={payout ? "Paid to" : "Received from"}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => referenceRef.current?.focus()}
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
          <Pressable
            onPress={() => {
              feedback.tap()
              setPicking(true)
            }}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${dayLabel(d.date)}`}
            accessibilityHint="Opens a calendar"
            style={({ pressed }) => [styles.dateMid, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View style={styles.dateLine}>
              <Icon name="calendar" size={18} color={t.primary} variant="Bulk" />
              <Text style={[styles.date, { color: t.text }]}>{dayWords}</Text>
            </View>
            {dayWords !== dayLabel(d.date) ? (
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>{dayLabel(d.date)}</Text>
            ) : null}
          </Pressable>
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
            ref={referenceRef}
            value={d.reference}
            onChangeText={(reference) => set({ reference })}
            placeholder="UTR or transaction ID"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            accessibilityLabel="UTR or transaction ID"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => noteRef.current?.focus()}
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
            ref={noteRef}
            value={d.note}
            onChangeText={(note) => set({ note })}
            placeholder="Note (optional)"
            multiline
            maxLength={200}
            accessibilityLabel="Note, optional"
          />
        </View>
      </Panel>

      {/* Room for the sticky footer, measured. */}
      <View style={{ height: footerH + spacing.lg }} />

      <DayPickerSheet
        visible={picking}
        value={d.date}
        min={earliest}
        max={today}
        onPick={(date) => set({ date })}
        onClose={() => setPicking(false)}
      />
      <Dialog
        visible={!!asking}
        title={asking?.title}
        message={asking?.message}
        onClose={() => answer(false)}
        actions={[
          { label: "Cancel", onPress: () => answer(false) },
          { label: asking?.ok || "OK", onPress: () => answer(true) },
        ]}
      />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: gutter, paddingVertical: gutter },
  gapTop: { marginTop: spacing.sm },
  banner: { marginHorizontal: gutter, marginTop: gutter },
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
  dateMid: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 48 },
  dateLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
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
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
