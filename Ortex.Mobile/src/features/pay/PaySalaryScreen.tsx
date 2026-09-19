import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatDate } from "@/domain/format"
import { money, monthLabel, type SalaryRevision } from "@/features/pay/payFormat"
import { PayHero, PayHeroSkeleton, PayTable, StatStrip } from "@/features/pay/payUi"
import { myRevisions } from "@/lib/pay"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, EmptyState, ListRow, Panel, RowSeparator, SkeletonPanel } from "@/ui"

/**
 * Salary structure, laid out like Zoho Payroll's: annual CTC as the hero with
 * the monthly gross beside it, then the components grouped (Earnings, Employer
 * contributions, Deductions), each with its monthly and annual figure side by
 * side, then the revision history. Read-only: salary changes are payroll's.
 */
export default function PaySalaryScreen({ navigation }: StackScreenProps<"PaySalary">) {
  const t = useTheme()
  const [revs, setRevs] = React.useState<SalaryRevision[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

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

  return (
    <AppScreen title="Salary structure" subtitle="Salary changes are made by payroll." back onBack={() => navigation.goBack()} inTabs={false}>
      <DataNotice error={error} onRetry={() => void load()} />
      {revs === null ? (
        <>
          <PayHeroSkeleton button={false} />
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={2} />
        </>
      ) : !current ? (
        <Panel>
          <EmptyState icon="money" title="No salary on record yet" hint="Payroll sets up your salary. It appears here once they do." />
        </Panel>
      ) : (
        <>
          <Panel>
            <View style={styles.heroTop}>
              <PayHero
                eyebrow="Current salary"
                label="Annual CTC"
                amount={current.annual_ctc}
                caption={`Effective from ${monthLabel(current.effective_from)}`}
              >
                <StatStrip
                  stats={[
                    { key: "m", label: "Monthly gross", value: money(current.monthly_gross), tone: "accent" },
                    { key: "a", label: "Annual gross", value: money(current.monthly_gross * 12) },
                  ]}
                />
              </PayHero>
            </View>
          </Panel>

          <Panel title="Earnings">
            <PayTable
              headers={["Component", "Monthly", "Annual"]}
              rows={current.earnings
                .filter((e) => e.amount > 0)
                .map((e, i) => ({ key: `${e.code}-${i}`, label: e.name, values: [money(e.amount), money(e.amount * 12)] }))}
              total={{ label: "Gross", values: [money(current.monthly_gross), money(current.monthly_gross * 12)] }}
              empty="No earnings recorded."
            />
          </Panel>

          {current.employer_pf_in_ctc > 0 ? (
            <Panel title="Employer contributions">
              <PayTable
                headers={["Component", "Monthly", "Annual"]}
                rows={[
                  {
                    key: "epf",
                    label: "Employer PF",
                    note: "Paid into your PF account, not your salary",
                    values: [money(current.employer_pf_in_ctc), money(current.employer_pf_in_ctc * 12)],
                  },
                ]}
              />
            </Panel>
          ) : null}

          <Panel title="Deductions" padded>
            <Text style={[textVariants.small, { color: t.textSecondary }]}>
              Your salary is shown before deductions. PF, ESI and income tax are taken from each month's pay and shown
              on its payslip.
            </Text>
          </Panel>

          {upcoming.length > 0 || earlier.length > 0 ? (
            <Panel title="Revision history" meta={`${upcoming.length + earlier.length}`}>
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
  heroTop: { paddingTop: gutter },
  hint: { paddingHorizontal: gutter, paddingVertical: spacing.lg, textAlign: "center" },
})
