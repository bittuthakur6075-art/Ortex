import { useFocusEffect, useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"

import { formatDate } from "@/domain/format"
import { money, monthLabel, type Payslip } from "@/features/pay/payFormat"
import { feedback } from "@/lib/feedback"
import { latestPayslip } from "@/lib/pay"
import type { RootStackParamList } from "@/navigation/types"
import ListRow from "@/ui/ListRow"
import Panel from "@/ui/Panel"

/**
 * "Latest payslip" on Home: one row, and ONLY for someone who has a released
 * payslip. Before payroll's first paid run (or on a project without migration
 * 0040) it renders nothing at all, rather than an empty promise on the page
 * everyone opens first.
 */
export default function PayHomeLine() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [slip, setSlip] = React.useState<Payslip | null>(null)

  useFocusEffect(
    React.useCallback(() => {
      let alive = true
      void latestPayslip().then((s) => {
        if (alive) setSlip(s)
      })
      return () => {
        alive = false
      }
    }, []),
  )

  if (!slip) return null
  return (
    <Panel>
      <ListRow
        leadingIcon="money"
        leadingTone="emerald"
        title="Latest payslip"
        subtitle={`${monthLabel(slip.data.month)} · Paid on ${formatDate(slip.released_at)}`}
        value={money(slip.data.netPay ?? slip.net_pay)}
        onPress={() => {
          feedback.tap()
          navigation.navigate("Payslip", { id: slip.id })
        }}
      />
    </Panel>
  )
}
