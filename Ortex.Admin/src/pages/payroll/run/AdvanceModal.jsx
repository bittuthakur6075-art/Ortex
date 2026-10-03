import { useState } from "react"
import { Button, Field, Input, Modal } from "../../../components/ui/Ui"
import { recoveryFor } from "../../../lib/payroll"
import { money } from "./shared"

// This month's advance recovery for one person in a draft run: each open
// advance with its balance and instalment, and the amount to take this month
// (blank = the instalment, 0 = skip this month). Kept in the run screen's edits
// and on the slip, so it survives the next Calculate.
// `person` is { user_id, name, loans, recover: { [loanId]: amount } }.
export default function AdvanceModal({ person, onSave, onClose }) {
  const [recover, setRecover] = useState(() => ({ ...(person.recover || {}) }))
  const set = (id, v) => setRecover((r) => ({ ...r, [id]: v === "" ? "" : Math.max(0, Number(v)) }))

  return (
    <Modal
      open
      onClose={onClose}
      title={`Advance recovery · ${person.name || ""}`}
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(recover)}>
            Keep for Calculate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {person.loans.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No advance is being recovered this month.</p>
        ) : (
          person.loans.map((l) => {
            const v = recover[l.id] ?? ""
            const take = recoveryFor(l, v)
            return (
              <div key={l.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-medium text-foreground">{l.name}</span>
                  <span className="tabular text-muted-foreground">
                    {money(l.balance)} left of {money(l.amount)}
                  </span>
                </div>
                <div className="flex items-end gap-2">
                  <Field label="Recover this month (₹)" hint={`Instalment ${money(l.instalment)}. Leave blank for the instalment, 0 to skip.`} className="flex-1">
                    <Input type="number" min="0" step="1" placeholder={String(recoveryFor(l, null))} value={v} onChange={(e) => set(l.id, e.target.value)} />
                  </Field>
                  <Button size="md" variant="outline" onClick={() => set(l.id, 0)}>
                    Skip this month
                  </Button>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Advance recovered this month {money(take)} (balance {money(Math.max(0, l.balance - take))}).
                </p>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
