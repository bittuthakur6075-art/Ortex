import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatDate } from "@/domain/format"
import { money, monthLabel, type SalaryRevision } from "@/features/pay/payFormat"
import { PayFact, PayHero } from "@/features/pay/payUi"
import { myRevisions } from "@/lib/pay"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, EmptyState, ListRow, Panel, RowSeparator, SegmentedControl, SkeletonPanel } from "@/ui"

type Period = "monthly" | "annual"

/**
 * My salary (Zoho Payroll's "Salary structure"): the revision in force, its
 * annual CTC and monthly gross, the components month by month or for the year,
 * and the earlier revisions under it. Read-only: salary changes are payroll's.
 */
export default function PaySalaryScreen({ navigation }: StackScreenProps<"PaySalary">) {
  const t = useTheme()
  const [revs, setRevs] = React.useState<SalaryRevision[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [period, setPeriod] = React.useState<Period>("monthly")

  const load = React.useCallback(async () => {
    try {
      setRevs(await myRevisions())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your salary.")
      setRevs((r) => r ?? [])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // The revision in force today: the latest effective on or before this month.
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01"
  const current = revs ? revs.find((r) => r.effective_from <= thisMonth) || revs[revs.length - 1] || null : null
  const upcoming = revs ? revs.filter((r) => r.effective_from > thisMonth) : []
  const earlier = revs && current ? revs.filter((r) => r.id !== current.id && r.effective_from <= thisMonth) : []
  const factor = period === "annual" ? 12 : 1

  return (
    <AppScreen title="My salary" subtitle="Salary changes are made by payroll." back onBack={() => navigation.goBack()} inTabs={false}>
      <DataNotice error={error} onRetry={() => void load()} />
      {revs === null ? (
        <>
          <SkeletonPanel lines={2} block={90} />
          <SkeletonPanel lines={5} />
        </>
      ) : !current ? (
        <Panel>
          <EmptyState
            icon="money"
            title="No salary on record yet"
            hint="Payroll sets up your salary. It appears here once they do."
          />
        </Panel>
      ) : (
        <>
          <Panel title="Current salary">
            <PayHero
              label="Annual CTC"
              amount={current.annual_ctc}
              caption={`Effective from ${monthLabel(current.effective_from)}`}
            />
            <View style={styles.facts}>
              <PayFact label="Monthly gross" value={money(current.monthly_gross)} />
              <PayFact label="Annual gross" value={money(current.monthly_gross * 12)} />
            </View>
            {current.employer_pf_in_ctc > 0 ? (
              <Text style={[textVariants.caption, styles.note, { color: t.textTertiary }]}>
                {`Your CTC includes ${money(current.employer_pf_in_ctc)} a month of employer PF, paid into your PF account rather than your salary.`}
              </Text>
            ) : null}
          </Panel>

          <Panel title="Breakup">
            <View style={styles.switch}>
              <SegmentedControl<Period>
                options={[
                  { key: "monthly", label: "Monthly" },
                  { key: "annual", label: "Annual" },
                ]}
                value={period}
                onChange={setPeriod}
              />
            </View>
            <View style={styles.rows}>
              {current.earnings
                .filter((e) => e.amount > 0)
                .map((e, i) => (
                  <View key={`${e.code}-${i}`} style={styles.row}>
                    <Text style={[textVariants.body, { color: t.textSecondary, flex: 1 }]}>{e.name}</Text>
                    <Text style={[textVariants.body, styles.num, { color: t.text }]}>{money(e.amount * factor)}</Text>
                  </View>
                ))}
              <View style={[styles.row, styles.total, { borderTopColor: t.border }]}>
                <Text style={[textVariants.bodyStrong, { color: t.text, flex: 1 }]}>
                  {period === "annual" ? "Annual gross" : "Monthly gross"}
                </Text>
                <Text style={[textVariants.bodyStrong, styles.num, { color: t.text }]}>
                  {money(current.monthly_gross * factor)}
                </Text>
              </View>
            </View>
            <Text style={[textVariants.caption, styles.note, { color: t.textTertiary }]}>
              Before deductions. PF, ESI and income tax are taken from each month's pay and shown on its payslip.
            </Text>
          </Panel>

          {upcoming.length > 0 || earlier.length > 0 ? (
            <Panel title="Revisions">
              {[...upcoming, ...earlier].map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 && <RowSeparator />}
                  <ListRow
                    leadingIcon="calendar"
                    leadingTone={r.effective_from > thisMonth ? "emerald" : "slate"}
                    title={`${money(r.annual_ctc)} a year`}
                    subtitle={`${r.effective_from > thisMonth ? "From" : "Since"} ${monthLabel(r.effective_from)}${
                      r.reason ? ` · ${r.reason}` : ""
                    }`}
                    value={money(r.monthly_gross)}
                    valueSub={<Text style={[textVariants.caption, { color: t.textTertiary }]}>a month</Text>}
                    chevron={false}
                  />
                </React.Fragment>
              ))}
            </Panel>
          ) : null}

          <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
            {`Salary changes are made by payroll. Recorded ${formatDate(current.created_at)}.`}
          </Text>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  facts: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.md },
  note: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  switch: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  rows: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 2 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs, paddingTop: spacing.sm },
  num: { fontVariant: ["tabular-nums"] },
  hint: { paddingHorizontal: gutter, paddingVertical: spacing.lg, textAlign: "center" },
})
