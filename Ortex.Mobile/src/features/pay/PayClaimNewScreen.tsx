import React from "react"
import { Image, Pressable, StyleSheet, Text, View } from "react-native"

import { dayLabel } from "@/features/attendance/format"
import { todayIST } from "@/features/leave/leaveFormat"
import { ClaimIconWell } from "@/features/pay/claimIcons"
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
import { AppScreen, Button, Icon, IconButton, Panel, Sheet, TextField, useToast } from "@/ui"

/**
 * A new reimbursement claim, laid out like Zoho Payroll's "Submit claim":
 * the category (each with its glyph), the amount, the day on the bill, a line
 * of description and a photo of the receipt, then a summary of what is about
 * to be sent, with the one thing still missing said in words above the button.
 * The bill date is a day stepper rather than a calendar: a claim is almost
 * always for today or the last few days, and the server takes nothing older
 * than 90. claim_submit checks everything again; its refusal is shown as it
 * comes.
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
  const validAmount = value > 0 && Number.isFinite(value)

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
    <AppScreen title="New claim" subtitle="Reimbursement paid with your salary" back onBack={() => navigation.goBack()} inTabs={false}>
      <Panel title="Category">
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
                  accessibilityLabel={c}
                  style={[
                    styles.category,
                    { backgroundColor: active ? t.primary10 : t.surfaceInset, borderColor: active ? t.primary : "transparent" },
                  ]}
                >
                  <ClaimIconWell category={c} size={36} active={active} />
                  <Text style={[textVariants.bodyStrong, { color: active ? t.primary : t.text, flex: 1 }]} numberOfLines={1}>
                    {c}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      </Panel>

      <Panel title="Amount">
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
          <Text style={[textVariants.caption, styles.caption, { color: t.textTertiary }]}>
            {validAmount ? money(value) : "Up to ₹2,00,000 for a single bill."}
          </Text>
        </View>
      </Panel>

      <Panel title="Bill date">
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
                accessibilityState={{ selected: active }}
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

      <Panel title="Description and receipt">
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
            <View style={[styles.attachment, { backgroundColor: t.surfaceInset }]}>
              <Image source={{ uri: receipt.uri }} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <Text style={[textVariants.bodyStrong, { color: t.text }]}>Receipt attached</Text>
                <Text style={[textVariants.caption, { color: t.textTertiary }]}>Payroll sees this photo with the claim.</Text>
              </View>
              <Button label="Remove" variant="ghost" size="sm" onPress={() => setReceipt(null)} />
            </View>
          ) : (
            <Pressable
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a photo of the bill"
              style={({ pressed }) => [
                styles.drop,
                { borderColor: t.borderStrong, backgroundColor: t.surfaceInset, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={[styles.dropWell, { backgroundColor: t.iconWell }]}>
                <Icon name="camera" size={22} color={t.primary} variant="Bulk" />
              </View>
              <Text style={[textVariants.bodyStrong, { color: t.text }]}>Add a photo of the bill</Text>
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>Take a photo or choose one from the gallery</Text>
            </Pressable>
          )}
        </View>
      </Panel>

      <Panel title="Summary">
        <View style={styles.summary}>
          <SummaryLine label="Category" value={category || "Not chosen"} missing={!category} />
          <SummaryLine label="Bill date" value={dayLabel(billDate)} />
          <SummaryLine label="Receipt" value={receipt ? "Photo attached" : "Not added"} missing={!receipt} />
          <View style={[styles.summaryTotal, { borderTopColor: t.border }]}>
            <Text style={[textVariants.bodyStrong, { color: t.text, flex: 1 }]}>Claim amount</Text>
            <Text style={[textVariants.amount, { color: t.text }]}>{money(validAmount ? value : 0)}</Text>
          </View>
        </View>
      </Panel>

      <View style={styles.submit}>
        {blocker ? (
          <View style={[styles.blocker, { backgroundColor: t.warningBg }]}>
            <Icon name="info" size={16} color={t.warning} variant="Bulk" />
            <Text style={[textVariants.small, { color: t.warningText, flex: 1 }]}>{blocker}</Text>
          </View>
        ) : null}
        <Button label="Submit claim" icon="send" fullWidth loading={busy} disabled={!!blocker} onPress={() => void submit()} />
        <Text style={[textVariants.caption, { color: t.textTertiary, textAlign: "center" }]}>
          Approved claims are paid with your next salary.
        </Text>
      </View>

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Photo of the bill">
        <View style={styles.sheet}>
          <Button label="Take a photo" icon="camera" fullWidth onPress={() => void pick("camera")} />
          <Button label="Choose from gallery" icon="image" variant="secondary" fullWidth onPress={() => void pick("library")} />
        </View>
      </Sheet>

      <Sheet visible={sent} onClose={finish} title="Claim submitted">
        <View style={styles.sheet}>
          <View style={styles.sentHead}>
            <View style={[styles.sentWell, { backgroundColor: t.successBg }]}>
              <Icon name="tick" size={26} color={t.success} variant="Bulk" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[textVariants.amount, { color: t.text }]}>{money(validAmount ? value : 0)}</Text>
              <Text style={[textVariants.small, { color: t.textSecondary }]}>{`${category} · Bill of ${dayLabel(billDate)}`}</Text>
            </View>
          </View>
          <Text style={[textVariants.body, { color: t.textSecondary }]}>
            It is waiting for payroll to approve. Approved claims are paid with your next salary.
          </Text>
          <Button label="Done" fullWidth onPress={finish} />
        </View>
      </Sheet>
    </AppScreen>
  )
}

/** One line of the pre-submit summary; a missing part reads in the warning's text step. */
function SummaryLine({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.summaryLine}>
      <Text style={[textVariants.small, { color: t.textTertiary, flex: 1 }]}>{label}</Text>
      <Text style={[textVariants.smallStrong, { color: missing ? t.warningText : t.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter - spacing.xs, paddingBottom: spacing.md },
  cell: { width: "50%", padding: spacing.xs },
  category: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.card,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: 1.5,
  },
  pad: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  caption: { marginTop: spacing.xs },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter - 10 },
  dateMid: { flex: 1, alignItems: "center", gap: 2 },
  date: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: gutter, paddingTop: spacing.sm },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  note: { paddingHorizontal: gutter, paddingVertical: spacing.md },
  attachment: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.card, padding: spacing.sm },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  drop: {
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  dropWell: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  summary: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  summaryLine: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
  summaryTotal: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: 1.5,
    marginTop: spacing.xs,
    paddingTop: spacing.sm + 4,
  },
  submit: { paddingHorizontal: gutter, paddingVertical: spacing.lg, gap: spacing.md },
  blocker: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.card, padding: spacing.sm + 4 },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
  sentHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sentWell: { width: 52, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
})
