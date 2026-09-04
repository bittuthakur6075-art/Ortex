// Shared HTTP helpers for every Edge Function in this folder.
//
// `cors` is returned on every response (including errors and the OPTIONS
// preflight) so browser callers from the Admin console and marketing site are
// never blocked. `json` wraps a body with those headers in one call.
//
// Deno resolves the relative import at deploy time, so functions stay
// individually deployable: `supabase functions deploy <name>`.

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
