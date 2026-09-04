import { Sparkles } from "../../components/ui/Icons"
import { Button } from "../../components/ui/Ui"

// AI copywriter banner — fills SEO title, marketing description, and category.
export default function AiCopyPanel({ busy, onGenerate }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Write with AI</p>
        <p className="text-xs text-muted-foreground">SEO title, marketing description, and best-fit category from the name/material.</p>
      </div>
      <Button size="sm" onClick={onGenerate} disabled={busy}>
        <Sparkles className="h-4 w-4" /> {busy ? "Writing…" : "Generate"}
      </Button>
    </div>
  )
}
