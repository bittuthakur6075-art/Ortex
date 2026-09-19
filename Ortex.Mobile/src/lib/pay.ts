import * as ImageManipulator from "expo-image-manipulator"
import * as ImagePicker from "expo-image-picker"

import { errorMessage, hasSupabase, supabase } from "@/data/supabase"
import {
  loanProgress,
  sortSlips,
  type Claim,
  type Loan,
  type Payslip,
  type SalaryRevision,
} from "@/features/pay/payFormat"
import { decodeBase64 } from "@/lib/avatarUpload"
import { newPunchId } from "@/lib/attendance"

/**
 * My pay, the data half (migration 0040). Everything here is the signed-in
 * person's OWN rows, and RLS is what makes it so: a payslip is readable by its
 * employee only once its run is paid (`released_at` set), and salary
 * revisions, loans, recoveries and claims are readable by their owner. Payroll
 * staff would see everyone's through the same selects, so every read filters
 * on the caller's own id as well.
 */

const BUCKET = "claim-receipts"
const TTL_SECONDS = 3600

export const PAY_NOT_SET_UP = "Payroll is not set up on the server yet."

/** A table, function or bucket that does not exist yet (0040 not applied) is a set-up gap, not an error to decode. */
function fail(error: unknown, fallback: string): Error {
  const e = error as { code?: string; message?: string } | null
  const msg = e?.message || ""
  if (
    e?.code === "42P01" ||
    e?.code === "42883" ||
    e?.code === "PGRST202" ||
    e?.code === "PGRST205" ||
    /does not exist|could not find the (table|function)|schema cache|bucket not found/i.test(msg)
  ) {
    return new Error(PAY_NOT_SET_UP)
  }
  return new Error(errorMessage(error, fallback))
}

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** Numeric columns arrive as strings from PostgREST; make them numbers once, here. */
const num = (v: unknown) => (v == null ? 0 : Number(v))

// ---- payslips ---------------------------------------------------------------------------------------

const SLIP_COLUMNS = "id, run_id, status, data, gross, net_pay, released_at"

const toSlip = (r: Payslip): Payslip => ({ ...r, gross: num(r.gross), net_pay: num(r.net_pay), data: r.data || ({} as Payslip["data"]) })

/** My released payslips, newest month first. */
export async function myPayslips(): Promise<Payslip[]> {
  if (!hasSupabase) return []
  const uid = await myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from("payslips")
    .select(SLIP_COLUMNS)
    .eq("user_id", uid)
    .not("released_at", "is", null)
    .order("released_at", { ascending: false })
    .limit(240)
  if (error) throw fail(error, "Could not load your payslips.")
  return sortSlips(((data || []) as Payslip[]).map(toSlip))
}

/** One payslip, or null when it is not mine or not released yet. */
export async function payslip(id: string): Promise<Payslip | null> {
  const { data, error } = await supabase
    .from("payslips")
    .select(SLIP_COLUMNS)
    .eq("id", id)
    .not("released_at", "is", null)
    .maybeSingle()
  if (error) throw fail(error, "Could not load that payslip.")
  return data ? toSlip(data as Payslip) : null
}

/** The newest released payslip, for Home; null when there is none or payroll is not set up. */
export async function latestPayslip(): Promise<Payslip | null> {
  if (!hasSupabase) return null
  try {
    const uid = await myId()
    if (!uid) return null
    // The newest few by release, then the newest by month: an off-cycle run
    // released later can be for an earlier month.
    const { data, error } = await supabase
      .from("payslips")
      .select(SLIP_COLUMNS)
      .eq("user_id", uid)
      .not("released_at", "is", null)
      .order("released_at", { ascending: false })
      .limit(3)
    if (error) return null
    return sortSlips(((data || []) as Payslip[]).map(toSlip))[0] ?? null
  } catch {
    return null
  }
}

// ---- salary -----------------------------------------------------------------------------------------

/** My salary revisions, the newest effective first. */
export async function myRevisions(): Promise<SalaryRevision[]> {
  const uid = await myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from("salary_revisions")
    .select("id, effective_from, payout_month, annual_ctc, earnings, monthly_gross, employer_pf_in_ctc, reason, created_at")
    .eq("user_id", uid)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) throw fail(error, "Could not load your salary.")
  return ((data || []) as SalaryRevision[]).map((r) => ({
    ...r,
    annual_ctc: num(r.annual_ctc),
    monthly_gross: num(r.monthly_gross),
    employer_pf_in_ctc: num(r.employer_pf_in_ctc),
    earnings: (Array.isArray(r.earnings) ? r.earnings : []).map((e) => ({ ...e, amount: num(e.amount) })),
  }))
}

