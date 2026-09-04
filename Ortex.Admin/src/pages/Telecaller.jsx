import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Mic, Phone, RefreshCw, Sparkles } from "../components/ui/Icons"
import PageHeader from "../components/layout/PageHeader"
import { Badge, Button, PageLoader } from "../components/ui/Ui"
import { useProfile } from "../hooks/useProfile"
import { useSettings } from "../hooks/useCollection"
import { runSweep } from "../services/telecaller"
import { cn } from "../lib/cn"
import { useTelecallerData } from "./telecaller/useTelecallerData"
import TelecallerStats from "./telecaller/TelecallerStats"
import QueueTab from "./telecaller/QueueTab"
import CallsTab from "./telecaller/CallsTab"
import AgentTab from "./telecaller/AgentTab"
import CallDrawer from "./telecaller/CallDrawer"
import NewCallModal from "./telecaller/NewCallModal"
import PracticeModal from "./telecaller/PracticeModal"

const TABS = [
  { id: "queue", label: "Queue" },
  { id: "calls", label: "Calls" },
  { id: "agent", label: "Agent" },
]

// The AI telecaller console. Queue = what will be called and when, Calls = what
// happened (transcripts + outcomes), Agent = persona, hours and cadences.
export default function Telecaller() {
  const profile = useProfile()
  const settings = useSettings()
  const { calls, stats, openJobs, loading } = useTelecallerData()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get("tab") || "queue")
  const [openCallId, setOpenCallId] = useState(params.get("call"))
  const [creating, setCreating] = useState(false)
  const [practice, setPractice] = useState(null) // false | null = closed, true = scratch, job = that job
  const [sweeping, setSweeping] = useState(false)

  // Deep link from the "AI call" toast on other pages: /telecaller?call=<id>
  useEffect(() => {
    const id = params.get("call")
    if (id) {
      setOpenCallId(id)
      setTab("calls")
      params.delete("call")
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const openCall = useMemo(() => calls.items.find((c) => c.id === openCallId) || null, [calls.items, openCallId])
  const t = settings?.telecaller

  const sweepNow = async () => {
    setSweeping(true)
    const res = await runSweep({ mode: "sweep", force: profile?.role === "admin" })
    setSweeping(false)
    if (res.error) return toast.error(res.error)
    const queued = Object.values(res.enqueued || {}).reduce((a, b) => a + b, 0)
    const bits = [`${queued} queued`, `${res.dialed || 0} dialed`, ...(res.skipped || []), ...(res.errors || [])]
    toast[res.errors?.length ? "warning" : "success"](`Sweep done — ${bits.join(" · ")}`)
  }

  return (
    <div>
      <PageHeader
        title="Telecaller"
        subtitle={`${t?.agentName || "Anu"} rings leads to follow up and close, then comes back for feedback and upsell — every call lands here with a transcript`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {t && (
            <Badge tone={t.enabled ? "emerald" : "slate"}>
              {t.enabled ? "Auto-calling on" : "Auto-calling off"} · {t.provider === "vapi" ? "Vapi" : "Simulator"}
            </Badge>
          )}
          <Button variant="outline" size="sm" disabled={sweeping} onClick={sweepNow} title="Queue new follow-ups, feedback and upsell calls, then dial what is due">
            <RefreshCw className={cn("h-4 w-4", sweeping && "animate-spin")} /> Run sweep
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPractice(true)} title="Talk to the agent with your microphone — free, no phone">
            <Mic className="h-4 w-4" /> Practice
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Phone className="h-4 w-4" /> New call
          </Button>
        </div>
      </PageHeader>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <TelecallerStats stats={stats} />

          <div className="mb-4 flex gap-1 border-b border-border">
            {TABS.map((x) => (
              <button
                key={x.id}
                onClick={() => setTab(x.id)}
                className={cn(
                  "-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors",
                  tab === x.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {x.label}
                {x.id === "queue" && openJobs.length > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">{openJobs.length}</span>}
              </button>
            ))}
          </div>

          {tab === "queue" && <QueueTab jobs={openJobs} onOpenCall={(id) => { setOpenCallId(id); setTab("calls") }} onPractice={(job) => setPractice(job)} />}
          {tab === "calls" && <CallsTab calls={calls.items} onOpen={setOpenCallId} />}
          {tab === "agent" && <AgentTab isAdmin={profile?.role === "admin"} onPractice={() => setPractice(true)} />}

          {!t?.enabled && tab !== "agent" && (
            <p className="mt-6 text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline h-3.5 w-3.5" />
              Automatic calling is off: nothing dials on its own. "Call now" and "AI call" buttons still work. Turn it on under Agent.
            </p>
          )}
        </>
      )}

      {openCall && <CallDrawer call={openCall} onClose={() => setOpenCallId(null)} />}
      <PracticeModal
        open={Boolean(practice)}
        job={practice && practice !== true ? practice : null}
        onClose={() => setPractice(null)}
        onRecorded={(res) => { if (res.callId) { setOpenCallId(res.callId); setTab("calls") } }}
      />
      <NewCallModal open={creating} onClose={() => setCreating(false)} onDialed={(res) => { if (res.callId) { setOpenCallId(res.callId); setTab("calls") } }} />
    </div>
  )
}
