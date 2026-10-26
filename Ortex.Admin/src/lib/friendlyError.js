// One wording for a failed save or load, so staff never see Postgres or
// PostgREST internals ("new row violates row-level security policy for table
// …", "Cannot coerce the result to a single JSON object"). Messages written
// for people pass through untouched: the database's own RAISE messages (Owner
// rules, attendance, money rules, "already used, try again") and the errors the
// console throws itself. Only technical wording is replaced. The phone's
// counterpart is errorMessage() in Ortex.Mobile/src/data/supabase.ts.

const SIGNED_OUT = "Your session has ended. Sign in again, then retry."
const NO_ACCESS = "You do not have permission to do that. Ask an admin if you need it."
const OFFLINE = "No connection. Check the internet and try again."
const TIMED_OUT = "The server took too long to answer. Check the internet and try again."
const NOT_FOUND = "That record is no longer available, or you do not have access to it. Refresh the page."
const DUPLICATE = "That already exists. Check for a duplicate and try again."
const NOT_ALLOWED = "One of the values is not allowed. Check the form and try again."
const MISSING = "A required detail is missing. Fill it in and try again."
const BAD_FORMAT = "Something in the form is not in the right format. Check it and try again."
const OUTDATED = "This part of the console needs a database update. Tell the Super Admin."
const SERVER = "The server could not finish that. Try again in a moment."

// Ordered: the first match wins. Each test reads the code and the message.
const RULES = [
  [(c, m) => c === "PGRST301" || c === "PGRST303" || /jwt expired|invalid jwt|refresh token|not authenticated|auth session missing/i.test(m), SIGNED_OUT],
  [(c, m) => /row-level security|permission denied for (table|relation|schema|function|sequence)/i.test(m), NO_ACCESS],
  [(c, m) => c === "PGRST116" || /cannot coerce the result to a single json object|json object requested, multiple \(or no\) rows/i.test(m), NOT_FOUND],
  [(c, m) => /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i.test(m), OFFLINE],
  [(c, m, n) => n === "TimeoutError" || n === "AbortError" || /timed? ?out|signal is aborted|the operation was aborted/i.test(m), TIMED_OUT],
  [(c, m) => (c === "23505" && /duplicate key value/i.test(m)) || /duplicate key value violates unique constraint/i.test(m), DUPLICATE],
  [(c, m) => /violates check constraint|violates foreign key constraint/i.test(m), NOT_ALLOWED],
  [(c, m) => c === "23502" || /null value in column .* violates not-null constraint/i.test(m), MISSING],
  [(c, m) => c === "22P02" || c === "22007" || c === "22008" || /invalid input syntax for type/i.test(m), BAD_FORMAT],
  [(c, m) => c === "42P01" || c === "42883" || c === "42703" || c === "PGRST202" || c === "PGRST204" || /could not find the function|(relation|function|column|table) "?[\w.]+"? does not exist|schema cache/i.test(m), OUTDATED],
  [(c, m) => /edge function returned a non-2xx|failed to send a request to the edge function|internal server error|bad gateway|service unavailable/i.test(m), SERVER],
]

/**
 * A sentence a person can act on for any thrown value. `fallback` is used when
 * the error carries no message at all.
 */
export function friendlyError(error, fallback = "Something went wrong. Try again.") {
  if (!error) return fallback
  if (typeof error === "string") return error.trim() || fallback
  const message = String(error.message || error.error_description || error.msg || "").trim()
  const code = String(error.code || "")
  const name = String(error.name || "")
  if (!message && !code) return fallback
  for (const [test, text] of RULES) if (test(code, message, name)) return text
  return message || fallback
}
