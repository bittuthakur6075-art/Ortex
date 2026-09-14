// Storage for a person's quotation defaults (lib/quotationDefaults.js has the
// rules). Port of Ortex.Mobile/src/lib/quotationDefaults.ts.
//
// SOURCE OF TRUTH: `profiles.quotation_defaults` (migration 0027), read from the
// profile row useProfile() already loads. A project WITHOUT 0027 returns a row
// with no such key at all; the defaults then live in this browser's
// localStorage, keyed per user, and `syncedToAccount` is false so the UI can say
// so. Once the column exists, a browser-only copy is uploaded once if the
// account's own is still empty.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { hasSupabase } from "../data/store/supabaseClient"
import { refreshProfile } from "./useProfile"
import { updateMyProfile } from "../services/users"
import { currentUserId } from "../lib/auth"
import { NO_DEFAULTS, columnIsLive, hasDefaults, isMissingColumnError, parseDefaults } from "../lib/quotationDefaults"

// ---- Storage -----------------------------------------------------------------

const keyFor = (userId) => `ortex.quotationDefaults.${userId || "local"}`

function readLocal(userId) {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    return raw ? parseDefaults(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeLocal(userId, value) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(value))
  } catch {
    /* private window or storage full: the account copy is the real one anyway */
  }
}

/**
 * The signed-in person's quotation defaults. Pass the profile the caller already
 * holds from useProfile(), so this costs no extra request.
 *
 * `syncedToAccount` is false when the defaults can only live in this browser.
 * `save(value)` resolves "account" or "browser" and throws on a real failure.
 */
export default function useQuotationDefaults(profile) {
  const userId = hasSupabase ? currentUserId() : "local"
  const live = hasSupabase && columnIsLive(profile)
  const server = useMemo(() => parseDefaults(profile?.quotation_defaults), [profile?.quotation_defaults])
  const [local, setLocal] = useState(() => ({ userId, value: readLocal(userId) }))
  const moved = useRef(false)

  useEffect(() => {
    if (local.userId !== userId) setLocal({ userId, value: readLocal(userId) })
  }, [userId, local.userId])

  const localValue = local.userId === userId ? local.value : null

  // Move a browser-only copy up to the account, once, when the account has none.
  useEffect(() => {
    if (moved.current || !live || !userId || !localValue) return
    if (hasDefaults(server) || !hasDefaults(localValue)) return
    moved.current = true
    updateMyProfile(userId, { quotation_defaults: localValue }).then((res) => {
      if (!res.error) refreshProfile()
    })
  }, [live, userId, localValue, server])

  const defaults = live ? (hasDefaults(server) || !localValue ? server : localValue) : localValue || NO_DEFAULTS
  const loaded = !!profile

  const save = useCallback(
    async (value) => {
      const clean = parseDefaults(value)
      if (hasSupabase && userId && userId !== "local") {
        const res = await updateMyProfile(userId, { quotation_defaults: clean })
        if (res.error && !isMissingColumnError(res.error)) throw new Error(res.error)
        writeLocal(userId, clean)
        setLocal({ userId, value: clean })
        if (res.error) return "browser"
        refreshProfile()
        return "account"
      }
      writeLocal(userId, clean)
      setLocal({ userId, value: clean })
      return "browser"
    },
    [userId],
  )

  return { defaults, loaded, syncedToAccount: live, save }
}
