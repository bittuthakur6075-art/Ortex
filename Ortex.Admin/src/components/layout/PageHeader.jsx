// Standard page title row used at the top of every module: 22px title,
// 13px muted subtitle, actions right-aligned. Optional `eyebrow` renders a
// small label above the title (section name / breadcrumb).
export default function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.02em] text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-[640px] text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

// Drop-in replacement for PageHeader when a page is embedded as a tab inside a
// parent page that already owns the title: keeps the actions, drops the title.
export function ActionBar({ subtitle, children }) {
  if (!children && !subtitle) return null
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] text-muted-foreground">{subtitle}</p>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
