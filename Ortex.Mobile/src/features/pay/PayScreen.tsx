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
import { NetPayBars, PayDonut, PayHero } from "@/features/pay/payUi"
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
  SkeletonPanel,
} from "@/ui"

/**
 * My pay (Zoho Payroll's employee app): the last net pay first, as one figure;
 * then the financial year so far as a donut of where the gross went (take-home,
 * deductions, income tax), the last six months' net pay, every payslip by
 * financial year, and the doors to salary, claims and any loan being recovered.
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
          <SkeletonPanel lines={2} block={90} />
          <SkeletonPanel lines={3} block={140} />
          <SkeletonPanel lines={4} />
        </>
      ) : (
        <>
          {latest ? (
            <Panel title="Latest payslip">
              <PayHero
                label={`Net pay · ${monthLabel(latest.data.month)}`}
                amount={latest.data.netPay ?? latest.net_pay}
                caption={`${daysText(latest.data.paidDays)} paid${
                  latest.data.lopDays > 0 ? `, ${daysText(latest.data.lopDays)} loss of pay` : ""
                } · Released ${formatDate(latest.released_at)}`}
              />
              <View style={styles.cta}>
                <Button label="View payslip" icon="invoice" variant="secondary" fullWidth onPress={() => open(latest.id)} />
              </View>
            </Panel>
          ) : (
            <Panel>
              <EmptyState
                icon="money"
                title="No payslips yet"
                hint="They appear here once payroll records a payment."
              />
            </Panel>
          )}

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
            </Panel>
          ) : null}

          {trend.length > 1 ? (
            <Panel title="Net pay by month">
              <NetPayBars data={trend} onPress={open} />
            </Panel>
          ) : null}

          {groups.map((g) => (
            <Panel key={g.fy} title={`Payslips FY ${g.fy}`} meta={`${g.slips.length}`}>
              {g.slips.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <RowSeparator />}
                  <ListRow
                    leadingIcon="invoice"
                    leadingTone="primary"
                    title={monthLabel(s.data.month)}
                    subtitle={`Gross ${money(s.data.gross ?? s.gross)} · ${daysText(s.data.paidDays)} paid`}
                    value={money(s.data.netPay ?? s.net_pay)}
                    onPress={() => open(s.id)}
                  />
                </React.Fragment>
              ))}
            </Panel>
          ))}

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

          <Section title="More">
            <SectionRow
              leadingIcon="money"
              title="My salary"
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
          </Section>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  cta: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  note: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  loan: { paddingHorizontal: gutter, paddingVertical: spacing.md, gap: spacing.sm },
  loanHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
})
