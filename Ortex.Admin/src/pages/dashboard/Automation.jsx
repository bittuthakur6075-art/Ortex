import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Instagram, Mic, PhoneOutgoing, Sparkles } from "../../components/ui/Icons"
import { telecallerStats } from "../telecaller/useTelecallerData"
import { DAY, voiceCalls } from "../../lib/analytics/today"
import { cn } from "../../lib/cn"
import { Dot, Pill, TONE, Tile, money } from "./parts"

// Automation health: Anu on the website, the Call agent, Social publishing and
// Anu's team bot. Each card only renders for someone who can open its module,
// and the page loads a module's collection only for someone who may see it.

export default function Automation({ access, data, settings, bot }) {
  const cards = [
    access.voice && <VoiceCard key="voice" enquiries={data.enquiries || []} />,
    access.telecaller && <CallAgentCard key="calls" jobs={data.telecaller_jobs || []} calls={data.telecaller_calls || []} provider={settings?.telecaller?.provider} />,
    access.social && <SocialCard key="social" items={data.social || []} />,
    bot && <BotCard key="bot" runs={bot} />,
  ].filter(Boolean)
  if (!cards.length) return null
  // Failures only: Simulate is a choice, and its card already says so.
  const failing = ((data.social || []).some((p) => p.status === "failed") ? 1 : 0) + ((bot || []).some((r) => String(r.outcome).startsWith("error")) ? 1 : 0)

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-[22px] tracking-[-0.01em] text-foreground">Automation health</h2>
          <p className="mt-1 text-[13px] leading-4 text-subtle-foreground">Anu, the Call agent, Social and the team bot. Failures also land in Needs you.</p>
        </div>
        {failing > 0 && <Pill tone="rose" className="text-xs">{failing} need{failing === 1 ? "s" : ""} attention</Pill>}
      </header>
      <div className="grid gap-4 sm:grid-cols-2">{cards}</div>
    </section>
  )
}

function Shell({ icon: Icon, tone, title, subtitle, to, status, stats, foot, footTone = "slate" }) {
  const t = TONE[tone]
  return (
    <Link to={to} className="squircle flex flex-col gap-4 rounded-card bg-card p-5 transition-colors hover:bg-card/80">
      <div className="flex items-center gap-3">
        <span className={cn("squircle grid h-11 w-11 flex-none place-items-center rounded-xl", t.soft, t.text)}>
          <Icon className="h-[22px] w-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-[18px] text-foreground">{title}</div>
          <div className="mt-0.5 truncate text-[12.5px] leading-[15px] text-subtle-foreground">{subtitle}</div>
        </div>
        {status}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(([label, value]) => (
          <Tile key={label} label={label} value={value} valueSize={18} />
        ))}
      </div>
      {foot && (
        <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Dot tone={footTone} size={6} />
          <span className="truncate leading-4">{foot}</span>
        </p>
      )}
    </Link>
  )
}

function VoiceCard({ enquiries }) {
  const s = useMemo(() => {
    const now = Date.now()
    const dayStart = new Date().setHours(0, 0, 0, 0)
    const calls = voiceCalls(enquiries)
    const at = (c) => new Date(c.endedAt || c.startedAt).getTime()
    const week = calls.filter((c) => at(c) >= now - 7 * DAY)
    const asked = new Map()
    for (const c of week) if (c.productInterest) asked.set(c.productInterest, (asked.get(c.productInterest) || 0) + 1)
    return {
      today: calls.filter((c) => at(c) >= dayStart).length,
      week: week.length,
      support: calls.filter((c) => c.flags.support && at(c) >= now - 14 * DAY).length,
      waiting: calls.filter((c) => c.status === "new" && at(c) >= now - 14 * DAY).length,
      top: [...asked.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    }
  }, [enquiries])
  return (
    <Shell
      icon={Mic}
      tone="blue"
      title="Anu, voice"
      subtitle="Website voice assistant"
      to="/crm?tab=voice"
      status={<Pill tone={s.support ? "rose" : "emerald"}>{s.support ? `${s.support} support` : "Live"}</Pill>}
      stats={[["Calls today", s.today], ["Calls, 7 days", s.week], ["Not contacted", s.waiting], ["Support issues", s.support]]}
      foot={s.top ? `Most asked this week: ${s.top}` : "No calls this week yet"}
      footTone={s.top ? "blue" : "slate"}
    />
  )
}

function CallAgentCard({ jobs, calls, provider }) {
  const stats = useMemo(() => telecallerStats(jobs, calls), [jobs, calls])
  const simulate = !provider || provider === "simulate"
  return (
    <Shell
      icon={PhoneOutgoing}
      tone="violet"
      title="Call agent"
      subtitle="Outbound follow-up calls"
      to="/telecaller"
      status={<Pill tone={simulate ? "amber" : "emerald"}>{simulate ? "Simulate" : "Live"}</Pill>}
      stats={[["Due now", stats.due], ["Calls, 7 days", stats.week], ["Deals closed", stats.deals ? `${stats.deals} · ${money(stats.pipeline)}` : 0], ["Needs a human", stats.actions]]}
      foot={simulate ? "On Simulate: no real calls go out until Vapi is set up" : `${stats.connectRate}% of calls connected this week`}
      footTone={simulate ? "amber" : "emerald"}
    />
  )
}

function SocialCard({ items }) {
  const s = useMemo(() => {
    const c = {}
    for (const p of items) c[p.status] = (c[p.status] || 0) + 1
    const weekAgo = Date.now() - 7 * DAY
    const published = items.filter((p) => p.status === "published" && new Date(p.publishedAt || p.updatedAt || 0).getTime() >= weekAgo).length
    return { ...c, published }
  }, [items])
  const failed = s.failed || 0
  return (
    <Shell
      icon={Instagram}
      tone="rose"
      title="Social"
      subtitle="Idea to published post"
      to="/social"
      status={<Pill tone={failed ? "rose" : "emerald"}>{failed ? `${failed} failed` : "On track"}</Pill>}
      stats={[["In review", s.review || 0], ["Scheduled", s.scheduled || 0], ["Published, 7 days", s.published], ["Failed", failed]]}
      foot={failed ? "A failed post can be retried; platforms already done are skipped" : s.review ? "Posts in review wait for an admin" : "Nothing waiting"}
      footTone={failed ? "rose" : s.review ? "violet" : "slate"}
    />
  )
}

function BotCard({ runs }) {
  const posted = runs.filter((r) => r.outcome === "posted").length
  const quiet = runs.filter((r) => r.outcome === "nothing").length
  const failed = runs.filter((r) => String(r.outcome).startsWith("error")).length
  const last = [...runs].sort((a, b) => new Date(b.ran_at) - new Date(a.ran_at))[0]
  const lastAt = last ? new Date(last.ran_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : null
  return (
    <Shell
      icon={Sparkles}
      tone="emerald"
      title="Anu team bot"
      subtitle="Daily posts in Team chat"
      to="/chat"
      status={<Pill tone={failed ? "rose" : "emerald"}>{failed ? `${failed} failed` : "On"}</Pill>}
      stats={[["Posted today", posted], ["Failed runs", failed], ["Nothing to say", quiet], ["Last run", lastAt || "Not yet"]]}
      foot={failed ? "Open Team chat, gear icon, to send a failed post again" : "Settings live in Team chat, gear icon"}
      footTone={failed ? "rose" : "emerald"}
    />
  )
}
