export default function MantraCard({ mantra, compact = false }) {
  return (
    <div className="rounded-xl border border-primary/25 bg-secondary p-4">
      <p className={`deva whitespace-pre-line font-semibold leading-relaxed text-foreground ${compact ? "text-[17px]" : "text-[20px]"}`}>{mantra.deva}</p>
      <p className="mt-2 whitespace-pre-line text-[14px] italic leading-relaxed text-muted-foreground">{mantra.roman}</p>
      {!compact && <p className="mt-3 border-t border-primary/20 pt-3 text-[14px] leading-relaxed text-foreground/80">{mantra.meaning}</p>}
    </div>
  )
}
