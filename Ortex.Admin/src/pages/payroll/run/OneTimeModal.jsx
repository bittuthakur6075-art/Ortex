import { useState } from "react"
import { toast } from "sonner"
import { Trash2 } from "../../../components/ui/Icons"
import { Button, Field, Input, Modal, Select } from "../../../components/ui/Ui"
import { Check } from "../setup/common"
import { money } from "./shared"

// One-time earnings and deductions for one person in a draft run (Zoho's
// "Add one-time earning / deduction"). The list is kept in the run screen's
// local edits and reaches the payslip at the next Calculate.

const PRESETS = [
  { code: "BONUS", name: "Bonus", kind: "earning" },
  { code: "INCENTIVE", name: "Incentive", kind: "earning" },
  { code: "OVERTIME", name: "Overtime", kind: "earning" },
  { code: "RECOVERY", name: "Recovery", kind: "deduction" },
  { code: "CUSTOM", name: "", kind: "earning" },
]

const blank = { code: "BONUS", name: "Bonus", kind: "earning", amount: "", taxable: true }

export default function OneTimeModal({ person, onSave, onClose }) {
  const [items, setItems] = useState(() => person?.items || [])
  const [draft, setDraft] = useState(blank)

  const pick = (code) => {
    const p = PRESETS.find((x) => x.code === code) || PRESETS[0]
    setDraft({ ...draft, code, name: p.name, kind: p.kind })
  }

  const add = () => {
    const amount = Math.round(Number(draft.amount) * 100) / 100
    const name = draft.name.trim()
    if (!name) return toast.error("Name the item, like Festival advance")
    if (!(amount > 0)) return toast.error("Enter an amount above zero")
    const code = draft.code === "CUSTOM" ? name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 20) || "ONE_TIME" : draft.code
    setItems([...items, { kind: draft.kind, code, name, amount, taxable: draft.kind === "earning" ? draft.taxable : undefined }])
    setDraft(blank)
  }

  return (
    <Modal
      open={Boolean(person)}
      onClose={onClose}
      title={`One-time items · ${person?.name || ""}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(items)}>Keep for Calculate</Button>
        </>
      }
    >
      <div className="space-y-4">
        {items.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border">
            {items.map((it, i) => (
              <div key={`${it.code}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{it.name}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {it.kind === "deduction" ? "Deduction" : it.taxable === false ? "Earning, not taxed" : "Earning, taxed"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular">{it.kind === "deduction" ? `− ${money(it.amount)}` : money(it.amount)}</span>
                  <Button variant="dangerGhost" size="sm" icon aria-label={`Remove ${it.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Nothing added for this month yet.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Item">
            <Select value={draft.code} onChange={(e) => pick(e.target.value)}>
              <option value="BONUS">Bonus</option>
              <option value="INCENTIVE">Incentive</option>
              <option value="OVERTIME">Overtime</option>
              <option value="RECOVERY">Recovery (deduction)</option>
              <option value="CUSTOM">Something else</option>
            </Select>
          </Field>
          <Field label="Amount (₹)">
            <Input type="number" min="0" step="1" inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          </Field>
          {draft.code === "CUSTOM" && (
            <>
              <Field label="Name">
                <Input value={draft.name} maxLength={40} placeholder="Festival advance" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Type">
                <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </Select>
              </Field>
            </>
          )}
        </div>
        {draft.kind === "earning" && (
          <Check id="one-time-taxable" checked={draft.taxable} onChange={(v) => setDraft({ ...draft, taxable: v })} label="Taxable" hint="Counts towards this month's TDS" />
        )}
        <Button variant="outline" onClick={add}>
          Add item
        </Button>
        <p className="text-[12px] text-muted-foreground">
          One-time earnings are outside PF wages. Deductions give way to the 50% cap first and carry forward if they do not fit.
        </p>
      </div>
    </Modal>
  )
}
