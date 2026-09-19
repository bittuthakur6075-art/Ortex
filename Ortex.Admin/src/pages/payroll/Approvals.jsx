import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ReceiptIndianRupee } from "../../components/ui/Icons"
import { Avatar, Badge, Banner, Button, Card, CardHeader, Chip, ChipGroup, Drawer, EmptyState, Field, PageLoader, PropertyRow, Spinner, Textarea } from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { loadDirectory } from "../../hooks/useRecordHistory"
import { decideClaim, listClaims, receiptUrl } from "../../services/payroll"
import { formatDateTime } from "../../lib/format"
import { LoadError } from "./setup/common"
import { dayWords, money } from "./run/shared"

// Payroll → Approvals: reimbursement claims people submit from the phone with
// a receipt. Payroll approves or rejects each (a rejection says why); an
// approved claim is paid with the next pay run, outside wages and tax. Nobody
// decides their own claim: the database refuses it (claim_decide), and this
// page does not offer it.

const FILTERS = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
]

const TONE = { pending: "amber", approved: "blue", paid: "emerald", rejected: "rose", cancelled: "slate" }
const LABEL = { pending: "Waiting", approved: "Approved", paid: "Paid", rejected: "Rejected", cancelled: "Withdrawn" }

export default function Approvals() {
  const profile = useProfile()
  const [state, setState] = useState({ loading: true, claims: [], directory: {} })
  const [filter, setFilter] = useState("pending")
  const [selected, setSelected] = useState(new Set())
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [claims, directory] = await Promise.all([listClaims(), loadDirectory()])
      setState({ loading: false, claims, directory: directory || {} })
    } catch (error) {
      setState({ loading: false, claims: [], directory: {}, error })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, state.claims.filter((c) => c.status === f.value).length])), [state.claims])
  const rows = useMemo(() => state.claims.filter((c) => c.status === filter), [state.claims, filter])
  const mine = (c) => c.user_id === profile?.id
  const selectable = rows.filter((c) => c.status === "pending" && !mine(c))
  const nameOf = (uid) => state.directory[uid]?.name || "Unknown"

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const bulkApprove = async () => {
    const ids = selectable.filter((c) => selected.has(c.id)).map((c) => c.id)
    if (!ids.length) return
    setBusy(true)
    const failed = []
    for (const id of ids) {
      try {
        await decideClaim(id, true, null)
      } catch (e) {
        failed.push(e.message)
      }
    }
    setBusy(false)
    setSelected(new Set())
    if (failed.length) toast.error(`${failed.length} not approved: ${failed[0]}`)
    if (ids.length - failed.length) toast.success(`${ids.length - failed.length} claims approved. They are paid in the next pay run.`)
    await load()
  }

  if (state.loading) return <PageLoader />

  const total = rows.reduce((s, c) => s + Number(c.amount), 0)

  return (
    <div className="space-y-5">
      <LoadError error={state.error} />
      <Banner tone="info">Approved claims are paid with the next pay run, on top of salary and outside income tax. The payslip lists each one.</Banner>

      <div className="flex flex-wrap items-center gap-[10px]">
        <ChipGroup>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              active={filter === f.value}
              onClick={() => {
                setFilter(f.value)
                setSelected(new Set())
              }}
            >
              {f.label} <span className="tabular text-muted-foreground">{counts[f.value]}</span>
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Reimbursement claims"
          description={rows.length ? `${rows.length} ${rows.length === 1 ? "claim" : "claims"}, ${money(total)}` : undefined}
          action={
            filter === "pending" && selectable.length > 0 ? (
              <Button onClick={bulkApprove} disabled={busy || !selectable.some((c) => selected.has(c.id))}>
                {busy ? "Approving…" : `Approve selected${selected.size ? ` (${selectable.filter((c) => selected.has(c.id)).length})` : ""}`}
              </Button>
            ) : null
          }
        />
        {rows.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={ReceiptIndianRupee}
              title={filter === "pending" ? "Nothing waiting" : `No ${LABEL[filter].toLowerCase()} claims`}
              description="Claims are submitted from the Ortex phone app with a photo of the bill."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  {filter === "pending" && (
                    <th className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        className="h-4 w-4 accent-primary"
                        checked={selectable.length > 0 && selectable.every((c) => selected.has(c.id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((c) => c.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>Person</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th>Bill date</th>
                  <th>Receipt</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => setOpen(c)}>
                    {filter === "pending" && (
                      <td onClick={(e) => e.stopPropagation()}>
                        {mine(c) ? null : (
                          <input
                            type="checkbox"
                            aria-label={`Select claim from ${nameOf(c.user_id)}`}
                            className="h-4 w-4 accent-primary"
                            checked={selected.has(c.id)}
                            onChange={() => toggle(c.id)}
                          />
                        )}
                      </td>
                    )}
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={nameOf(c.user_id)} src={state.directory[c.user_id]?.avatarUrl} className="h-7 w-7" />
                        <span className="font-medium text-foreground">{nameOf(c.user_id)}</span>
                        {mine(c) && <Badge tone="outline">You</Badge>}
                      </div>
                    </td>
                    <td>{c.category}</td>
                    <td className="text-right font-medium text-foreground tabular">{money(c.amount)}</td>
                    <td className="tabular">{dayWords(c.bill_date)}</td>
                    <td>{c.receipt_path ? "Attached" : <span className="text-muted-foreground">None</span>}</td>
                    <td className="text-muted-foreground">{dayWords(String(c.created_at).slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && (
        <ClaimDrawer
          claim={open}
          own={mine(open)}
          nameOf={nameOf}
          onClose={() => setOpen(null)}
          onDecided={async () => {
            setOpen(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function ClaimDrawer({ claim, own, nameOf, onClose, onDecided }) {
  const [url, setUrl] = useState(null)
  const [loadingReceipt, setLoadingReceipt] = useState(Boolean(claim.receipt_path))
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(null)
  const isPdf = /\.pdf$/i.test(claim.receipt_path || "")

  useEffect(() => {
    let live = true
    if (claim.receipt_path) {
      receiptUrl(claim.receipt_path)
        .then((u) => live && setUrl(u))
        .finally(() => live && setLoadingReceipt(false))
    }
    return () => {
      live = false
    }
  }, [claim.receipt_path])

  const decide = async (approve) => {
    if (!approve && !note.trim()) return toast.error("Say why the claim is rejected. The person sees this note.")
    setBusy(approve ? "approve" : "reject")
    try {
      await decideClaim(claim.id, approve, note.trim() || null)
      toast.success(approve ? "Claim approved. It is paid in the next pay run." : "Claim rejected")
      await onDecided()
    } catch (e) {
      toast.error(e.message)
      setBusy(null)
    }
  }

  const pending = claim.status === "pending"
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-xl"
      title={`${claim.category} · ${money(claim.amount)}`}
      subtitle={nameOf(claim.user_id)}
      footer={
        pending && !own ? (
          <div className="flex justify-end gap-2.5">
            <Button variant="dangerGhost" onClick={() => decide(false)} disabled={Boolean(busy)}>
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </Button>
            <Button onClick={() => decide(true)} disabled={Boolean(busy)}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-5">
        <div>
          <PropertyRow label="Status">
            <Badge tone={TONE[claim.status] || "slate"}>{LABEL[claim.status] || claim.status}</Badge>
          </PropertyRow>
          <PropertyRow label="Bill date">{dayWords(claim.bill_date)}</PropertyRow>
          <PropertyRow label="Submitted">{formatDateTime(claim.created_at)}</PropertyRow>
          <PropertyRow label="Description">{claim.description || null}</PropertyRow>
          {claim.decided_at && (
            <PropertyRow label="Decided">
              {formatDateTime(claim.decided_at)} by {nameOf(claim.decided_by)}
            </PropertyRow>
          )}
          {claim.decision_note && <PropertyRow label="Note">{claim.decision_note}</PropertyRow>}
        </div>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">Receipt</h3>
          {!claim.receipt_path ? (
            <p className="text-[13px] text-muted-foreground">No receipt was attached.</p>
          ) : loadingReceipt ? (
            <Spinner />
          ) : !url ? (
            <p className="text-[13px] text-muted-foreground">The receipt could not be opened.</p>
          ) : isPdf ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline">
              Open the PDF receipt
            </a>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" title="Open full size">
              <img src={url} alt={`Receipt for ${claim.category}`} className="max-h-[480px] w-full rounded-lg border border-border object-contain" />
            </a>
          )}
        </section>

        {pending &&
          (own ? (
            <Banner tone="info">This is your own claim. Someone else decides your claim.</Banner>
          ) : (
            <Field label="Note to the person" hint="Required to reject; optional to approve">
              <Textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          ))}
      </div>
    </Drawer>
  )
}
