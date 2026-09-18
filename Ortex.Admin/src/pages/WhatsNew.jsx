import { useMemo, useState } from "react"
import { Sparkles } from "../components/ui/Icons"
import { Badge, Card, CardHeader, EmptyState, PillTabs } from "../components/ui/Ui"
import PageHeader from "../components/layout/PageHeader"
import { KIND_LABEL, RELEASES } from "../data/domain/whatsNew"
import { formatDate } from "../lib/format"
import { version as APP_VERSION } from "../../package.json"

// What changed in the console, newest release first. The content lives in
// data/domain/whatsNew.js; this page only lays it out. Every signed-in user can
// read it, so it sits outside the module guards like /profile.

const KIND_TONE = { new: "blue", improved: "emerald", fixed: "amber" }
const KIND_ORDER = ["new", "improved", "fixed"]

const ALL_ITEMS = RELEASES.flatMap((r) => r.items)
const FILTERS = [
  { value: "all", label: "Everything", count: ALL_ITEMS.length },
  ...KIND_ORDER.map((kind) => ({ value: kind, label: KIND_LABEL[kind], count: ALL_ITEMS.filter((it) => it.kind === kind).length })),
]

export default function WhatsNew() {
  const [filter, setFilter] = useState("all")

  const releases = useMemo(
    () =>
      RELEASES.map((r) => ({
        ...r,
        items: r.items
          .filter((it) => filter === "all" || it.kind === filter)
          .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
      })).filter((r) => r.items.length),
    [filter],
  )

  return (
    <div className="mx-auto max-w-4xl pb-6">
      <PageHeader title="What's new" subtitle={`Changes to the Ortex console, newest first. You are on version ${APP_VERSION}.`} />

      <PillTabs items={FILTERS} value={filter} onChange={setFilter} className="mb-5" />

      {releases.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nothing here yet" description="No changes of this kind have been released." />
      ) : (
        <ol className="flex flex-col gap-5">
          {releases.map((r, i) => (
            <li key={r.id}>
              <Card>
                <CardHeader
                  title={r.title}
                  description={[r.version && `Version ${r.version}`, formatDate(r.date)].filter(Boolean).join(" · ")}
                  action={i === 0 && r.id === RELEASES[0].id ? <Badge tone="blue">Latest</Badge> : null}
                />
                <div className="p-5">
                  {r.summary && <p className="mb-4 text-sm text-secondary-foreground">{r.summary}</p>}
                  <ul className="flex flex-col divide-y divide-border">
                    {r.items.map((it) => (
                      <li key={it.title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="w-[76px] flex-none pt-0.5">
                          <Badge tone={KIND_TONE[it.kind]}>{KIND_LABEL[it.kind]}</Badge>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{it.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{it.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
