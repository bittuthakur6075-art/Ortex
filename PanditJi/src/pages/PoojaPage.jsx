import { useState } from "react"
import MantraCard from "../components/MantraCard"
import AskChat from "../components/AskChat"

const TABS = [
  { id: "vidhi", label: "Vidhi" },
  { id: "samagri", label: "Samagri" },
  { id: "katha", label: "Katha" },
  { id: "ask", label: "Ask Pandit Ji" },
]

function readChecked(id) {
  try {
    return JSON.parse(localStorage.getItem(`samagri:${id}`) || "{}")
  } catch {
    return {}
  }
}

function Samagri({ pooja }) {
  const [checked, setChecked] = useState(() => readChecked(pooja.id))
  const total = pooja.samagri.reduce((n, g) => n + g.items.length, 0)
  const done = Object.values(checked).filter(Boolean).length
  const toggle = (key) => {
    const next = { ...checked, [key]: !checked[key] }
    setChecked(next)
    try {
      localStorage.setItem(`samagri:${pooja.id}`, JSON.stringify(next))
    } catch { /* private mode: the ticks just won't persist */ }
  }
  return (
    <div>
      <p className="text-[15px] text-muted-foreground">{done} of {total} ready</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {pooja.samagri.map((g) => (
          <div key={g.group} className="rounded-2xl border bg-card p-6">
            <h3 className="text-[18px] font-medium">{g.group}</h3>
            <ul className="mt-4 space-y-3">
              {g.items.map((item) => {
                const key = `${g.group}:${item}`
                return (
                  <li key={item}>
                    <label className="flex cursor-pointer items-start gap-3 text-[15px]">
                      <input type="checkbox" checked={Boolean(checked[key])} onChange={() => toggle(key)} className="mt-1 h-4 w-4 accent-[hsl(22_88%_44%)]" />
                      <span className={checked[key] ? "text-muted-foreground line-through" : ""}>{item}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PoojaPage({ pooja }) {
  const [tab, setTab] = useState("vidhi")

  return (
    <>
      <section className="border-b bg-secondary">
        <div className="lp-wrap py-14 lg:py-20">
          <p className="deva text-[22px] text-primary">{pooja.nameHi}</p>
          <h1 className="mt-2 text-[34px] font-medium leading-[1.06] tracking-tight sm:text-[48px]">{pooja.name}</h1>
          <p className="mt-3 text-[14px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{pooja.tradition} · {pooja.duration}</p>
          <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-foreground/80">{pooja.summary}</p>
          <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-call p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[18px] font-medium">Do this pooja on a video call with Pandit Ji</p>
              <p className="mt-1 text-[14px] text-white/70">He sees your altar, guides each step, recites every mantra with you and answers any question.</p>
            </div>
            <a href={`#/pooja/${pooja.id}/live`} className="btn btn-primary btn-lg shrink-0">Join the video call</a>
          </div>
        </div>
      </section>

      <div className="lp-wrap py-10">
        <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-[15px] font-medium transition-colors ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-10 max-w-4xl">
          {tab === "vidhi" && (
            <div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-card p-6">
                  <h3 className="text-[18px] font-medium">When to do it</h3>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-foreground/80">
                    {pooja.whenToDo.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
                <div className="rounded-2xl border bg-card p-6">
                  <h3 className="text-[18px] font-medium">Maithil notes</h3>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-foreground/80">
                    {pooja.maithilNotes.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              </div>
              <ol className="mt-12 list-none space-y-12">
                {pooja.steps.map((s, i) => (
                  <li key={s.title} className="grid gap-4 sm:grid-cols-[72px_1fr]">
                    <div className="text-[36px] font-semibold leading-none tabular-nums text-primary/50">{String(i + 1).padStart(2, "0")}</div>
                    <div>
                      <h3 className="text-[22px] font-medium">
                        {s.title} <span className="deva text-[18px] text-primary">{s.titleHi}</span>
                      </h3>
                      <div className="mt-4 border-t border-primary/40" />
                      <p className="mt-4 text-[16px] leading-relaxed text-foreground/80">{s.what}</p>
                      {s.mantra && <div className="mt-4"><MantraCard mantra={s.mantra} /></div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {tab === "samagri" && <Samagri pooja={pooja} />}

          {tab === "katha" && (
            <div className="space-y-5">
              {pooja.katha.map((k) => (
                <article key={k.n} className="rounded-2xl border bg-card p-6">
                  <p className="deva text-[16px] text-primary">{k.titleHi}</p>
                  <h3 className="mt-1 text-[20px] font-medium">{k.n}. {k.title}</h3>
                  <p className="mt-3 text-[16px] leading-relaxed text-foreground/80">{k.text}</p>
                  {pooja.jaikara && <p className="deva mt-4 font-semibold text-primary">{pooja.jaikara}</p>}
                </article>
              ))}
            </div>
          )}

          {tab === "ask" && <AskChat pooja={pooja} />}
        </div>
      </div>
    </>
  )
}
