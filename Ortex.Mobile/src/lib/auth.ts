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

// FORGOT PASSWORD, by emailed code.
//
// The whole reset runs on ONE ephemeral client that lives only in memory: the
// code is verified there, the password is changed there, and that client is then
// signed out. The app's own client never holds the recovery session, so
// RootNavigator cannot flip to the tabs halfway through, before a new password
// exists. Only once the password is set does the app sign in, with that new
// password and no second code: the person proved they own the inbox a minute ago.

/** Held by the reset screen between "code verified" and "password set". */
export type PasswordReset = { client: ReturnType<typeof createEphemeralClient>; email: string }

/**
 * Reset step 1. Mail a code. An address with no account gets the same answer as
 * one that has, so this screen cannot be used to find out who works at Ortex.
 */
export async function sendResetCode(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  })
  if (error && /signups? not allowed|user not found/i.test(error.message)) return { ok: true }
  return error ? { error: errorMessage(error, "Could not send the code") } : { ok: true }
}

/** Reset step 2. Exchange the code for a recovery session on a throwaway client. */
export async function verifyResetCode(
  email: string,
  token: string,
): Promise<PasswordReset | { error: string }> {
  const client = createEphemeralClient()
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  })
  if (error || !data.session) return { error: errorMessage(error, "That code did not work") }
  return { client, email: email.trim() }
}

/** Reset step 3. Set the new password, drop the recovery session, sign the app in. */
export async function finishPasswordReset(
  reset: PasswordReset,
  next: string,
): Promise<{ ok: true } | { error: string; passwordChanged: boolean }> {
  const { error } = await reset.client.auth.updateUser({ password: next })
  if (error) return { error: errorMessage(error, "Could not set the new password"), passwordChanged: false }
  await reset.client.auth.signOut({ scope: "local" }).catch(() => {})
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: reset.email,
    password: next,
  })
  // The password IS changed at this point; only the automatic sign-in failed
  // (usually the connection), so the screen sends them to the normal login.
  return signInError
    ? { error: "Password changed. Sign in with your new password.", passwordChanged: true }
    : { ok: true }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut().catch(() => {})
}

export async function changePassword(next: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: next })
  return error ? { error: errorMessage(error, "Could not change the password") } : { ok: true }
}
