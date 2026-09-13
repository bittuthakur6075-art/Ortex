import React from "react"

import { attentionItems, computeDashboard, type RangeKey } from "@/domain/dashboard"
import { canAccess } from "@/domain/modules"
import type { Enquiry, Quotation } from "@/domain/schema"
import { VOICE_SOURCE } from "@/domain/voice"
import { useCollection } from "@/hooks/useCollection"
import { useAuth } from "@/store/AuthContext"

import { useWebTraffic } from "@/features/home/useWebTraffic"

/**
 * Everything Home and Insights draw, from one place, so the two pages can never
 * disagree about a number.
 *
 * Access is applied HERE, before anything is counted: rows of a module the
 * profile lacks are dropped, so no figure on either page can leak a module the
 * tab bar hides. The website log is read only for admins (the console's
 * Insights is admin-only), and only when a page asks for it.
 */
export function useDashboard(range: RangeKey, { withWeb = false }: { withWeb?: boolean } = {}) {
  const { profile } = useAuth()
  const access = {
    quotes: canAccess(profile, "quotations"),
    enquiries: canAccess(profile, "enquiries"),
    voice: canAccess(profile, "voice-leads"),
    customers: canAccess(profile, "customers"),
    admin: profile?.role === "admin",
  }
  const leadsAccess = access.enquiries || access.voice

  const enquiries = useCollection<Enquiry>("enquiries")
  const quotations = useCollection<Quotation>("quotations")
  const web = useWebTraffic(range, access.admin && withWeb)

  const visibleEnquiries = React.useMemo(
    () =>
      leadsAccess
        ? enquiries.items.filter((e) => (e.source === VOICE_SOURCE ? access.voice : access.enquiries))
        : [],
    [enquiries.items, leadsAccess, access.voice, access.enquiries],
  )
  const visibleQuotes = React.useMemo(
    () => (access.quotes ? quotations.items : []),
    [quotations.items, access.quotes],
  )

  // "Now" moves whenever the data or the range does, so a page left open past
  // midnight rolls its buckets on the next realtime update or pull-to-refresh,
  // without recomputing every figure on every render.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    setNow(Date.now())
  }, [visibleEnquiries, visibleQuotes, range, web.rows])

  const d = React.useMemo(
    () => computeDashboard({ enquiries: visibleEnquiries, quotations: visibleQuotes, range, now }),
    [visibleEnquiries, visibleQuotes, range, now],
  )
  const attention = React.useMemo(
    () =>
      attentionItems(
        { enquiries: visibleEnquiries, quotations: visibleQuotes, now },
        { enquiries: access.enquiries, voice: access.voice, quotations: access.quotes },
      ),
    [visibleEnquiries, visibleQuotes, access.enquiries, access.voice, access.quotes, now],
  )

  const loading = (leadsAccess && enquiries.loading) || (access.quotes && quotations.loading)
  const cachedAt = Math.min(enquiries.cachedAt || Infinity, quotations.cachedAt || Infinity)

  const reload = async () => {
    await Promise.all([
      leadsAccess ? enquiries.reload() : null,
      access.quotes ? quotations.reload() : null,
      access.admin && withWeb ? web.reload() : null,
    ])
  }

  return {
    d,
    attention,
    now,
    web,
    access: { ...access, leads: leadsAccess },
    profile,
    loading,
    refreshing: enquiries.refreshing || quotations.refreshing,
    error: enquiries.error || quotations.error,
    fromCache: enquiries.fromCache || quotations.fromCache,
    cachedAt: Number.isFinite(cachedAt) ? cachedAt : null,
    reload,
  }
}
