import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, Clock, MapPin, UserCheck, Users } from "../../components/ui/Icons"
import { Avatar, Badge, Banner, Card, CardHeader, EmptyState, PageLoader, StatCard } from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { isAdmin, roleLabel, ROLE_TONE } from "../../lib/roles"
import { currentUserId } from "../../lib/auth"
import { repo } from "../../data/store/repository"
import { clockIST, durationWords, flagWords, onDutySince, summarizeDay } from "../../lib/attendance"
import { listDays, listFlagged, listPunches, todayIST } from "../../services/attendance"
import { listProfiles } from "../../services/users"
import { DayDrawer, FlagBadges, ReviewButtons, Selfie } from "./parts"
import { dayLabel } from "./format"
import { useSelfieUrls } from "./useSelfieUrls"
import { ImageViewer } from "../../components/ui/ImageViewer"

// Attendance → Today: who is in, who is not yet, and what needs a look. For
// admins and anyone granted "attendance-team" (Accounts by default). Nothing
// here marks attendance: that happens only on the phone.

export default function Today() {
  const viewer = useProfile()
  const admin = isAdmin(viewer)
  const selfId = currentUserId()
  const [state, setState] = useState({ loading: true })
  const [open, setOpen] = useState(null) // user id
  const [now, setNow] = useState(Date.now())
  const [viewerUrl, setViewerUrl] = useState(null)

  const load = useCallback(async () => {
    const today = todayIST()
    const yesterday = todayIST(Date.now() - 86400000)
    const [punches, flagged, directory, profiles, days] = await Promise.all([
      listPunches({ from: today, to: today }),
      listFlagged(30),
      repo.staffDirectory ? repo.staffDirectory().catch(() => ({})) : {},
      // Only admins can list every profile (with `active`); for Accounts the
      // "not in yet" figure is left out rather than guessed.
      admin ? listProfiles().catch(() => null) : null,
      // Day statuses (0034): late marks today, missed clock-outs yesterday.
      // Absent before 0034 is pushed, and then the two tiles are left out.
      listDays({ from: yesterday, to: today }),
    ])
    setState({
      loading: false,
      missing: punches.missing || flagged.missing,
      error: punches.error || flagged.error,
      punches: punches.rows,
      flagged: flagged.rows,
      directory: directory || {},
      profiles,
      lateToday: days.missing ? null : days.rows.filter((d) => d.day === today && d.late).length,
      missedYesterday: days.missing ? null : days.rows.filter((d) => d.day === yesterday && (d.override_status || d.status) === "MP").length,
    })
  }, [admin])

  useEffect(() => {
    void load()
  }, [load])

  // Live: the console's shared realtime channel fires on any public change.
  useEffect(() => {
    if (!repo.subscribe) return undefined
    let t = null
    const off = repo.subscribe(() => {
      clearTimeout(t)
      t = setTimeout(() => void load(), 400)
    })
    return () => {
      clearTimeout(t)
      off?.()
    }
  }, [load])

  // Worked time on an open day ticks.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  const people = useMemo(() => {
    if (state.loading) return []
    const by = new Map()
    for (const p of state.punches) {
      if (!by.has(p.user_id)) by.set(p.user_id, [])
      by.get(p.user_id).push(p)
    }
    const day = todayIST()
    return [...by.entries()]
      .map(([userId, list]) => {
        const d = state.directory[userId] || {}
        const s = summarizeDay(day, list, now)
        return {
          userId,
          name: d.name || "Unknown",
          avatarUrl: d.avatarUrl,
          role: d.role,
          summary: s,
          onDuty: Boolean(onDutySince(list, now)),
          flags: [...new Set(list.flatMap((p) => p.flags || []))],
          last: [...list].sort((a, b) => new Date(b.at) - new Date(a.at))[0],
        }
      })
      .sort((a, b) => new Date(a.summary.firstIn || 0) - new Date(b.summary.firstIn || 0))
  }, [state, now])

  const notInYet = useMemo(() => {
    if (!state.profiles) return null
    const seen = new Set(people.filter((p) => p.summary.firstIn).map((p) => p.userId))
    return state.profiles.filter((p) => p.active && !seen.has(p.id))
  }, [state.profiles, people])

  const flaggedUrls = useSelfieUrls((state.flagged || []).map((p) => p.selfie_path))

  if (state.loading) return <PageLoader />
  if (state.missing) {
    return <Banner tone="warning">Attendance is not set up on this database yet (migration 0033).</Banner>
  }

  const openPerson = people.find((p) => p.userId === open)

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <StatCard icon={UserCheck} label="On duty now" value={people.filter((p) => p.onDuty).length} accent="bg-success/12 text-success-text" />
        <StatCard icon={CalendarClock} label="Clocked in today" value={people.filter((p) => p.summary.firstIn).length} />
        {notInYet && <StatCard icon={Users} label="Not in yet" value={notInYet.length} accent="bg-secondary text-secondary-foreground" />}
        <StatCard icon={MapPin} label="Field today" value={people.filter((p) => p.summary.field).length} accent="bg-info/10 text-info-text" />
        <StatCard icon={AlertTriangle} label="Needs review" value={state.flagged.length} accent="bg-warning/12 text-warning-text" />
        {state.lateToday != null && (
          <StatCard icon={Clock} label="Late today" value={state.lateToday} accent="bg-warning/12 text-warning-text" />
        )}
        {state.missedYesterday != null && (
          <StatCard icon={CalendarClock} label="Missed clock-out yesterday" value={state.missedYesterday} accent="bg-destructive/10 text-destructive-text" />
        )}
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={`Today · ${dayLabel(todayIST(), true)}`} description="Times in IST, from the server's clock" />
        {people.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nobody has clocked in yet today" description="Clock-ins appear here the moment they happen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Person</th>
                  <th>Role</th>
                  <th>First in</th>
                  <th>Last out</th>
                  <th>Worked</th>
                  <th>Where</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {people.map((p) => (
                  <tr key={p.userId} className="cursor-pointer" onClick={() => setOpen(p.userId)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} src={p.avatarUrl} className="h-8 w-8" />
                        <span className="font-medium text-foreground">{p.name}</span>
                        {p.onDuty && <Badge tone="emerald">On duty</Badge>}
                      </div>
                    </td>
                    <td>{p.role ? <Badge tone={ROLE_TONE[p.role] || "slate"}>{roleLabel(p.role)}</Badge> : "-"}</td>
                    <td className="tabular">{p.summary.firstIn ? clockIST(p.summary.firstIn) : "-"}</td>
                    <td className="tabular">{p.summary.lastOut && !p.onDuty ? clockIST(p.summary.lastOut) : "-"}</td>
                    <td className="tabular">{durationWords(p.summary.workedMin)}</td>
                    <td className="text-muted-foreground">
                      {p.last?.mode === "field"
                        ? "Field visit"
                        : `${p.last?.site_name || "Office"}${p.last?.distance_m != null ? ` · ${Math.round(p.last.distance_m)} m` : ""}`}
                    </td>
                    <td><FlagBadges flags={p.flags} field={p.summary.field} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {notInYet && notInYet.length > 0 && (
        <Card>
          <CardHeader title="Not in yet" description="Active accounts with no clock-in today" />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {notInYet.map((p) => (
              <span key={p.id} className="flex items-center gap-2 rounded-btn bg-muted px-2.5 py-1.5 text-[13px] text-foreground">
                <Avatar name={p.name || p.email} src={p.avatar_url} className="h-6 w-6" />
                {p.name || p.email}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="Needs review" description="Flagged punches from the last 30 days" />
        {state.flagged.length === 0 ? (
          <EmptyState icon={UserCheck} title="Nothing to review" description="Punches with a weak location, a wrong phone clock or an offline save show up here." />
        ) : (
          <ul className="divide-y divide-border">
            {state.flagged.map((p) => {
              const d = state.directory[p.user_id] || {}
              return (
                <li key={p.id} className="flex items-start gap-3 px-5 py-4">
                  <Selfie url={flaggedUrls[p.selfie_path]} size="h-14 w-14" onOpen={() => setViewerUrl(flaggedUrls[p.selfie_path])} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{d.name || "Unknown"}</span>
                      <span className="text-[13px] text-muted-foreground tabular">
                        {p.kind === "in" ? "Clocked in" : "Clocked out"} · {dayLabel(p.day)} · {clockIST(p.at)}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      {flagWords(p.flags).join(", ")}
                      {p.mode === "field" ? " · Field visit" : p.site_name ? ` · ${p.site_name}${p.distance_m != null ? ` · ${Math.round(p.distance_m)} m` : ""}` : ""}
                    </p>
                    {admin && p.user_id !== selfId ? (
                      <ReviewButtons punch={p} onDone={load} />
                    ) : admin ? (
                      <p className="text-[12px] text-subtle-foreground">Your own punch: another admin reviews it.</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <DayDrawer
        open={Boolean(openPerson)}
        onClose={() => setOpen(null)}
        person={openPerson}
        summary={openPerson?.summary}
        selfId={selfId}
        canReview={admin}
        onReviewed={load}
      />
      <ImageViewer
        open={Boolean(viewerUrl)}
        images={viewerUrl ? [viewerUrl] : []}
        alt="Attendance selfie"
        onClose={() => setViewerUrl(null)}
      />
    </div>
  )
}
