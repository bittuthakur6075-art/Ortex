import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Calendar, Plus, RefreshCw, Trash2 } from "../../components/ui/Icons"
import { Badge, Banner, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageLoader, Select } from "../../components/ui/Ui"
import {
  deleteHoliday,
  getSettings,
  listHolidays,
  purgeSelfies,
  recalculate,
  saveHoliday,
  toggleHoliday,
  todayIST,
} from "../../services/attendance"
import { dayLabel, daysOf } from "./format"

// The Super Admin's Holidays and Maintenance sections of Attendance → Settings
// (migration 0034). Holidays change what a day with no clock-in counts as (H,
// not A); Maintenance runs by hand what the nightly jobs run anyway.

const KIND_LABEL = { national: "National", festival: "Festival", optional: "Optional" }
const KIND_TONE = { national: "violet", festival: "blue", optional: "slate" }

export function Holidays() {
  const year = Number(todayIST().slice(0, 4))
  const [state, setState] = useState({ loading: true })
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setState({ loading: false, ...(await listHolidays({ from: `${year}-01-01`, to: `${year + 1}-12-31` })) })
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (fn, done) => {
    try {
      await fn()
      if (done) toast.success(done)
      void load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (state.loading) return <Card className="p-6"><PageLoader /></Card>
  if (state.missing) return <Banner tone="warning">Holidays are not set up on this database yet (migration 0034).</Banner>

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Holidays"
        description={`${year} and ${year + 1}. A holiday with no clock-in counts as H, not absent. Optional holidays are listed but not given to everyone.`}
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add holiday</Button>}
      />
      <div className="px-5 pb-4">
        <Banner tone="info">Republic Day, Independence Day and Gandhi Jayanti are filled in for you. Add Diwali, Holi and your other festival days.</Banner>
      </div>
      {state.error && <Banner tone="danger" className="mx-5 mb-4">{state.error}</Banner>}
      {state.rows.length === 0 ? (
        <EmptyState icon={Calendar} title="No holidays yet" description="Add the festival holidays for the year." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Date</th>
                <th>Holiday</th>
                <th>Kind</th>
                <th>Given</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="mt-body">
              {state.rows.map((h) => (
                <tr key={h.id}>
                  <td className="tabular text-foreground">{dayLabel(h.day, true)}</td>
                  <td className="font-medium text-foreground">{h.name}</td>
                  <td><Badge tone={KIND_TONE[h.kind] || "slate"}>{KIND_LABEL[h.kind] || h.kind}</Badge></td>
                  <td>
                    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <input
                        id={`holiday-active-${h.id}`}
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-primary"
                        checked={h.active}
                        onChange={(e) => act(() => toggleHoliday(h.id, e.target.checked))}
                      />
                      {h.active ? "Yes" : "No"}
                    </label>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon
                      aria-label={`Remove ${h.name}`}
                      onClick={() => {
                        if (window.confirm(`Remove ${h.name} on ${dayLabel(h.day)}?`)) act(() => deleteHoliday(h.id), "Holiday removed")
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <HolidayEditor
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false)
          void load()
        }}
      />
    </Card>
  )
}

function HolidayEditor({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ day: "", name: "", kind: "festival" })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const save = async () => {
    if (!form.day) return toast.error("Choose the date")
    if (!form.name.trim()) return toast.error("Name the holiday")
    setBusy(true)
    try {
      await saveHoliday(form)
      toast.success("Holiday added")
      setForm({ day: "", name: "", kind: "festival" })
      onSaved()
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(false)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-md"
      title="Add holiday"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Add holiday"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Date" required>
          <Input id="holiday-day" type="date" value={form.day} onChange={(e) => set("day", e.target.value)} />
        </Field>
        <Field label="Name" required>
          <Input id="holiday-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="For example: Diwali" />
        </Field>
        <Field label="Kind" hint="Optional holidays are listed, but a day with no clock-in on one still counts as absent.">
          <Select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="national">National</option>
            <option value="festival">Festival</option>
            <option value="optional">Optional</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

export function Maintenance() {
  const month = todayIST().slice(0, 7)
  const [retention, setRetention] = useState(90)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    getSettings().then((r) => {
      if (r.doc?.selfieRetentionDays) setRetention(r.doc.selfieRetentionDays)
    })
  }, [])

  const recalc = async () => {
    const days = daysOf(month)
    setBusy("recalc")
    try {
      const n = await recalculate(days[0], todayIST())
      toast.success(`Recalculated ${n} person-days for this month`)
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(null)
  }

  const purge = async () => {
    if (!window.confirm(`Delete every clock-in selfie older than ${retention} days? This cannot be undone.`)) return
    setBusy("purge")
    try {
      const { removed, failed } = await purgeSelfies()
      if (failed) toast.warning(`Deleted ${removed} selfies; ${failed} could not be deleted and will be tried again tonight`)
      else toast.success(removed ? `Deleted ${removed} selfies` : "No selfies were old enough to delete")
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(null)
  }

  return (
    <Card>
      <CardHeader title="Maintenance" description="Both of these also run automatically every night." />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border p-4">
          <h4 className="font-semibold text-foreground">Recalculate this month</h4>
          <p className="text-[13px] text-muted-foreground">
            Work out every day of this month again with the current rules. Use it after changing the shift, grace period or
            holidays. Locked months are never touched.
          </p>
          <Button size="sm" variant="outline" onClick={recalc} disabled={busy !== null}>
            <RefreshCw className="h-4 w-4" /> {busy === "recalc" ? "Recalculating…" : "Recalculate"}
          </Button>
        </div>
        <div className="space-y-2 rounded-xl border border-border p-4">
          <h4 className="font-semibold text-foreground">Delete old selfies now</h4>
          <p className="text-[13px] text-muted-foreground">
            Deletes clock-in selfies older than {retention} days (the retention in Rules). The attendance records stay; only the
            photos go.
          </p>
          <Button size="sm" variant="outline" onClick={purge} disabled={busy !== null}>
            <Trash2 className="h-4 w-4" /> {busy === "purge" ? "Deleting…" : `Delete selfies older than ${retention} days`}
          </Button>
        </div>
      </div>
    </Card>
  )
}