// ---- loans ------------------------------------------------------------------------------------------

/** My loans and advances with what has been recovered, open ones first. */
export async function myLoans(): Promise<Loan[]> {
  const uid = await myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from("loans")
    .select("id, name, amount, instalment, start_month, disbursed_on, status, note, loan_recoveries(amount)")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
  if (error) throw fail(error, "Could not load your loans.")
  type Row = Omit<Loan, "recovered" | "balance"> & { loan_recoveries?: { amount: number | string }[] }
  return ((data || []) as Row[])
    .map(({ loan_recoveries, ...l }) => {
      const amount = num(l.amount)
      const p = loanProgress(
        amount,
        (loan_recoveries || []).map((r) => ({ amount: num(r.amount) })),
      )
      return { ...l, amount, instalment: num(l.instalment), ...p }
    })
    .sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"))
}

// ---- reimbursement claims -----------------------------------------------------------------------

export async function myClaims(): Promise<Claim[]> {
  const uid = await myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from("reimbursement_claims")
    .select("id, category, amount, bill_date, description, receipt_path, status, decided_at, decision_note, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw fail(error, "Could not load your claims.")
  return ((data || []) as Claim[]).map((c) => ({ ...c, amount: num(c.amount) }))
}

export type Receipt = { uri: string; base64: string; width: number; height: number }

/** Photograph or choose the bill; resized to 1600px on the long edge. */
export async function pickReceipt(source: "camera" | "library"): Promise<Receipt | null> {
  const perm =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error(source === "camera" ? "Camera is off for Ortex." : "Photos are off for Ortex.")
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9 }
  const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
  if (res.canceled || !res.assets?.[0]) return null
  const a = res.assets[0]
  const w = a.width || 1600
  const h = a.height || 1600
  const resize = w >= h ? { width: Math.min(1600, w) } : { height: Math.min(1600, h) }
  const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize }], {
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  })
  if (!out.base64) throw new Error("The photo could not be prepared. Try again.")
  return { uri: out.uri, base64: out.base64, width: out.width, height: out.height }
}

/**
 * Upload into my own folder, <uid>/<yyyy>/<uuid>.jpg (the bucket's insert
 * policy and claim_submit both check the first segment). Bytes, never a Blob:
 * an RN Blob uploads 0 bytes without an error.
 */
async function uploadReceipt(r: Receipt): Promise<string> {
  if (!hasSupabase) throw new Error("Not connected")
  const uid = await myId()
  if (!uid) throw new Error("Your session has expired. Sign in again")
  const path = `${uid}/${new Date().getFullYear()}/${newPunchId()}.jpg`
  const bytes = decodeBase64(r.base64)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/jpeg", upsert: false })
  if (error) {
    if (/bucket not found/i.test(error.message || "")) throw new Error(PAY_NOT_SET_UP)
    throw new Error(errorMessage(error, "The receipt did not upload. Try again."))
  }
  // A listing that answers with size 0 is the silent empty upload; one that does
  // not answer at all proves nothing, so it is not treated as a failure.
  const folder = path.slice(0, path.lastIndexOf("/"))
  const file = path.slice(path.lastIndexOf("/") + 1)
  const { data: listed } = await supabase.storage.from(BUCKET).list(folder, { search: file, limit: 1 })
  const size = (listed?.[0]?.metadata as { size?: number } | null | undefined)?.size
  if (size === 0) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    throw new Error("The receipt uploaded empty. Try again.")
  }
  return path
}

export type ClaimArgs = {
  category: string
  amount: number
  billDate: string
  description: string
  receipt: Receipt | null
}

/** Send a claim (claim_submit): the receipt first, then the row. The server's refusal is the message shown. */
export async function submitClaim(c: ClaimArgs): Promise<string> {
  const path = c.receipt ? await uploadReceipt(c.receipt) : null
  const { data, error } = await supabase.rpc("claim_submit", {
    p_category: c.category,
    p_amount: c.amount,
    p_bill_date: c.billDate,
    p_description: c.description.trim() || null,
    p_receipt: path,
  })
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    throw fail(error, "Your claim was not sent. Try again.")
  }
  return String(data || "")
}

/** Withdraw a claim still waiting for a decision. */
export async function cancelClaim(id: string): Promise<void> {
  const { error } = await supabase.rpc("claim_cancel", { p_id: id })
  if (error) throw fail(error, "Could not cancel the claim.")
}

/** A 1-hour link to a receipt, or null when it is gone or refused. */
export async function receiptUrl(path?: string | null): Promise<string | null> {
  if (!hasSupabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS)
  if (error) return null
  return data?.signedUrl || null
}
