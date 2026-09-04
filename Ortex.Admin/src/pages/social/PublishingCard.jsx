import { SOCIAL_PLATFORMS } from "../../data/domain/schema"
import { Card, Input, Field } from "../../components/ui/Ui"
import { PLATFORM_ICON, toLocalInput } from "./helpers"

export default function PublishingCard({ form, set, togglePlatform, locked }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Publishing
      </h3>
      <div className="space-y-4">
        <Field label="Platforms">
          <div className="space-y-2">
            {SOCIAL_PLATFORMS.map((p) => {
              const Icon = PLATFORM_ICON[p.id]
              return (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.platforms.includes(p.id)}
                    onChange={() => togglePlatform(p.id)}
                    disabled={locked}
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {p.label}
                </label>
              )
            })}
          </div>
        </Field>

        <Field label="Schedule" hint="Leave blank to publish manually once approved">
          <Input
            type="datetime-local"
            value={form.scheduledFor ? toLocalInput(form.scheduledFor) : ""}
            onChange={(e) => set("scheduledFor", e.target.value ? new Date(e.target.value).toISOString() : null)}
            disabled={locked}
          />
        </Field>

        {form.approvedAt && (
          <p className="text-xs text-muted-foreground">
            Approved by {form.approvedBy || "an admin"} on{" "}
            {new Date(form.approvedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </div>
    </Card>
  )
}
