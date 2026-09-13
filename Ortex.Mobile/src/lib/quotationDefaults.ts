import AsyncStorage from "@react-native-async-storage/async-storage"
import React from "react"

import { supabase } from "@/data/supabase"
import { NO_DEFAULTS, hasDefaults, type QuotationDefaults } from "@/domain/quotationDefaults"
import { useAuth } from "@/store/AuthContext"

/**
 * The signed-in rep's quotation defaults (domain/quotationDefaults.ts).
 *
 * SOURCE OF TRUTH: `profiles.quotation_defaults` (migration 0027), so they
 * follow the person to any phone. They arrive with the profile the app already
 * loads and caches per user (store/AuthContext), so reading them costs no extra
 * request and still works offline from the cached profile.
 *
 * A handset copy is still kept, keyed by user id, for two jobs:
 *   · a project that has not had 0027 pushed yet has no column. The profile row
 *     then has no `quotation_defaults` key at all, and the defaults live on the
 *     phone exactly as they did before, instead of failing to save;
 *   · MOVING UP. Defaults saved on a phone before 0027 are uploaded to the
 *     account the first time this runs against a profile whose column is still
 *     empty, then the account is the source from there on.
 *
 * Writes are never queued offline (the app's rule): a save that cannot reach
 * the server says so, and nothing is half-saved.
 */

const keyFor = (userId: string) => `ortex.quotationDefaults.${userId}`

function parse(raw: unknown): QuotationDefaults {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : null)
  return { paymentTerms: pick("paymentTerms"), terms: pick("terms"), notes: pick("notes") }
}

async function readLocal(userId: string): Promise<QuotationDefaults> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId))
    return raw ? parse(JSON.parse(raw)) : NO_DEFAULTS
  } catch {
    return NO_DEFAULTS
  }
}

const writeLocal = (userId: string, value: QuotationDefaults) =>
  AsyncStorage.setItem(keyFor(userId), JSON.stringify(value)).catch(() => {})

/** The column does not exist on this project yet (0027 not pushed). */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42703" || error.code === "PGRST204" || /quotation_defaults/i.test(error.message || "")
}

async function writeServer(userId: string, value: QuotationDefaults) {
  return supabase.from("profiles").update({ quotation_defaults: value }).eq("id", userId)
}

export type SaveResult = "account" | "phone"

export function useQuotationDefaults(): {
  defaults: QuotationDefaults
  loaded: boolean
  /** Where the defaults live: on the account (synced) or only on this phone. */
  syncedToAccount: boolean
  save: (value: QuotationDefaults) => Promise<SaveResult>
} {
  const { session, profile, refreshProfile } = useAuth()
  const userId = session?.user?.id ?? ""
  // `quotation_defaults` present on the row = 0027 is live on this project.
  const columnLive = !!profile && Object.prototype.hasOwnProperty.call(profile, "quotation_defaults")
  const server = React.useMemo(() => parse(profile?.quotation_defaults), [profile?.quotation_defaults])

  const [local, setLocal] = React.useState<{ userId: string; value: QuotationDefaults } | null>(null)
  const moved = React.useRef(false)

  React.useEffect(() => {
    if (!userId) return
    let alive = true
    void readLocal(userId).then((value) => {
      if (alive) setLocal({ userId, value })
    })
    return () => {
      alive = false
    }
  }, [userId])

  // Move a phone-only copy up to the account, once, when the account has none.
  React.useEffect(() => {
    if (moved.current || !userId || !columnLive || !local || local.userId !== userId) return
    if (hasDefaults(server) || !hasDefaults(local.value)) return
    moved.current = true
    void writeServer(userId, local.value).then(({ error }) => {
      if (!error) void refreshProfile()
    })
  }, [userId, columnLive, local, server, refreshProfile])

  const localValue = local && local.userId === userId ? local.value : null
  const defaults = columnLive
    ? hasDefaults(server) || !localValue
      ? server
      : localValue
    : (localValue ?? NO_DEFAULTS)
  const loaded = !userId || (!!profile && (columnLive || !!localValue))

  const save = React.useCallback(
    async (value: QuotationDefaults): Promise<SaveResult> => {
      if (!userId) return "phone"
      const { error } = await writeServer(userId, value)
      if (error && !isMissingColumn(error)) throw error
      await writeLocal(userId, value)
      setLocal({ userId, value })
      if (error) return "phone"
      await refreshProfile()
      return "account"
    },
    [userId, refreshProfile],
  )

  return { defaults, loaded, syncedToAccount: columnLive, save }
}
