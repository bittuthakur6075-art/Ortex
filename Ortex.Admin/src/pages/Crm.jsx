import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { Inbox, Mic } from "../components/ui/Icons"
import { useProfile } from "../hooks/useProfile"
import { useCollections } from "../hooks/useCollection"
import { canAccess } from "../data/domain/modules"
import { VOICE_SOURCE } from "./voice-leads/helpers"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import Enquiries from "./Enquiries"
import VoiceLeads from "./VoiceLeads"

// The Leads hub (/crm): two tabs over the same `enquiries` collection. Leads
// is the V2 list (pages/Enquiries.jsx); Voice calls folds Anu's captures per
// caller (pages/VoiceLeads.jsx). Each tab is granted by its own module key
// ("enquiries", "voice-leads").
const TABS = [
  { value: "enquiries", moduleKey: "enquiries", label: "Leads", icon: Inbox, Page: Enquiries },
  { value: "voice", moduleKey: "voice-leads", label: "Voice calls", icon: Mic, Page: VoiceLeads },
]

export const CRM_MODULE_KEYS = TABS.map((t) => t.moduleKey)

export default function Crm() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const { data } = useCollections(["enquiries"])

  const allowed = useMemo(() => TABS.filter((t) => canAccess(profile, t.moduleKey)), [profile])
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]

  const counts = useMemo(() => {
    const enquiries = data.enquiries || []
    return {
      enquiries: enquiries.filter((e) => e.status === "new" && e.source !== VOICE_SOURCE).length,
      voice: enquiries.filter((e) => e.status === "new" && e.source === VOICE_SOURCE).length,
    }
  }, [data])

  if (!current) return null

  const items = allowed.map((t) => ({ value: t.value, icon: t.icon, label: t.label, count: counts[t.value] || undefined }))

  const Page = current.Page

  // The Leads list (Figma V2) carries its own title, smart views and a link to
  // Voice calls, so it takes the page without the hub band.
  if (current.value === "enquiries") return <Page embedded />

  return (
    <div>
      <HeaderBand>
        <PageHeader title="Leads" subtitle="Everything customers send in, from the website and from Anu's calls" />
        <Tabs
          items={items}
          value={current.value}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
        />
      </HeaderBand>
      <Page key={current.value} embedded />
    </div>
  )
}
