// Metronic 9 "toolbar": 20px medium title, 14px muted subtitle, actions on
// the right, 30px of air before the content.
export default function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="mb-[30px] flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col justify-center gap-2">
        {eyebrow && <p className="text-xs font-medium uppercase text-muted-foreground/70">{eyebrow}</p>}
        <h1 className="text-xl font-medium leading-none text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  )
}

// Drop-in replacement for PageHeader when a page is embedded as a tab inside a
// parent page that already owns the title: keeps the actions, drops the title.
export function ActionBar({ subtitle, children }) {
  if (!children && !subtitle) return null
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  )
}
