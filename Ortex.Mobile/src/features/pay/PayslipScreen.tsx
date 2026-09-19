import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatDate } from "@/domain/format"
import {
  daysText,
  money,
  monthLabel,
  otherDeductionsOf,
  rupeesInWords,
  tdsOf,
  type Payslip,
} from "@/features/pay/payFormat"
import { AmountList, NetStrip, PayFact, PayHero } from "@/features/pay/payUi"
import { usePayColors } from "@/features/pay/usePayColors"
import { useSettings } from "@/hooks/useSettings"
import { feedback } from "@/lib/feedback"
import { payslip as loadPayslip } from "@/lib/pay"
import { printPayslip, sharePayslipPdf } from "@/lib/payslipPdf"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Button, DataNotice, DetailSkeleton, FactRow, Panel, useToast } from "@/ui"

/**
 * One payslip (Zoho Payroll's payslip view): net pay first, then how much of
 * the month's earnings reached the account, the paid days, earnings,
 * deductions, reimbursements, what the company paid on top (never deducted),
 * and the income-tax working. The PDF is the same facts on A4.
 */
export default function PayslipScreen({ navigation, route }: StackScreenProps<"Payslip">) {
  const t = useTheme()
  const toast = useToast()
  const c = usePayColors()
  const { settings, error: settingsError } = useSettings()
  const [slip, setSlip] = React.useState<Payslip | null | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<"share" | "print" | null>(null)

  const load = React.useCallback(async () => {
    try {
      setSlip(await loadPayslip(route.params.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that payslip.")
      setSlip((s) => s ?? null)
    }
  }, [route.params.id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (slip === undefined) return <DetailSkeleton onBack={() => navigation.goBack()} panels={[2, 4, 3]} />

  const d = slip?.data
  const run = async (kind: "share" | "print") => {
    if (!slip) return
    feedback.tap()
    setBusy(kind)
    try {
      // The company name comes from settings_staff; if that read failed, the
      // PDF says "Ortex Industries" rather than a placeholder from the defaults.
      const s = settingsError ? null : settings
      if (kind === "share") await sharePayslipPdf(slip, s)
      else await printPayslip(slip, s)
    } catch (e) {
      feedback.error()
      toast.show({ message: e instanceof Error ? e.message : "The PDF could not be made.", tone: "danger" })
    }
    setBusy(null)
  }

  return (
    <AppScreen
      title={d ? monthLabel(d.month) : "Payslip"}
      subtitle={slip ? `Released ${formatDate(slip.released_at)}` : undefined}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
    >
      <DataNotice error={error} onRetry={() => void load()} />
      {!slip || !d ? (
        <Panel padded>
          <Text style={[textVariants.body, { color: t.textSecondary }]}>
            This payslip is not available. It may not have been released yet.
          </Text>
        </Panel>
      ) : (
        <>
          <Panel>
            <PayHero label="Net pay" amount={d.netPay ?? slip.net_pay} caption={rupeesInWords(d.netPay ?? slip.net_pay)} />
            <NetStrip
              parts={[
                { key: "net", label: "Take-home", value: Math.max(0, (d.netPay || 0) - (d.reimbursementTotal || 0)), color: c.net },
                { key: "ded", label: "Deductions", value: otherDeductionsOf(d), color: c.deductions },
                { key: "tds", label: "Income tax", value: tdsOf(d), color: c.tds },
              ]}
            />
            <View style={styles.facts}>
              <PayFact label="Paid days" value={`${d.paidDays} / ${d.basisDays}`} />
              <PayFact label="Loss of pay" value={daysText(d.lopDays)} tone={d.lopDays > 0 ? "warning" : undefined} />
            </View>
            <View style={styles.actions}>
              <Button
                label="Share PDF"
                icon="share"
                fullWidth
                loading={busy === "share"}
                disabled={!!busy}
                onPress={() => void run("share")}
                style={styles.flex}
              />
              <Button
                label="Print"
                icon="print"
                variant="secondary"
                loading={busy === "print"}
                disabled={!!busy}
                onPress={() => void run("print")}
              />
            </View>
          </Panel>

          <Panel title="Earnings">
            <AmountList items={d.earnings || []} totalLabel="Gross earnings" total={d.gross} />
          </Panel>

          <Panel title="Deductions">
            <AmountList items={d.deductions || []} totalLabel="Total deductions" total={d.totalDeductions} />
          </Panel>

          {(d.reimbursements || []).length > 0 ? (
            <Panel title="Reimbursements">
              <AmountList items={d.reimbursements} totalLabel="Total reimbursements" total={d.reimbursementTotal} />
            </Panel>
          ) : null}

          {(d.employer || []).some((x) => x.amount > 0) ? (
            <Panel title="Employer contributions (not deducted from you)">
              <AmountList items={d.employer} totalLabel="Paid by the company" total={d.employerTotal} />
            </Panel>
          ) : null}

          {d.tds && (Number(d.tds.annualTax) > 0 || Number(d.tds.monthly) > 0) ? (
            <Panel title="Income tax">
              <FactRow icon="percent" label="Tax regime" value={d.tds.regime === "old" ? "Old regime" : "New regime"} />
              <FactRow icon="insights" label="Projected tax for the year" value={money(d.tds.annualTax || 0)} />
              {Number(d.tds.taxable) > 0 ? (
                <FactRow icon="money" label="Projected taxable income" value={money(d.tds.taxable || 0)} />
              ) : null}
              <FactRow icon="invoice" label="Deducted this month" value={money(d.tds.monthly || 0)} />
            </Panel>
          ) : null}

          {d.employee ? (
            <Panel title="Employee details">
              <FactRow icon="profile" label="Name" value={d.employee.name} />
              {d.employee.employee_code ? <FactRow icon="gst" label="Employee ID" value={d.employee.employee_code} /> : null}
              {d.employee.designation ? (
                <FactRow
                  icon="company"
                  label="Designation"
                  value={[d.employee.designation, d.employee.department].filter(Boolean).join(" · ")}
                />
              ) : null}
              {d.employee.uan ? <FactRow icon="info" label="UAN" value={d.employee.uan} /> : null}
              {d.employee.pan_last4 ? <FactRow icon="gst" label="PAN" value={`XXXXXX${d.employee.pan_last4}`} /> : null}
              {d.employee.account_last4 ? (
                <FactRow
                  icon="money"
                  label="Paid into"
                  value={`${d.employee.bank_name ? `${d.employee.bank_name} ` : ""}XXXX${d.employee.account_last4}`}
                />
              ) : null}
            </Panel>
          ) : null}

          <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
            Something looks wrong? Ask payroll. A payslip cannot be changed once it is paid.
          </Text>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  facts: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.md },
  flex: { flex: 1 },
  hint: { paddingHorizontal: gutter, paddingVertical: spacing.lg, textAlign: "center" },
})
