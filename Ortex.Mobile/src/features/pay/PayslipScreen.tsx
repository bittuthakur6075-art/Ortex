import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { formatDate } from "@/domain/format"
import {
  money,
  monthLabel,
  otherDeductionsOf,
  rupeesInWords,
  tdsOf,
  type Payslip,
} from "@/features/pay/payFormat"
import { payRows } from "@/features/pay/payRows"
import { NetPayBlock, NetStrip, PayTable, StatStrip } from "@/features/pay/payUi"
import { usePayColors } from "@/features/pay/usePayColors"
import { useSettings } from "@/hooks/useSettings"
import { feedback } from "@/lib/feedback"
import { payslip as loadPayslip } from "@/lib/pay"
import { printPayslip, sharePayslipPdf } from "@/lib/payslipPdf"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Button, DataNotice, DetailSkeleton, FactRow, IconButton, Panel, useToast } from "@/ui"

/**
 * One payslip, laid out like Zoho Payroll's payslip view: the month in the
 * title; a summary band of gross earnings, total deductions and NET PAY (the
 * net highlighted), with paid and LOP days; EARNINGS and DEDUCTIONS as two
 * ruled tables with their totals; reimbursements; the net pay in words;
 * employer contributions (never deducted); the income-tax working and the
 * employee's details. The PDF actions are pinned to the bottom of the screen.
 */
export default function PayslipScreen({ navigation, route }: StackScreenProps<"Payslip">) {
  const t = useTheme()
  const toast = useToast()
  const c = usePayColors()
  const insets = useSafeAreaInsets()
  const { settings, error: settingsError } = useSettings()
  const [slip, setSlip] = React.useState<Payslip | null | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<"share" | "print" | null>(null)
  // The footer floats over the page, so the page reserves its measured height.
  const [footerH, setFooterH] = React.useState(0)

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

  if (slip === undefined) return <DetailSkeleton onBack={() => navigation.goBack()} panels={[4, 5, 4]} />

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

  const net = d ? d.netPay ?? slip!.net_pay : 0
  const reimbursements = d ? (d.reimbursements || []).filter((x) => Number(x.amount) > 0) : []
  const employer = d ? (d.employer || []).filter((x) => Number(x.amount) > 0) : []

  return (
    <View style={styles.root}>
      <AppScreen
        title={d ? monthLabel(d.month) : "Payslip"}
        subtitle={slip ? `Payslip · Paid on ${formatDate(slip.released_at)}` : undefined}
        back
        onBack={() => navigation.goBack()}
        inTabs={false}
        contentStyle={slip && d ? { paddingBottom: footerH + spacing.lg } : undefined}
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
            <Panel title="Summary">
              <View style={styles.summary}>
                <StatStrip
                  stats={[
                    { key: "gross", label: "Gross earnings", value: money(d.gross ?? slip.gross) },
                    { key: "ded", label: "Deductions", value: money(d.totalDeductions) },
                    { key: "net", label: "Net pay", value: money(net), tone: "accent" },
                  ]}
                />
              </View>
              <NetStrip
                parts={[
                  { key: "net", label: "Take-home", value: Math.max(0, (d.netPay || 0) - (d.reimbursementTotal || 0)), color: c.net },
                  { key: "ded", label: "Deductions", value: otherDeductionsOf(d), color: c.deductions },
                  { key: "tds", label: "Income tax", value: tdsOf(d), color: c.tds },
                ]}
              />
              <View style={styles.days}>
                <Text style={[textVariants.small, { color: t.textSecondary }]}>
                  {`Paid days: ${d.paidDays} of ${d.basisDays}`}
                </Text>
                <Text style={[textVariants.small, { color: t.textFaint }]}>·</Text>
                {d.lopDays > 0 ? (
                  <View style={[styles.lop, { backgroundColor: t.warningBg }]}>
                    <Text style={[textVariants.captionStrong, { color: t.warningText }]}>{`LOP days: ${d.lopDays}`}</Text>
                  </View>
                ) : (
                  <Text style={[textVariants.small, { color: t.textSecondary }]}>LOP days: 0</Text>
                )}
              </View>
            </Panel>

            <Panel title="Earnings">
              <PayTable
                headers={["Component", "Amount"]}
                rows={payRows(d.earnings || [])}
                total={{ label: "Gross earnings", values: [money(d.gross)] }}
              />
            </Panel>

            <Panel title="Deductions">
              <PayTable
                headers={["Component", "Amount"]}
                rows={payRows(d.deductions || [])}
                total={{ label: "Total deductions", values: [money(d.totalDeductions)] }}
              />
            </Panel>

            {reimbursements.length > 0 ? (
              <Panel title="Reimbursements">
                <PayTable
                  headers={["Claim", "Amount"]}
                  rows={payRows(reimbursements)}
                  total={{ label: "Total reimbursements", values: [money(d.reimbursementTotal)] }}
                />
              </Panel>
            ) : null}

            <Panel title="Net pay">
              <PayTable
                headers={["", "Amount"]}
                rows={[
                  { key: "gross", label: "Gross earnings", values: [money(d.gross)] },
                  { key: "ded", label: "Total deductions", values: [`− ${money(d.totalDeductions)}`] },
                  ...(Number(d.reimbursementTotal) > 0
                    ? [{ key: "rei", label: "Reimbursements", values: [`+ ${money(d.reimbursementTotal)}`] }]
                    : []),
                ]}
              />
              <NetPayBlock amount={net} words={rupeesInWords(net)} />
            </Panel>

            {employer.length > 0 ? (
              <Panel title="Employer contributions">
                <Text style={[textVariants.caption, styles.note, { color: t.textTertiary }]}>
                  Paid by the company on top of your salary. Not deducted from you.
                </Text>
                <PayTable
                  headers={["Component", "Amount"]}
                  rows={payRows(employer)}
                  total={{ label: "Paid by the company", values: [money(d.employerTotal)] }}
                />
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

      {slip && d ? (
        <View
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          style={[
            styles.footer,
            { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: insets.bottom + spacing.sm },
          ]}
        >
          <View style={styles.footerNet}>
            <Text style={[textVariants.caption, { color: t.textTertiary }]}>Net pay</Text>
            <Text style={[textVariants.amount, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {money(net)}
            </Text>
          </View>
          <IconButton
            name="print"
            onPress={() => void run("print")}
            disabled={!!busy}
            accessibilityLabel="Print payslip"
          />
          <Button
            label="Download PDF"
            icon="share"
            loading={busy === "share"}
            disabled={!!busy}
            onPress={() => void run("share")}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  summary: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  days: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: gutter,
    paddingBottom: gutter,
  },
  lop: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  note: { paddingHorizontal: gutter, paddingBottom: spacing.sm },
  hint: { paddingHorizontal: gutter, paddingVertical: spacing.lg, textAlign: "center" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerNet: { flex: 1, minWidth: 0 },
})
