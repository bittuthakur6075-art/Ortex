import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatDate } from "@/domain/format"
import {
  daysText,
  fyWords,
  groupByFy,
  money,
  monthLabel,
  netPayTrend,
  ytdTotals,
  type Loan,
  type Payslip,
} from "@/features/pay/payFormat"
import { NetPayBars, PayDonut, PayHero, PayHeroSkeleton, PayListSkeleton, StatStrip } from "@/features/pay/payUi"
import { usePayColors } from "@/features/pay/usePayColors"
import { feedback } from "@/lib/feedback"
import { myLoans, myPayslips } from "@/lib/pay"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  Button,
  DataNotice,
  EmptyState,
  ListRefreshControl,
  ListRow,
  Panel,
  ProgressBar,
  RowSeparator,
  Section,
  SectionRow,
} from "@/ui"

/**
 * My pay, laid out like Zoho Payroll's employee home: the latest payslip is the
 * hero (the month, NET PAY as the one large figure, the pay date, paid and LOP
 * days, and "View payslip"); then every payslip by month, newest first, with
 * its net pay and the day it was paid; then the year so far; then the doors to
 * the salary structure, reimbursement claims and income tax.
 */
export default function PayScreen({ navigation }: StackScreenProps<"Pay">) {
  const t = useTheme()
  const c = usePayColors()
  const [slips, setSlips] = React.useState<Payslip[] | null>(null)
  const [loans, setLoans] = React.useState<Loan[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const [s, l] = await Promise.all([myPayslips(), myLoans().catch(() => [] as Loan[])])
      setSlips(s)
      setLoans(l)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your pay.")
      setSlips((s) => s ?? [])
    }
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void load()
    }, [load]),
  )

  const open = (id: string) => {
    feedback.tap()
    navigation.navigate("Payslip", { id })
  }

  const latest = slips?.[0] ?? null
  const ytd = React.useMemo(() => ytdTotals(slips || []), [slips])
  const trend = React.useMemo(() => netPayTrend(slips || [], 6), [slips])
  const groups = React.useMemo(() => groupByFy(slips || []), [slips])
  const openLoans = loans.filter((l) => l.status !== "closed")
  const regime = latest?.data.tds?.regime

  return (
    <AppScreen
      title="My pay"
      subtitle="Payslips, salary and claims"
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
      {slips === null ? (
        <>
          <PayHeroSkeleton />
          <PayListSkeleton count={4} />
        </>
      ) : (
        <>
          {latest ? (
            <Panel>
              <View style={styles.heroTop}>
                <PayHero
                  eyebrow={`${monthLabel(latest.data.month)} payslip`}
                  label="Net pay"
                  amount={latest.data.netPay ?? latest.net_pay}
                  caption={`Paid on ${formatDate(latest.released_at)}`}
                >
                  <StatStrip
                    stats={[
                      { key: "paid", label: "Paid days", value: `${latest.data.paidDays}` },
                      {
                        key: "lop",
                        label: "LOP days",
                        value: `${latest.data.lopDays || 0}`,
                        tone: latest.data.lopDays > 0 ? "warning" : undefined,
                      },
                      { key: "gross", label: "Gross", value: money(latest.data.gross ?? latest.gross) },
                    ]}
                  />
                  <Button label="View payslip" icon="preview" fullWidth onPress={() => open(latest.id)} />
                </PayHero>
              </View>
            </Panel>
          ) : (
            <Panel>
              <EmptyState icon="money" title="No payslips yet" hint="They appear here once payroll records a payment." />
            </Panel>
          )}

          {groups.map((g) => (
            <Panel key={g.fy} title={`Payslips FY ${g.fy}`} meta={`${g.slips.length}`}>
              {g.slips.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <RowSeparator />}
                  <ListRow
                    leadingIcon="invoice"
                    leadingTone={s.id === latest?.id ? "primary" : "slate"}
                    title={monthLabel(s.data.month)}
                    subtitle={`Paid on ${formatDate(s.released_at)}${
                      s.data.lopDays > 0 ? ` · ${daysText(s.data.lopDays)} LOP` : ""
                    }`}
                    value={money(s.data.netPay ?? s.net_pay)}
                    valueSub={<Text style={[textVariants.caption, { color: t.textTertiary }]}>Net pay</Text>}
                    onPress={() => open(s.id)}
                  />
                </React.Fragment>
              ))}
            </Panel>
          ))}

          {latest && ytd.count > 0 ? (
            <Panel title="This financial year" meta={`${fyWords(latest.data.month)} · ${ytd.count} ${ytd.count === 1 ? "payslip" : "payslips"}`}>
              <PayDonut
                centreLabel="Gross"
                centreValue={money(ytd.gross)}
                slices={[
                  { key: "net", label: "Take-home", value: Math.max(0, ytd.net - ytd.reimbursements), color: c.net },
                  { key: "ded", label: "Deductions", value: ytd.deductions, color: c.deductions },
                  { key: "tds", label: "Income tax (TDS)", value: ytd.tds, color: c.tds },
                ]}
              />
              {ytd.reimbursements > 0 ? (
                <Text style={[textVariants.caption, styles.note, { color: t.textTertiary }]}>
                  {`Plus ${money(ytd.reimbursements)} of claims paid with salary.`}
                </Text>
              ) : null}
              {trend.length > 1 ? (
                <>
                  <Text style={[textVariants.tileLabel, styles.subhead, { color: t.textTertiary }]}>NET PAY BY MONTH</Text>
                  <NetPayBars data={trend} onPress={open} />
                </>
              ) : null}
            </Panel>
          ) : null}

          {openLoans.length > 0 ? (
            <Panel title="Loans and advances" meta={`${openLoans.length}`}>
              {openLoans.map((l, i) => (
                <React.Fragment key={l.id}>
                  {i > 0 && <RowSeparator />}
                  <View style={styles.loan} accessible accessibilityLabel={`${l.name}: ${money(l.balance)} left of ${money(l.amount)}`}>
                    <View style={styles.loanHead}>
                      <Text style={[textVariants.bodyStrong, { color: t.text, flex: 1 }]}>{l.name}</Text>
                      <Text style={[textVariants.bodyStrong, { color: t.text }]}>{`${money(l.balance)} left`}</Text>
                    </View>
                    <ProgressBar progress={l.amount > 0 ? l.recovered / l.amount : 0} />
                    <Text style={[textVariants.caption, { color: t.textTertiary }]}>
                      {`${money(l.recovered)} of ${money(l.amount)} recovered · ${money(l.instalment)} a month${
                        l.status === "paused" ? " · Paused" : ""
                      }`}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </Panel>
          ) : null}

          <Section title="Salary and benefits">
            <SectionRow
              leadingIcon="money"
              title="Salary structure"
              subtitle="Annual CTC and the monthly breakup"
              onPress={() => {
                feedback.tap()
                navigation.navigate("PaySalary")
              }}
            />
            <SectionRow
              leadingIcon="invoice"
              title="Reimbursement claims"
              subtitle="Fuel, travel, phone and other bills"
              onPress={() => {
                feedback.tap()
                navigation.navigate("PayClaims")
              }}
            />
            {ytd.tds > 0 && latest ? (
              <SectionRow
                leadingIcon="percent"
                title="Income tax deducted"
                subtitle={`${fyWords(latest.data.month)}${regime ? ` · ${regime === "old" ? "Old" : "New"} regime` : ""}`}
                value={money(ytd.tds)}
                onPress={() => open(latest.id)}
                accessibilityLabel={`Income tax deducted this year: ${money(ytd.tds)}. Opens the latest payslip.`}
              />
            ) : null}
          </Section>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  heroTop: { paddingTop: gutter },
  note: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  subhead: { paddingHorizontal: gutter, paddingTop: spacing.sm, paddingBottom: spacing.md },
  loan: { paddingHorizontal: gutter, paddingVertical: spacing.md, gap: spacing.sm },
  loanHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
})
