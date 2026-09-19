import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus } from "../../components/ui/Icons"
import { Banner, Button, Card, CardHeader, Field, Input, Modal, PageLoader, Select } from "../../components/ui/Ui"
import { getSettings, saveSettings } from "../../services/attendance"
import { listLeaveTypes, saveLeaveType } from "../../services/leave"

// Settings → Leave policy (Super Admin): every leave type's rules, and the
// sandwich rule. The database refuses these writes from anyone else. Accrual
// runs on the 1st of each month; the leave year closes on 1 January (CL and SL
// lapse, EL above its carry-forward limit lapses as encashable).

const ACCRUAL = [
  { value: "monthly", label: "Monthly (annual ÷ 12 on the 1st)" },
  { value: "upfront", label: "Each January (pro-rated for joiners)" },
  { value: "manual", label: "By grant only (comp-off)" },
  { value: "none", label: "Unpaid, no balance" },
]

const SEEDED = new Set(["EL", "CL", "SL", "CO", "LOP"])

const blank = {
  code: "",
  name: "",
  annual: 0,
  accrual: "upfront",
  carry_max: 0,
  half_day: true,
  max_run: "",
  notice_days: 0,
  doc_after_days: "",
  paid: true,
  expires_days: "",
  active: true,
  sort: 10,
}

export default function LeavePolicy() {
  const [state, setState] = useState({ loading: true })
  const [editing, setEditing] = useState(null) // { row, isNew }
  const [sandwich, setSandwich] = useState(false)
  const [savingSandwich, setSavingSandwich] = useState(false)

  const load = useCallback(async () => {
    const [types, settings] = await Promise.all([listLeaveTypes({ all: true }), getSettings()])
    setSandwich(Boolean(settings.doc?.sandwich))
    setState({ loading: false, ...types })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleSandwich = async (on) => {
    setSavingSandwich(true)
    try {
      await saveSettings({ sandwich: on })
      setSandwich(on)
      toast.success(on ? "Sandwich rule on for new requests" : "Sandwich rule off for new requests")
    } catch (e) {
      toast.error(e.message)
    }
    setSavingSandwich(false)
  }

  if (state.loading) return <Card className="p-6"><PageLoader /></Card>
  if (state.missing) return <Banner tone="warning">Leave is not set up on this database yet (migration 0036).</Banner>

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Leave policy"
        description="Earned leave accrues on the 1st of each month. On 1 January, casual and sick leave lapse, earned leave above its carry-forward limit lapses as encashable, and the new year's casual and sick leave are granted."
        action={
          <Button size="sm" onClick={() => setEditing({ row: { ...blank }, isNew: true })}>
            <Plus className="h-4 w-4" /> Add leave type
          </Button>
        }
      />
      {state.error && <Banner tone="danger" className="mx-5 mb-4">{state.error}</Banner>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="mt-head">
            <tr className="text-left">
              <th>Code</th>
              <th>Name</th>
              <th>Days a year</th>
              <th>How it builds</th>
              <th>Carry forward</th>
              <th>Half day</th>
              <th>Max in a row</th>
              <th>Notice</th>
              <th>Certificate after</th>
              <th>Paid</th>
              <th>Active</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="mt-body">
            {(state.rows || []).map((t) => (
              <tr key={t.code}>
                <td className="font-semibold text-foreground">{t.code}</td>
                <td className="text-foreground">{t.name}</td>
                <td className="tabular">{Number(t.annual)}</td>
                <td className="text-muted-foreground">{ACCRUAL.find((a) => a.value === t.accrual)?.label.split(" (")[0]}</td>
                <td className="tabular">{Number(t.carry_max) || "No"}</td>
                <td>{t.half_day ? "Yes" : "No"}</td>
                <td className="tabular">{t.max_run || "-"}</td>
                <td className="tabular">{t.notice_days ? `${t.notice_days} days` : "-"}</td>
                <td className="tabular">{t.doc_after_days != null ? `${t.doc_after_days} days` : "-"}</td>
                <td>{t.paid ? "Yes" : "No"}</td>
                <td>{t.active ? "Yes" : "No"}</td>
                <td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ row: { ...t }, isNew: false })}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">Sandwich rule</div>
          <p className="text-[13px] text-muted-foreground">
            When on, a weekly off or holiday that falls between two days of leave counts as leave too (Friday and Monday off
            makes Saturday and Sunday leave). Applies to requests made after the change.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            id="leave-sandwich"
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={sandwich}
            disabled={savingSandwich}
            onChange={(e) => toggleSandwich(e.target.checked)}
          />
          {sandwich ? "On" : "Off"}
        </label>
      </div>
      <TypeEditor
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void load()
        }}
      />
    </Card>
  )
}

function TypeEditor({ editing, onClose, onSaved }) {
  const [row, setRow] = useState(blank)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (editing) setRow({ ...blank, ...editing.row })
  }, [editing])
  const set = (k, v) => setRow((r) => ({ ...r, [k]: v }))
  const isNew = Boolean(editing?.isNew)
  const lockedCode = !isNew || SEEDED.has(row.code)

  const save = async () => {
    setBusy(true)
    try {
      await saveLeaveType(row, { isNew })
      toast.success(isNew ? `${row.code.toUpperCase()} added` : `${row.code} saved`)
      onSaved()
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(false)
  }

  const numField = (key, label, hint, placeholder = "") => (
    <Field label={label} hint={hint}>
      <Input
        id={`lt-${key}`}
        inputMode="decimal"
        value={row[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  )

  const check = (key, label) => (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        id={`lt-${key}`}
        type="checkbox"
        className="h-4 w-4 rounded border-border accent-primary"
        checked={Boolean(row[key])}
        onChange={(e) => set(key, e.target.checked)}
      />
      {label}
    </label>
  )

  return (
    <Modal
      open={Boolean(editing)}
      onClose={onClose}
      width="max-w-2xl"
      title={isNew ? "Add a leave type" : `Edit ${row.name || row.code}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
          <Field label="Code" required hint={lockedCode ? undefined : "2 to 4 capital letters"}>
            <Input
              id="lt-code"
              value={row.code}
              disabled={lockedCode && !isNew}
              maxLength={4}
              onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              placeholder="ML"
            />
          </Field>
          <Field label="Name" required>
            <Input id="lt-name" value={row.name} onChange={(e) => set("name", e.target.value)} placeholder="Marriage leave" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="How it builds">
            <Select id="lt-accrual" value={row.accrual} onChange={(e) => set("accrual", e.target.value)}>
              {ACCRUAL.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </Select>
          </Field>
          {numField("annual", "Days a year", "Ignored for by-grant and unpaid types")}
          {numField("carry_max", "Carry forward up to", "Days kept at the year end; the rest lapses. 0 = none")}
          {numField("max_run", "Most days in a row", "Leave blank for no limit")}
          {numField("notice_days", "Days of notice", "How far ahead it must be applied. 0 = none")}
          {numField("doc_after_days", "Certificate needed after", "Days; blank = never", "")}
          {numField("expires_days", "Expires after", "Days, for comp-off; blank = never")}
          {numField("sort", "Order", "Lower shows first")}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {check("half_day", "Half days allowed")}
          {check("paid", "Paid leave")}
          {check("active", "Active (can be applied for)")}
        </div>
      </div>
    </Modal>
  )
}
