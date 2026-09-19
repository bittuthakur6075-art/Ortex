import { socialCaptionText } from "../../data/domain/schema"
import { Card, Input, Textarea, Field } from "../../components/ui/Ui"
import { IG_MAX_CAPTION, IG_MAX_HASHTAGS } from "../../lib/socialImage"

export default function CopyCard({ form, set, locked }) {
  const posted = socialCaptionText(form)
  const tags = (form.hashtags || []).length
  const onInstagram = (form.platforms || []).includes("instagram")
  const tooLong = onInstagram && posted.length > IG_MAX_CAPTION
  const tooManyTags = onInstagram && tags > IG_MAX_HASHTAGS

  return (
    <Card className="p-5">
      <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Copy
      </h3>
      <div className="space-y-4">
        <Field label="Topic" required hint="Internal name for this post">
          <Input value={form.topic} onChange={(e) => set("topic", e.target.value)} placeholder="Enter topic" disabled={locked} />
        </Field>
        {form.hook && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
            <span className="font-semibold">Why this post: </span>
            {form.hook}
          </p>
        )}
        <Field
          label="Caption"
          hint={`${form.caption.length} characters. The feed shows about the first 125, so lead with the hook.`}
        >
          <Textarea
            rows={7}
            ai={{
              purpose: "Instagram and Facebook caption for an Ortex Industries post. Hook in the first 125 characters, a clear call to enquire, no hashtags (they are a separate field)",
              context: () => ({ topic: form.topic, hashtags: form.hashtags }),
              format: "message",
              maxChars: 1500,
            }}
            value={form.caption}
            onChange={(e) => set("caption", e.target.value)}
            placeholder="Enter caption"
            disabled={locked}
          />
        </Field>
        <Field
          label="Hashtags"
          hint={`Comma separated, without the # sign. ${tags} of ${IG_MAX_HASHTAGS} Instagram allows.`}
          error={tooManyTags ? `Instagram allows ${IG_MAX_HASHTAGS} hashtags; remove ${tags - IG_MAX_HASHTAGS}.` : undefined}
        >
          <Input
            value={(form.hashtags || []).join(", ")}
            onChange={(e) => set("hashtags", e.target.value.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean))}
            placeholder="Enter hashtags"
            disabled={locked}
          />
        </Field>
        {posted && (
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preview as posted
              <span className={tooLong ? "normal-case text-destructive-text" : "font-normal normal-case"}>
                {posted.length} / {IG_MAX_CAPTION}
              </span>
            </p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{posted}</p>
            {tooLong && (
              <p className="mt-2 text-xs text-destructive-text">
                Caption and hashtags together are over Instagram's {IG_MAX_CAPTION} characters. Shorten one of them.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
