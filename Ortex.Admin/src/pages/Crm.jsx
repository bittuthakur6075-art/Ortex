import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { UserSearch, Inbox, Mic } from "../components/ui/Icons"
import { useProfile } from "../hooks/useProfile"
import { useCollections } from "../hooks/useCollection"
import { canAccess } from "../data/domain/modules"
import { OPEN_LEAD_STAGES } from "../data/domain/schema"
import { VOICE_SOURCE } from "./voice-leads/helpers"
import PageHeader from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import Leads from "./Leads"
import Enquiries from "./Enquiries"
import VoiceLeads from "./VoiceLeads"

// One CRM workspace. The three tabs are the former Leads, Enquiries and Voice
// Leads pages, embedded unchanged. Enquiries and Voice calls read the same
// `enquiries` collection (voice calls are Anu's rows folded per caller);
// Pipeline is the separate `leads` collection that enquiries convert into.
// Access is still granted per tab through the original module keys, so a
// user's permissions carry over without migration.
const TABS = [
  { value: "leads", moduleKey: "leads", label: "Pipeline", icon: UserSearch, Page: Leads },
  { value: "enquiries", moduleKey: "enquiries", label: "Enquiries", icon: Inbox, Page: Enquiries },
  { value: "voice", moduleKey: "voice-leads", label: "Voice calls", icon: Mic, Page: VoiceLeads },
]

export const CRM_MODULE_KEYS = TABS.map((t) => t.moduleKey)

function Count({ n }) {
  if (!n) return null
  return <span className="rounded-md bg-muted px-1.5 text-[11px] font-semibold leading-4 text-muted-foreground tabular">{n}</span>
}

export default function Crm() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const { data } = useCollections(["leads", "enquiries"])

  const allowed = useMemo(() => TABS.filter((t) => canAccess(profile, t.moduleKey)), [profile])
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]

  const counts = useMemo(() => {
    const leads = data.leads || []
    const enquiries = data.enquiries || []
    return {
      leads: leads.filter((l) => OPEN_LEAD_STAGES.includes(l.stage)).length,
      enquiries: enquiries.filter((e) => e.status === "new" && e.source !== VOICE_SOURCE).length,
      voice: enquiries.filter((e) => e.status === "new" && e.source === VOICE_SOURCE).length,
    }
  }, [data])

  if (!current) return null

  const items = allowed.map((t) => ({
    value: t.value,
    icon: t.icon,
    label: (
      <>
        {t.label} <Count n={counts[t.value]} />
      </>
    ),
  }))

  const Page = current.Page

  return (
    <div>
      <PageHeader title="CRM" subtitle="Enquiries come in, calls get summarised, and the pipeline turns them into quotes" />
      <Tabs
        className="mb-5"
        items={items}
        value={current.value}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      <Page key={current.value} embedded />
    </div>
  )
}
