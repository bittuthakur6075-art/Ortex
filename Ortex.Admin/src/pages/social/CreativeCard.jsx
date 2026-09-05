import { Sparkles, ImageIcon, RefreshCw, X } from "../../components/ui/Icons"
import { Button, Card, Textarea, Select, Field } from "../../components/ui/Ui"

export default function CreativeCard({ form, set, format, setFormat, generate, drawing, locked }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Creative
      </h3>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {form.image ? (
            <img src={form.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">No creative</span>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Field label="Image prompt" hint="What the image model renders. No text or logos - the caption carries the words.">
            <Textarea
              rows={5}
              value={form.imagePrompt}
              onChange={(e) => set("imagePrompt", e.target.value)}
              placeholder="e.g. A stack of custom printed acrylic name badges on a walnut desk, soft window light…"
              disabled={locked}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={format} onChange={(e) => setFormat(e.target.value)} className="w-auto" disabled={locked}>
              <option value="square">Square 1:1</option>
              <option value="portrait">Portrait 4:5</option>
              <option value="landscape">Landscape 1.91:1</option>
            </Select>
            <Button variant="outline" size="sm" onClick={generate} disabled={drawing || locked}>
              {form.image ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {drawing ? "Rendering…" : form.image ? "Regenerate" : "Generate creative"}
            </Button>
            {form.image && !locked && (
              <Button variant="ghost" size="sm" onClick={() => set("image", "")}>
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
