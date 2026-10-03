import { errorMessage, hasSupabase, supabase } from "@/data/supabase"
import { loanProgress, sortSlips, type Loan, type Payslip, type SalaryRevision } from "@/features/pay/payFormat"

/**
 * My pay, the data half (migration 0040). Everything here is the signed-in
 * person's OWN rows, and RLS is what makes it so: a payslip is readable by its
 * employee only once its run is paid (`released_at` set), and salary
 * revisions, loans (advances) and recoveries are readable by their owner. Payroll
 * staff would see everyone's through the same selects, so every read filters
 * on the caller's own id as well.
 */

export const PAY_NOT_SET_UP = "Payroll is not set up on the server yet."

/** A table or function that does not exist yet (0040 not applied) is a set-up gap, not an error to decode. */
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
// Throws when the read fails, so Home's Pay card can say "Couldn't load"
// rather than "no payslip yet"; null means there really is none.
export async function latestPayslip(): Promise<Payslip | null> {
  if (!hasSupabase) return null
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
  if (error) throw error
  return sortSlips(((data || []) as Payslip[]).map(toSlip))[0] ?? null
}

// ---- salary -----------------------------------------------------------------------------------------

/** My salary revisions, the newest effective first. */
export async function myRevisions(): Promise<SalaryRevision[]> {
  const uid = await myId()
  if (!uid) return []
  const { data, error } = await supabase
    .from("salary_revisions")
    .select("*")
    .eq("user_id", uid)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) throw fail(error, "Could not load your salary.")
  return ((data || []) as SalaryRevision[]).map((r) => ({
    ...r,
    annual_ctc: num(r.annual_ctc),
    monthly_gross: num(r.monthly_gross),
    employer_pf_in_ctc: num(r.employer_pf_in_ctc),
    daily_rate: r.daily_rate == null ? null : num(r.daily_rate),
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
