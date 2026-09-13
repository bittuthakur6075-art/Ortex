import { supabase } from "@/data/supabase"

/**
 * Calls a console edge function under the signed-in session and turns every way
 * it can fail into a sentence a person can act on.
 *
 * supabase-js turns any non-2xx into a generic FunctionsHttpError whose message
 * is "Edge Function returned a non-2xx status code"; the function's own sentence
 * ("You can't disable your own account") is in the response body, so it is read
 * from there. A function that was never deployed says which one to deploy.
 */
export type EdgeResult<T> = { data?: T; error?: string; notDeployed?: boolean }

export async function invokeEdge<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<EdgeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context
    try {
      const parsed = (await context?.json?.()) as { error?: string } | undefined
      if (parsed?.error) return { error: parsed.error }
    } catch {
      /* not JSON, fall through */
    }
    if (context?.status === 404 || /failed to send a request|failed to fetch/i.test(error.message)) {
      return {
        error: `The "${name}" function is not deployed on this Supabase project. Run: supabase functions deploy ${name}`,
        notDeployed: true,
      }
    }
    if (/network request failed/i.test(error.message)) {
      return { error: "No connection. Check your mobile data and try again." }
    }
    return { error: error.message }
  }
  const payload = (data || {}) as T & { error?: string }
  if (payload.error) return { error: payload.error }
  return { data: payload }
}
