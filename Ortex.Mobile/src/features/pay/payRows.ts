import { money, type PayLine } from "@/features/pay/payFormat"

/** A row of payUi's ruled PayTable: a name on the left, one figure per column on the right. */
export type PayTableRow = { key: string; label: string; values: string[]; note?: string }

/** A payslip's lines as table rows: only what was actually paid or taken. */
export function payRows(items: PayLine[]): PayTableRow[] {
  return (items || [])
    .filter((x) => Number(x.amount) > 0)
    .map((x, i) => ({ key: `${x.code}-${i}`, label: x.name, values: [money(x.amount)] }))
}
