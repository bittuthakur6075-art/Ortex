import React from "react"
import { Image, Pressable, StyleSheet, Text, View } from "react-native"

import { dayLabel } from "@/features/attendance/format"
import { todayIST } from "@/features/leave/leaveFormat"
import {
  CLAIM_CATEGORIES,
  CLAIM_MAX_AGE_DAYS,
  claimBlocker,
  money,
  shiftDay,
} from "@/features/pay/payFormat"
import { feedback } from "@/lib/feedback"
import { pickReceipt, submitClaim, type Receipt } from "@/lib/pay"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, Button, IconButton, Panel, Sheet, TextField, useToast } from "@/ui"

/**
 * A new reimbursement claim (Zoho Payroll's "Submit claim"): what it was for,
 * how much, the day on the bill, a line of detail and a photo of the bill. The
 * bill date is a day stepper rather than a calendar: a claim is almost always
 * for today or the last few days, and the server takes nothing older than 90.
 * claim_submit checks everything again; its refusal is shown as it comes.
 */
export default function PayClaimNewScreen({ navigation }: StackScreenProps<"PayClaimNew">) {
  const t = useTheme()
  const toast = useToast()
  const today = todayIST()
  const earliest = shiftDay(today, -CLAIM_MAX_AGE_DAYS)

  const [category, setCategory] = React.useState<string>("")
  const [amount, setAmount] = React.useState("")
  const [billDate, setBillDate] = React.useState(today)
  const [description, setDescription] = React.useState("")
  const [receipt, setReceipt] = React.useState<Receipt | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  const blocker = claimBlocker({ category, amount, billDate, hasReceipt: !!receipt }, today)
  const value = Number(amount.replace(/,/g, ""))

  const step = (delta: number) => {
    const next = shiftDay(billDate, delta)
    if (next > today || next < earliest) return
    feedback.select()
    setBillDate(next)
  }

  const pick = async (source: "camera" | "library") => {
    setPicking(false)
    try {
      const r = await pickReceipt(source)
      if (r) setReceipt(r)
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "Could not add the photo.", tone: "danger" })
    }
  }

  const submit = async () => {
    if (blocker) return
    setBusy(true)
    try {
      await submitClaim({ category, amount: value, billDate, description, receipt })
      feedback.created()
      setSent(true)
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "Your claim was not sent.", tone: "danger" })
    }
    setBusy(false)
  }

  const finish = () => {
    setSent(false)
    navigation.goBack()
  }

  const dayWords = billDate === today ? "Today" : billDate === shiftDay(today, -1) ? "Yesterday" : dayLabel(billDate)

  return (
    <AppScreen title="New claim" back onBack={() => navigation.goBack()} inTabs={false}>
      <Panel title="What was it for?">
        <View style={styles.grid}>
          {CLAIM_CATEGORIES.map((c) => {
            const active = c === category
            return (
              <View key={c} style={styles.cell}>
                <Pressable
                  onPress={() => {
                    feedback.select()
                    setCategory(c)
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.category,
                    { backgroundColor: active ? t.primary10 : t.surfaceInset, borderColor: active ? t.primary : "transparent" },
                  ]}
                >
                  <Text style={[textVariants.bodyStrong, { color: active ? t.primary : t.text }]}>{c}</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      </Panel>

      <Panel title="How much?">
        <View style={styles.pad}>
          <TextField
            value={amount}
            onChangeText={(s) => setAmount(s.replace(/[^\d.,]/g, ""))}
            placeholder="0"
            keyboardType="decimal-pad"
            leadingIcon="money"
            maxLength={10}
            accessibilityLabel="Amount in rupees"
          />
          {value > 0 && Number.isFinite(value) ? (
            <Text style={[textVariants.caption, styles.caption, { color: t.textTertiary }]}>{money(value)}</Text>
          ) : null}
        </View>
      </Panel>

      <Panel title="Date on the bill">
        <View style={styles.dateRow}>
          <IconButton name="back" onPress={() => step(-1)} disabled={billDate <= earliest} accessibilityLabel="A day earlier" />
          <View style={styles.dateMid}>
            <Text style={[styles.date, { color: t.text }]}>{dayWords}</Text>
            {billDate === today || billDate === shiftDay(today, -1) ? (
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>{dayLabel(billDate)}</Text>
            ) : null}
          </View>
          <IconButton name="forward" onPress={() => step(1)} disabled={billDate >= today} accessibilityLabel="A day later" />
        </View>
        <View style={styles.quick}>
          {[0, 1, 2, 7].map((n) => {
            const d = shiftDay(today, -n)
            const active = d === billDate
            return (
              <Pressable
                key={n}
                onPress={() => {
                  feedback.select()
                  setBillDate(d)
                }}
                style={[styles.quickChip, { backgroundColor: active ? t.primary10 : t.surfaceInset }]}
                accessibilityRole="button"
              >
                <Text style={[textVariants.caption, { color: active ? t.primary : t.textSecondary, fontFamily: font.medium }]}>
                  {n === 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={[textVariants.caption, styles.note, { color: t.textTertiary }]}>
          Bills from the last 90 days can be claimed.
        </Text>
      </Panel>

      <Panel title="Details and the bill">
        <View style={styles.pad}>
          <TextField
            value={description}
            onChangeText={setDescription}
            placeholder="For example: petrol for the Noida client visit"
            multiline
            maxLength={300}
          />
        </View>
        <View style={styles.pad}>
          {receipt ? (
            <View style={styles.attachment}>
              <Image source={{ uri: receipt.uri }} style={styles.thumb} />
              <Text style={[textVariants.small, { color: t.textSecondary, flex: 1 }]}>Bill attached</Text>
              <Button label="Remove" variant="ghost" size="sm" onPress={() => setReceipt(null)} />
            </View>
          ) : (
            <Button label="Add a photo of the bill" icon="camera" variant="secondary" onPress={() => setPicking(true)} />
          )}
        </View>
      </Panel>

      <View style={styles.submit}>
        {blocker ? <Text style={[textVariants.small, { color: t.textTertiary, textAlign: "center" }]}>{blocker}</Text> : null}
        <Button label="Send claim" fullWidth loading={busy} disabled={!!blocker} onPress={() => void submit()} />
      </View>

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Photo of the bill">
        <View style={styles.sheet}>
          <Button label="Take a photo" icon="camera" fullWidth onPress={() => void pick("camera")} />
          <Button label="Choose from gallery" icon="image" variant="secondary" fullWidth onPress={() => void pick("library")} />
        </View>
      </Sheet>

      <Sheet visible={sent} onClose={finish} title="Claim sent">
        <View style={styles.sheet}>
          <Text style={[textVariants.body, { color: t.textSecondary }]}>
            Claim sent. Approved claims are paid with your next salary.
          </Text>
          <Button label="Done" fullWidth onPress={finish} />
        </View>
      </Sheet>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter - spacing.xs, paddingBottom: spacing.sm },
  cell: { width: "50%", padding: spacing.xs },
  category: { borderRadius: radius.card, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1.5 },
  pad: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  caption: { marginTop: spacing.xs },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter - 10 },
  dateMid: { flex: 1, alignItems: "center", gap: 2 },
  date: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: gutter, paddingTop: spacing.sm },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  note: { paddingHorizontal: gutter, paddingVertical: spacing.md },
  attachment: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: radius.card },
  submit: { paddingHorizontal: gutter, paddingVertical: spacing.lg, gap: spacing.sm },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
})
