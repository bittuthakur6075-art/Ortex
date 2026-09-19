import { useRef } from "react"
import { Sparkles, ImageIcon, RefreshCw, X, Upload, Package, AlertTriangle } from "../../components/ui/Icons"
import { Button, Card, Textarea, Field, Segmented } from "../../components/ui/Ui"
import { SOCIAL_FORMATS, FORMAT_ASPECT } from "../../lib/socialImage"

// Where a creative came from, in words, under the preview.
const SOURCE_LABEL = {
  upload: "Your photo",
  catalogue: "From the catalogue",
  ai: "Generated with AI",
  restyle: "Your photo, new scene by AI",
}

/**
 * The creative: a real photo (uploaded or picked from the catalogue) or an AI
 * image. The editor owns every action; this card lays them out.
 * `busy` is "" | "upload" | "pick" | "generate" | "restyle".
 */
export default function CreativeCard({ form, set, busy, locked, onUpload, onOpenPicker, onGenerate, onRestyle }) {
  const fileRef = useRef(null)
  const working = Boolean(busy)
  // A restyle needs a real photo to start from: the one this post already uses,
  // or the original a previous restyle was made from.
  const realPhoto = form.imageSource === "restyle" ? form.sourceImage : ["upload", "catalogue"].includes(form.imageSource) ? form.image : ""

  return (
    <Card className="p-5">
      <h3 className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Creative
      </h3>
      <div className="grid gap-5 sm:grid-cols-[240px_1fr]">
        <div>
          <div className={`relative overflow-hidden rounded-lg bg-muted ${FORMAT_ASPECT[form.format] || FORMAT_ASPECT.square}`}>
            {form.image ? (
              <img src={form.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span className="text-xs">No photo yet</span>
              </div>
            )}
            {working && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium text-foreground">
                {busy === "generate" || busy === "restyle" ? "Creating… up to a minute" : "Preparing photo…"}
              </div>
            )}
          </div>
          {form.image && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">{SOURCE_LABEL[form.imageSource] || "Photo"}</span>
              {!locked && (
                <Button variant="ghost" size="sm" onClick={() => set("image", "")} disabled={working}>
                  <X className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>
          )}
          {form.image && ["ai", "restyle"].includes(form.imageSource) && (
            <p className="mt-2 flex gap-1.5 rounded-md bg-warning/12 p-2 text-[11px] leading-4 text-warning-text">
              <AlertTriangle className="h-3.5 w-3.5 flex-none" />
              AI image: check the product looks like what Ortex actually makes, with no invented text or logo, before sending it for approval.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <Field label="Format" hint="Instagram feed shapes. Applies to the next photo you add or create.">
            <Segmented
              size="md"
              items={SOCIAL_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
              value={form.format || "square"}
              onChange={(v) => !locked && set("format", v)}
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Use a real photo</p>
            <p className="mb-3 text-xs text-muted-foreground">Real photos of your products and work are the most trusted posts.</p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) onUpload(file)
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={working || locked}>
                <Upload className="h-4 w-4" /> {busy === "upload" ? "Uploading…" : "Upload photo"}
              </Button>
              <Button variant="outline" size="sm" onClick={onOpenPicker} disabled={working || locked}>
                <Package className="h-4 w-4" /> {busy === "pick" ? "Adding…" : "Pick from catalogue"}
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-sm font-medium text-foreground">Or create with AI</p>
            <Field
              label={realPhoto ? "Scene or image description" : "Image description"}
              hint={
                realPhoto
                  ? "For Restyle: describe the new scene. The product stays exactly as photographed."
                  : "Describe the product, setting and light. No text or logos: the caption carries the words."
              }
            >
              <Textarea
                rows={4}
                ai={{
                  purpose: realPhoto
                    ? "A short scene description for restyling a real product photo into an advertising shot: the setting, surface, props, light and mood around the product. Do not describe changes to the product itself. Never ask for text, letters, logos or watermarks"
                    : "Prompt for an AI image model that renders a social media product photo: describe the product, material, setting, lighting and composition. Never ask for text, letters, logos or watermarks in the image",
                  context: () => ({ topic: form.topic, caption: form.caption }),
                  format: "short",
                  maxChars: 600,
                }}
                value={form.imagePrompt}
                onChange={(e) => set("imagePrompt", e.target.value)}
                placeholder={realPhoto ? "e.g. on a walnut boardroom table, warm morning light" : "Describe the image"}
                disabled={locked}
              />
            </Field>
            <div className="mt-3 flex flex-wrap gap-2">
              {realPhoto && (
                <Button size="sm" onClick={() => onRestyle(realPhoto)} disabled={working || locked}>
                  <Sparkles className="h-4 w-4" /> {busy === "restyle" ? "Restyling…" : "Restyle this photo"}
                </Button>
              )}
              <Button variant={realPhoto ? "outline" : "primary"} size="sm" onClick={onGenerate} disabled={working || locked}>
                {form.imageSource === "ai" ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {busy === "generate" ? "Generating…" : form.imageSource === "ai" ? "Generate again" : "Generate new image"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
