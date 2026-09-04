import { socialCaptionText } from "../../data/domain/schema"
import { Card, Input, Textarea, Field } from "../../components/ui/Ui"

export default function CopyCard({ form, set, locked }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Copy
      </h3>
      <div className="space-y-4">
        <Field label="Topic" required hint="Internal name for this post">
          <Input value={form.topic} onChange={(e) => set("topic", e.target.value)} placeholder="e.g. Exam Board Bulk Orders" disabled={locked} />
        </Field>
        <Field label="Caption" hint={`${form.caption.length} characters — Instagram cuts off around 125 in the feed`}>
          <Textarea rows={7} value={form.caption} onChange={(e) => set("caption", e.target.value)} placeholder="Write the caption…" disabled={locked} />
        </Field>
        <Field label="Hashtags" hint="Comma separated, without the # sign">
          <Input
            value={(form.hashtags || []).join(", ")}
            onChange={(e) => set("hashtags", e.target.value.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean))}
            placeholder="corporategifting, lanyards, madeinindia"
            disabled={locked}
          />
        </Field>
        {(form.caption || form.hashtags?.length > 0) && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview as posted</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{socialCaptionText(form)}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
