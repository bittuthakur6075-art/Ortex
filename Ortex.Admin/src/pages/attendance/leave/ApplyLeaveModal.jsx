import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Upload, X } from "../../../components/ui/Icons"
import { Banner, Button, Field, Input, Modal, Select, Textarea } from "../../../components/ui/Ui"
import { currentUserId } from "../../../lib/auth"
import { balanceAfter, daysWords, leaveDaysBetween } from "../../../lib/attendance"
import { todayIST } from "../../../services/attendance"
import { applyLeave, uploadLeaveDocument } from "../../../services/leave"
import { dayRules, num } from "./common"

// Apply for leave (Remote's "Requesting a time off" flow, as one dialog): the
// type with what is left of it, the dates, half days, a live day count and the
// balance after this request, a reason, and a certificate where the policy
// asks for one. The count here is a preview; the server counts again and its
// count is the one saved. Server refusals are shown word for word.

export default function ApplyLeaveModal({ open, onClose, ctx, balances, onApplied }) {
  const types = ctx.types || []
  const [type, setType] = useState("")
  const [from, setFrom] = useState(todayIST())
  const [to, setTo] = useState(todayIST())
  const [startsAfterLunch, setStartsAfterLunch] = useState(false)
  const [endsAtLunch, setEndsAtLunch] = useState(false)
  const [reason, setReason] = useState("")
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const code = type || types[0]?.code || ""
  const t = types.find((x) => x.code === code)
  const bal = balances.find((b) => b.code === code)
  const halfAllowed = t ? t.half_day !== false : true
  const single = from === to
  const fromHalf = halfAllowed && startsAfterLunch ? "second" : "full"
  const toHalf = halfAllowed && endsAtLunch && !(single && startsAfterLunch) ? "first" : "full"

  const days = useMemo(
    () => (from && to ? leaveDaysBetween(from, to, fromHalf, toHalf, dayRules(ctx)) : 0),
    [from, to, fromHalf, toHalf, ctx],
  )
  const after = bal ? balanceAfter(bal, days) : null
  const needsDoc = t?.doc_after_days != null && days > t.doc_after_days

  const reset = () => {
    setType("")
    setFrom(todayIST())
    setTo(todayIST())
    setStartsAfterLunch(false)
    setEndsAtLunch(false)
    setReason("")
    setFile(null)
    setError("")
  }

  const submit = async () => {
    setError("")
    if (!code) return setError("Choose a leave type")
    if (!from || !to) return setError("Choose the first and last day")
    if (to < from) return setError("The last day is before the first day")
    if (reason.trim().length < 3) return setError("Give a short reason")
    setBusy(true)
    try {
      let attachment = null
      if (file) attachment = await uploadLeaveDocument(currentUserId(), file)
      const res = await applyLeave({ type: code, from, to, fromHalf, toHalf, reason: reason.trim(), attachment })
      toast.success(`Leave requested: ${daysWords(Number(res?.days ?? days))}. An admin will review it.`)
      reset()
      onApplied?.()
    } catch (e) {
      setError(e.message || "Could not apply")
    }
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      width="max-w-xl"
      title="Apply for leave"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-[13px] text-muted-foreground">
            {days > 0 ? (
              <>
                <span className="font-semibold text-foreground">{daysWords(days)}</span>
                {after != null && <> · {num(after)} left after this</>}
              </>
            ) : (
              "No working days in that range"
            )}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={busy || days <= 0}>{busy ? "Sending…" : "Send request"}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="What kind of leave is this?" required>
          <Select id="leave-type" value={code} onChange={(e) => setType(e.target.value)}>
            {types.map((x) => {
              const b = balances.find((y) => y.code === x.code)
              const left = x.accrual === "none" ? "unpaid" : `${num(b?.available ?? 0)} available`
              return (
                <option key={x.code} value={x.code}>
                  {x.name} ({left})
                </option>
              )
            })}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First day" required>
            <Input
              id="leave-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                if (!to || e.target.value > to) setTo(e.target.value)
              }}
            />
          </Field>
          <Field label="Last day" required>
            <Input id="leave-to" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {halfAllowed && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground">
            <label className="flex items-center gap-2">
              <input
                id="leave-from-half"
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={startsAfterLunch}
                onChange={(e) => setStartsAfterLunch(e.target.checked)}
              />
              {single ? "Afternoon only" : "First day starts after lunch"}
            </label>
            <label className="flex items-center gap-2">
              <input
                id="leave-to-half"
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={endsAtLunch && !(single && startsAfterLunch)}
                disabled={single && startsAfterLunch}
                onChange={(e) => setEndsAtLunch(e.target.checked)}
              />
              {single ? "Morning only" : "Last day ends at lunch"}
            </label>
          </div>
        )}
        {t && (t.notice_days > 0 || t.max_run || t.doc_after_days != null) && (
          <p className="text-[12px] text-muted-foreground">
            {[
              t.notice_days > 0 && `Apply ${t.notice_days} days ahead`,
              t.max_run && `at most ${t.max_run} days in a row`,
              t.doc_after_days != null && `a certificate for more than ${t.doc_after_days} days`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <Field label="Reason" required hint="Your admin sees this.">
          <Textarea id="leave-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: family function in Jaipur" />
        </Field>
        <Field label={needsDoc ? "Certificate (needed)" : "Certificate or document (optional)"} hint="JPEG, PNG or PDF, up to 5 MB.">
          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="truncate text-foreground">{file.name}</span>
              <Button size="sm" variant="ghost" icon aria-label="Remove file" onClick={() => setFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-subtle">
              <Upload className="h-4 w-4" /> Choose a file
              <input
                id="leave-file"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 5 * 1024 * 1024) return toast.error("That file is larger than 5 MB")
                  setFile(f)
                }}
              />
            </label>
          )}
        </Field>
      </div>
    </Modal>
  )
}
