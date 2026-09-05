import { createEphemeralClient, errorMessage, supabase } from "@/data/supabase"

// Two-step sign-in: password, then a code emailed to the same address.
//
// PORT OF Ortex.Admin/src/lib/auth.js. The console's own note applies here
// unchanged: this is a UI-level second step, not a cryptographic second factor.
// Supabase issues a session the moment the password is accepted, so someone
// holding a valid password could obtain a token from their own client without
// ever seeing the emailed code. What it does buy: the password check happens on
// a throwaway client, so THIS APP never holds a session until the code is
// verified, and a stolen password alone will not sign anyone in through it.
//
// There is deliberately no signUp(). Accounts are created by an admin through
// the console's `admin-create-user` Edge Function; public signup against a
// public anon key would let anyone mint their own account.

export type AuthResult = { ok: true } | { error: string }

/** Step 1. Check the password without letting the session reach the app. */
export async function verifyPassword(email: string, password: string): Promise<AuthResult> {
  const client = createEphemeralClient()
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
  // Drop the token immediately; nothing downstream should ever see it.
  await client.auth.signOut({ scope: "local" }).catch(() => {})
  return error ? { error: errorMessage(error, "Could not sign in") } : { ok: true }
}

/**
 * Step 2. Mail a one-time code. shouldCreateUser:false keeps the app
 * invite-only — without it, any typed address would be created and emailed a
 * working code against the public anon key.
 */
export async function sendEmailOtp(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  })
  return error ? { error: errorMessage(error, "Could not send the code") } : { ok: true }
}

/**
 * Step 3. Exchange the code for the real session. This is what actually signs
 * the user in: onAuthStateChange fires and AuthContext flips the app over.
 */
export async function verifyEmailOtp(email: string, token: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  })
  return error ? { error: errorMessage(error, "That code did not work") } : { ok: true }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut().catch(() => {})
}

export async function changePassword(next: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: next })
  return error ? { error: errorMessage(error, "Could not change the password") } : { ok: true }
}
