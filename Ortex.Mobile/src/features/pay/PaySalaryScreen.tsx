import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { formatDate } from "@/domain/format"
import { money, monthLabel, PAY_TYPE_LABEL, payTermsOf, type SalaryRevision } from "@/features/pay/payFormat"
import { PayHero, PayHeroSkeleton } from "@/features/pay/payUi"
import { myRevisions } from "@/lib/pay"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, EmptyState, ListRow, Panel, RowSeparator, SkeletonPanel } from "@/ui"

const per = (type: "monthly" | "daily") => (type === "daily" ? "a day" : "a month")

/**
 * My pay rate: how I am paid (a monthly salary, or a daily wage for each day
 * worked) and the rate, then the history of changes. Read-only: pay changes
 * are payroll's. An older revision reads as a monthly salary at its gross.
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
      setError(e instanceof Error ? e.message : "Could not load your pay.")
      setRevs((r) => r ?? [])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // The revision in force today: the latest effective on or before this month.
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01"
  const current = revs ? revs.find((r) => r.effective_from <= thisMonth) || revs[revs.length - 1] || null : null
  const terms = payTermsOf(current)
  const others = revs && current ? revs.filter((r) => r.id !== current.id) : []

  return (
    <AppScreen title="My pay rate" subtitle="Pay changes are made by payroll." back onBack={() => navigation.goBack()} inTabs={false}>
      <DataNotice error={error} onRetry={() => void load()} />
      {revs === null ? (
        <>
          <PayHeroSkeleton button={false} />
          <SkeletonPanel lines={2} />
        </>
      ) : !current || !terms ? (
        <Panel>
          <EmptyState icon="money" title="No pay on record yet" hint="Payroll sets up your pay. It appears here once they do." />
        </Panel>
      ) : (
        <>
          <Panel>
            <View style={styles.heroTop}>
              <PayHero
                eyebrow={PAY_TYPE_LABEL[terms.type]}
                label={terms.type === "daily" ? "Daily rate" : "Monthly salary"}
                amount={terms.rate}
                caption={`Effective from ${monthLabel(current.effective_from)}`}
              />
            </View>
          </Panel>

          <Panel title="How It Is Paid" padded>
            <Text style={[textVariants.small, { color: t.textSecondary }]}>
              {terms.type === "daily"
                ? "Each month you are paid for the days you worked: present or on duty is a full day, a half day is half. Weekly offs, holidays and leave are not paid. Overtime is paid per hour at the same rate."
                : "Each month you are paid your salary for the days paid in attendance; an unpaid day costs one day's pay. Overtime is paid per hour at the same rate."}
            </Text>
          </Panel>

          {others.length > 0 ? (
            <Panel title="History" meta={`${others.length}`}>
              {others.map((r, i) => {
                const rt = payTermsOf(r)!
                return (
                  <React.Fragment key={r.id}>
                    {i > 0 && <RowSeparator />}
                    <ListRow
                      leadingIcon="calendar"
                      leadingTone={r.effective_from > thisMonth ? "emerald" : "slate"}
                      title={`${money(rt.rate)} ${per(rt.type)}`}
                      subtitle={`${r.effective_from > thisMonth ? "From" : "Since"} ${monthLabel(r.effective_from)} · ${PAY_TYPE_LABEL[rt.type]}${
                        r.reason ? ` · ${r.reason}` : ""
                      }`}
                      chevron={false}
                    />
                  </React.Fragment>
                )
              })}
            </Panel>
          ) : null}

          <Text style={[textVariants.caption, styles.hint, { color: t.textTertiary }]}>
            {`Pay changes are made by payroll. Recorded ${formatDate(current.created_at)}.`}
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
