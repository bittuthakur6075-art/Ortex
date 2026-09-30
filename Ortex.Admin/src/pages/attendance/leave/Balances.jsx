import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Minus, Plus } from "../../../components/ui/Icons"
import { Avatar, Banner, Button, Card, CardHeader, ExportButton, Field, Input, Modal, PageLoader, SearchInput, Segmented, Select, Textarea } from "../../../components/ui/Ui"
import { exportCsv } from "../../../lib/csv"
import { todayIST } from "../../../services/attendance"
import { adjustLeave, balancesFor } from "../../../services/leave"
import { LedgerDrawer } from "./MyLeave"
import { nameOf, num } from "./common"
import { TypeChip } from "./leaveUi"

// Leave → Balances (Employment Hero's Balances view): every person × every
// leave type with a balance, as available / taken this year / waiting. A cell
// opens its ledger. Whoever holds the leave-balances module (the Super Admin,
// and the Admins the Super Admin picks on the Modules page, 0059) adds,
// removes or sets a balance and undoes an adjustment from the ledger, always
// with a note that lands in the ledger. `ownId` is the viewer when they may not
// touch their own balance (everyone but the Super Admin).

export default function Balances({ ctx, canAdjust, ownId = null }) {
  const [state, setState] = useState({ loading: true })
  const [q, setQ] = useState("")
  const [adjusting, setAdjusting] = useState(null) // { userId, code }
  const [ledger, setLedger] = useState(null) // { userId, balance }

  const people = useMemo(
    () => Object.keys(ctx.directory || {}).sort((a, b) => nameOf(ctx, a).localeCompare(nameOf(ctx, b))),
    [ctx],
  )
  const types = useMemo(() => (ctx.types || []).filter((t) => t.accrual !== "none"), [ctx.types])

  const load = useCallback(async () => {
    const res = await balancesFor(people)
    setState({ loading: false, ...res })
  }, [people])

  useEffect(() => {
    void load()
  }, [load])

  const shown = people.filter((id) => !q.trim() || nameOf(ctx, id).toLowerCase().includes(q.trim().toLowerCase()))
  const bal = (id, code) => (state.byUser?.[id] || []).find((b) => b.code === code)

  const exportRows = () => {
    const cols = [
      { header: "Name", value: (id) => nameOf(ctx, id) },
      { header: "Role", value: (id) => ctx.directory?.[id]?.role || "" },
      ...types.flatMap((t) => [
        { header: `${t.code} available`, value: (id) => num(bal(id, t.code)?.available ?? 0) },
        { header: `${t.code} taken this year`, value: (id) => num(bal(id, t.code)?.taken_year ?? 0) },
        { header: `${t.code} waiting`, value: (id) => num(bal(id, t.code)?.pending ?? 0) },
      ]),
    ]
    exportCsv(`leave-balances-${todayIST()}.csv`, cols, shown)
  }

  if (state.loading) return <PageLoader />
  if (state.missing) return <Banner tone="warning">Leave is not set up on this database yet (migration 0036).</Banner>

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <Card className="overflow-hidden">
        <CardHeader title="Leave balances" description="Available · taken this year · waiting. Click a figure for its ledger." />
        <div className="flex flex-wrap items-center gap-[10px] px-5 pb-4">
          <p className="text-[13px] text-muted-foreground">
            {canAdjust
              ? "Use Adjust for opening balances and comp-off. Every change is kept in the ledger with your note."
              : "Managing balances is given by the Super Admin on the Modules page."}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-[10px]">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" />
            <ExportButton onClick={exportRows} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Person</th>
                {types.map((t) => (
                  <th key={t.code}>
                    <span className="inline-flex items-center gap-1.5">
                      <TypeChip code={t.code} /> {t.name}
                    </span>
                  </th>
                ))}
                {canAdjust && <th className="w-24" />}
              </tr>
            </thead>
            <tbody className="mt-body">
              {shown.length === 0 && (
                <tr>
                  <td colSpan={types.length + (canAdjust ? 2 : 1)} className="text-center text-muted-foreground">
                    {q.trim() ? "No one by that name." : "No people to show yet."}
                  </td>
                </tr>
              )}
              {shown.map((id) => {
                const person = ctx.directory?.[id] || {}
                return (
                  <tr key={id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={person.name || "?"} src={person.avatarUrl} className="h-7 w-7" />
                        <span className="font-medium text-foreground">{person.name || "Unknown"}</span>
                      </div>
                    </td>
                    {types.map((t) => {
                      const b = bal(id, t.code)
                      return (
                        <td key={t.code}>
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => b && setLedger({ userId: id, balance: b })}
                            disabled={!b}
                          >
                            <span className="font-semibold text-foreground tabular">{num(b?.available ?? 0)}</span>
                            <span className="text-[12px] text-muted-foreground tabular">
                              {" "}· {num(b?.taken_year ?? 0)} · {num(b?.pending ?? 0)}
                            </span>
                          </button>
                        </td>
                      )
                    })}
                    {canAdjust && (
                      <td className="text-right">
                        {id === ownId ? (
                          <span className="text-xs text-muted-foreground" title="Only the Super Admin changes your own balance">Your own</span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setAdjusting({ userId: id, code: types[0]?.code })}>
                            Adjust
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AdjustModal
        target={adjusting}
        ctx={ctx}
        types={types}
        availableOf={(code) => (adjusting ? bal(adjusting.userId, code)?.available ?? 0 : 0)}
        onClose={() => setAdjusting(null)}
        onDone={() => {
          setAdjusting(null)
          void load()
        }}
      />
      <LedgerDrawer
        balance={ledger?.balance || null}
        userId={ledger?.userId}
        personName={ledger ? nameOf(ctx, ledger.userId) : ""}
        canUndo={canAdjust && ledger?.userId !== ownId}
        onChanged={() => void load()}
        onClose={() => setLedger(null)}
      />
    </div>
  )
}

function AdjustModal({ target, ctx, types, availableOf, onClose, onDone }) {
  const [code, setCode] = useState("")
  // "change": add or remove days. "set": type the balance it should be, and
  // the difference goes into the ledger as one adjustment.
  const [mode, setMode] = useState("change")
  const [setTo, setSetTo] = useState("")
  const [changeBy, setDelta] = useState(1)
  const current = code ? availableOf(code) : 0
  const delta = mode === "set" ? Math.round(((Number(setTo) || 0) - current) * 2) / 2 : changeBy
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) {
      setCode(target.code || types[0]?.code || "")
      setDelta(1)
      setMode("change")
      setSetTo("")
      setNote("")
    }
  }, [target, types])

  const step = (by) => setDelta((d) => Math.max(-60, Math.min(60, Math.round((d + by) * 2) / 2)))

  const save = async () => {
    setBusy(true)
    try {
      await adjustLeave(target.userId, code, delta, note.trim())
      toast.success(`${delta > 0 ? "Added" : "Removed"} ${num(Math.abs(delta))} ${code} for ${nameOf(ctx, target.userId)}`)
      onDone()
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(false)
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      width="max-w-md"
      title={target ? `Adjust ${nameOf(ctx, target.userId)}'s leave` : ""}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy || !code || delta === 0 || note.trim().length < 3 || (mode === "set" && !String(setTo).trim())}>
            {delta >= 0 ? `Add ${num(Math.abs(delta))}` : `Remove ${num(Math.abs(delta))}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Segmented
          items={[
            { value: "change", label: "Add or remove" },
            { value: "set", label: "Set balance" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Field label="Leave type" required>
          <Select id="adjust-type" value={code} onChange={(e) => setCode(e.target.value)}>
            {types.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </Select>
        </Field>
        {mode === "set" ? (
          <Field label="New balance" required hint={`Available now: ${num(current)}. The difference, ${delta > 0 ? "+" : ""}${num(delta)}, is written to the ledger.`}>
            <Input
              id="adjust-set-to"
              inputMode="decimal"
              className="w-24 text-center tabular"
              value={setTo}
              onChange={(e) => setSetTo(e.target.value)}
              placeholder={num(current)}
            />
          </Field>
        ) : (
        <Field label="Days" required hint="In half days. Use minus to take days off the balance.">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon aria-label="Half a day less" onClick={() => step(-0.5)}>
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              id="adjust-days"
              inputMode="decimal"
              className="w-24 text-center tabular"
              value={changeBy}
              onChange={(e) => setDelta(Number(e.target.value) || 0)}
            />
            <Button size="sm" variant="outline" icon aria-label="Half a day more" onClick={() => step(0.5)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        )}
        <Field label="Note" required hint="Kept in the ledger. For example: Opening balance · Comp-off for working 2 Oct">
          <Textarea id="adjust-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opening balance" />
        </Field>
      </div>
    </Modal>
  )
}
