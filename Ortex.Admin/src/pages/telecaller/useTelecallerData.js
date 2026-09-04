import { useMemo } from "react"
import { useCollection } from "../../hooks/useCollection"
import { ACTION_OUTCOMES, DAY_MS, OPEN_JOB } from "./helpers"

// Jobs + calls for the Telecaller page, plus the headline numbers. Pure
// derivation over the two collections; both are small (one row per call).
export function useTelecallerData() {
  const jobs = useCollection("telecaller_jobs")
  const calls = useCollection("telecaller_calls")

  const stats = useMemo(() => {
    const now = Date.now()
    const dayStart = new Date().setHours(0, 0, 0, 0)
    const week = calls.items.filter((c) => new Date(c.createdAt).getTime() >= now - 7 * DAY_MS)
    const completed = week.filter((c) => c.status === "completed")
    const connected = completed.filter((c) => c.analysis && !["no_answer", "busy", "voicemail", "failed"].includes(c.analysis.outcome))
    const deals = completed.filter((c) => c.analysis?.outcome === "deal_closed")
    const pipeline = deals.reduce((s, c) => s + (Number(c.analysis?.estimatedValue) || 0), 0)
    const due = jobs.items.filter((j) => j.status === "queued" && new Date(j.scheduledAt || 0).getTime() <= now).length
    const upcoming = jobs.items.filter((j) => j.status === "queued" && new Date(j.scheduledAt || 0).getTime() > now).length
    const inFlight = jobs.items.filter((j) => ["dialing", "in_progress"].includes(j.status)).length
    const today = calls.items.filter((c) => new Date(c.createdAt).getTime() >= dayStart).length
    const actions = calls.items.filter((c) => c.status === "completed" && ACTION_OUTCOMES.has(c.analysis?.outcome) && !c.handled).length
    const ratings = completed.map((c) => Number(c.analysis?.feedbackRating) || 0).filter(Boolean)
    return {
      today, due, upcoming, inFlight,
      week: week.length,
      connectRate: completed.length ? Math.round((connected.length / completed.length) * 100) : 0,
      deals: deals.length,
      pipeline,
      actions,
      avgRating: ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null,
    }
  }, [jobs.items, calls.items])

  const openJobs = useMemo(
    () => jobs.items.filter((j) => OPEN_JOB.includes(j.status)).sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0)),
    [jobs.items],
  )

  return { jobs, calls, stats, openJobs, loading: jobs.loading || calls.loading }
}
