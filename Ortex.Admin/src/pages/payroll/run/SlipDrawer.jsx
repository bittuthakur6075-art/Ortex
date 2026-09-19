import { Eye } from "../../../components/ui/Icons"
import { Badge, Banner, Button, Drawer } from "../../../components/ui/Ui"
import { SLIP_STATUS, money } from "./shared"

// One person's payslip in a pay run, taken apart: every earning, deduction and
// employer contribution, the attendance it was paid on, the tax projection
// behind the TDS, and anything the 50% cap carried forward.

function Lines({ title, rows, total, totalLabel, empty = "None" }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[13px] font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r, i) => (
            <div key={`${r.code}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0 text-foreground">
                {r.name}
                {r.full != null && r.full !== r.amount && <span className="block text-[12px] text-muted-foreground">of {money(r.full)} for the full month</span>}
                {r.oneTime && <span className="block text-[12px] text-muted-foreground">One-time{r.taxable === false ? ", not taxed" : ""}</span>}
              </span>
              <span className="tabular text-foreground">{money(r.amount)}</span>
            </div>
          ))}
          {totalLabel && (
            <div className="flex justify-between gap-3 bg-subtle px-3 py-2 text-[13px] font-semibold text-foreground">
              <span>{totalLabel}</span>
              <span className="tabular">{money(total)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const ATT = [
  ["present", "Present"],
  ["field", "On duty"],
  ["half_days", "Half days"],
  ["absent", "Absent"],
  ["missed", "Missed punches"],
  ["weekly_off", "Weekly offs"],
  ["holidays", "Holidays"],
  ["leave", "Leave"],
  ["lop", "Loss of pay"],
  ["late_penalty", "Late penalty"],
  ["payable", "Payable days"],
]

export default function SlipDrawer({ row, onClose, onPreview, onDownload, downloading }) {
  if (!row) return null
  const d = row.data || {}
  const e = d.employee || {}
  const tds = d.tds || {}
  const att = d.attendance
  const meta = SLIP_STATUS[row.status] || SLIP_STATUS.included
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-xl"
      title={e.name || "Payslip"}
      subtitle={[e.employee_code, e.designation, e.department].filter(Boolean).join(" · ") || undefined}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onPreview}>
            <Eye className="h-4 w-4" /> Preview payslip
          </Button>
          <Button onClick={onDownload} disabled={downloading}>
            {downloading ? "Making PDF…" : "Download PDF"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2.5">
          <Tile label="Gross" value={money(d.gross)} />
          <Tile label="Deductions" value={money(d.totalDeductions)} />
          <Tile label="Net pay" value={money(d.netPay)} strong />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span>
            Paid {d.paidDays} of {d.basisDays} days
            {Number(d.lopDays) > 0 ? `, ${d.lopDays} loss of pay` : ""}
            {d.paidDaysOverride != null ? " (edited by payroll)" : ""}
          </span>
        </div>
        {d.attendanceError && <Banner tone="warning">Attendance could not be read when this was calculated: {d.attendanceError}</Banner>}

        <Lines title="Earnings" rows={d.earnings || []} total={d.gross} totalLabel="Gross earnings" />
        <Lines title="Deductions" rows={d.deductions || []} total={d.totalDeductions} totalLabel="Total deductions" />
        {(d.reimbursements || []).length > 0 && (
          <Lines title="Reimbursements (paid with salary, not taxed)" rows={d.reimbursements} total={d.reimbursementTotal} totalLabel="Total reimbursements" />
        )}
        <Lines title="Employer contributions" rows={d.employer || []} total={d.employerTotal} totalLabel="Employer total" empty="No employer contributions this month." />
        <p className="text-[13px] text-muted-foreground">
          Cost to the company this month <span className="font-semibold text-foreground tabular">{money(d.costToCompany)}</span>. PF wages{" "}
          {money(d.pf?.base)} (ceiling {money(d.pfCeiling)}).
        </p>

        {(d.carried || []).length > 0 && (
          <Banner tone="warning">
            Carried to next month so deductions stay within half the pay: {d.carried.map((c) => `${c.name} ${money(c.amount)}`).join(", ")}.
          </Banner>
        )}

        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold text-foreground">Income tax projection</h3>
          {tds.monthly || tds.annualGross ? (
            <div className="divide-y divide-border rounded-lg border border-border text-[13px]">
              <Pair k="Regime" v={tds.regime === "old" ? "Old" : "New"} />
              <Pair k="Projected gross for the year" v={money(tds.annualGross)} />
              <Pair k="Taxable after deductions" v={money(tds.taxable)} />
              <Pair k="Tax for the year, with cess" v={money(tds.annualTax)} />
              <Pair k="TDS this month" v={money(tds.monthly)} strong />
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No TDS for this person (turned off on their pay profile, or tax is nil).</p>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold text-foreground">Attendance when calculated</h3>
          {att ? (
            <div className="grid grid-cols-2 gap-x-4 rounded-lg border border-border px-3 py-1 text-[13px] sm:grid-cols-3">
              {ATT.map(([k, label]) => (
                <div key={k} className="flex justify-between gap-2 py-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="tabular text-foreground">{Number(att[k]) || 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No attendance for this month, so the full month was paid.</p>
          )}
        </section>
      </div>
    </Drawer>
  )
}

function Tile({ label, value, strong }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className={strong ? "mt-0.5 text-base font-semibold text-foreground tabular" : "mt-0.5 text-sm font-medium text-foreground tabular"}>{value}</div>
    </div>
  )
}

function Pair({ k, v, strong }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={strong ? "font-semibold text-foreground tabular" : "text-foreground tabular"}>{v}</span>
    </div>
  )
}
