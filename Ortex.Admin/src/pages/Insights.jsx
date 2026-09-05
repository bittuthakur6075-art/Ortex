import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { TrendingUp, Flame } from "../components/ui/Icons"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import Growth from "./Growth"
import Automation from "./Automation"

// One Growth workspace. The two tabs are the former Growth and Automation
// pages, embedded unchanged: Growth is the period-scoped funnel/attribution
// view, Web events is the raw stream the marketing site's tracker writes
// (activities, event logs, WhatsApp queue, rules, templates). Access is still
// granted per tab through the original module keys, so a user's permissions
// carry over without migration.
const TABS = [
  { value: "growth", moduleKey: "growth", label: "Funnel", icon: TrendingUp, Page: Growth },
  { value: "events", moduleKey: "automation", label: "Web events", icon: Flame, Page: Automation },
]

export const INSIGHTS_MODULE_KEYS = TABS.map((t) => t.moduleKey)

export default function Insights() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()

  const allowed = useMemo(() => TABS.filter((t) => canAccess(profile, t.moduleKey)), [profile])
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]

  if (!current) return null

  const items = allowed.map((t) => ({ value: t.value, icon: t.icon, label: t.label }))
  const Page = current.Page

  return (
    <div>
      <HeaderBand>
        <PageHeader title="Insights" subtitle="Visitor-to-cash funnel, attribution and the website event stream" />
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
