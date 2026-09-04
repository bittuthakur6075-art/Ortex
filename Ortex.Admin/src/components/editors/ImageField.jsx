import { useState } from "react"
import { toast } from "sonner"
import { Upload, X } from "../ui/Icons"
import { uploadImage, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "../../lib/imageUpload"
import { cn } from "../../lib/cn"
import { Button, Input, Field } from "../ui/Ui"

// One image picker for every catalogue editor: upload files to the Storage
// bucket (compressed client-side by lib/imageUpload) or paste an https URL.
//
// Two shapes:
//   <ImageField value={url} onChange={(url) => …} />            single image
//   <ImageField images={[url]} onChange={(urls) => …} max={8} /> ordered list;
//                                                             index 0 is primary
// `bucket` is the folder prefix inside the Storage bucket ("products",
// "categories", "work").

const isHttpUrl = (u) => /^https?:\/\//i.test(u)

export default function ImageField({ value, images, onChange, bucket, label = "Image", max = 8, required, error, hint }) {
  const multiple = Array.isArray(images)
  const list = multiple ? images : value ? [value] : []
  const limit = multiple ? max : 1
  const room = limit - list.length
  const [urlInput, setUrlInput] = useState("")
  const [uploading, setUploading] = useState(false)

  const commit = (next) => onChange(multiple ? next : next[0] || "")

  const addUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    if (!isHttpUrl(url)) return toast.error("Enter a valid image URL (http/https).")
    if (room <= 0) return toast.error(`You can add up to ${limit} image(s).`)
    commit([...list, url])
    setUrlInput("")
  }

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = "" // clear early so re-selecting the same file works
    if (!files.length) return
    if (room <= 0) return toast.error(`You can add up to ${limit} image(s).`)

    const oversized = files.filter((f) => f.size > MAX_IMAGE_BYTES)
    let accepted = files.filter((f) => f.size <= MAX_IMAGE_BYTES)
    if (oversized.length) toast.error(`${oversized.length} file(s) skipped — over ${MAX_IMAGE_MB}MB.`)
    const trimmed = accepted.length > room
    if (trimmed) accepted = accepted.slice(0, room)
    if (!accepted.length) return

    setUploading(true)
    try {
      const results = await Promise.allSettled(accepted.map((f) => uploadImage(f, bucket)))
      const urls = results.filter((r) => r.status === "fulfilled").map((r) => r.value)
      const failed = results.length - urls.length
      if (urls.length) {
        commit([...list, ...urls])
        toast.success(multiple ? `Added ${urls.length} image(s)` : "Image uploaded")
      }
      if (failed) toast.error(`${failed} image(s) failed to upload.`)
      if (trimmed) toast.error(`Only the first ${room} added — ${limit}-image limit reached.`)
    } catch (err) {
      console.error("Image upload failed:", err)
      toast.error("Failed to upload image")
    } finally {
      setUploading(false)
    }
  }

  const remove = (idx) => commit(list.filter((_, i) => i !== idx))

  const makePrimary = (idx) => {
    if (idx === 0 || idx >= list.length) return
    const next = [...list]
    const [picked] = next.splice(idx, 1)
    next.unshift(picked)
    commit(next)
  }

  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <div className="space-y-3">
        {list.length > 0 && !multiple && (
          <div className="flex items-center gap-3">
            <img src={list[0]} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
            <Button type="button" variant="outline" size="sm" onClick={() => remove(0)}>
              <X className="h-4 w-4" /> Remove
            </Button>
          </div>
        )}

        {list.length > 0 && multiple && (
          <div className="grid grid-cols-4 gap-2.5">
            {list.map((img, idx) => (
              <div key={`${img}-${idx}`} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                <img src={img} alt={`Image ${idx + 1}`} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex flex-col justify-between bg-foreground/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="self-end cursor-pointer rounded-full bg-destructive p-1 text-destructive-foreground transition-colors hover:bg-destructive/90"
                    title="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {idx === 0 ? (
                    <span className="self-start rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">Primary</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(idx)}
                      className="self-start cursor-pointer rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-bold text-foreground transition-colors hover:bg-background"
                    >
                      Make primary
                    </button>
                  )}
                </div>
                {idx === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-primary px-1 py-0.5 text-[9px] font-bold text-primary-foreground group-hover:hidden">
                    Primary
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {room > 0 && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label
              className={cn(
                "flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-4 text-center transition-colors hover:bg-subtle",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              <Upload className="mb-1 h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">{uploading ? "Uploading…" : multiple ? "Upload images" : "Upload image"}</span>
              <span className="mt-0.5 text-[10px] text-muted-foreground">PNG, JPG (compressed)</span>
              <input type="file" accept="image/*" multiple={multiple} onChange={handleFiles} className="hidden" disabled={uploading} />
            </label>

            <div className="flex min-h-[90px] flex-col justify-between rounded-lg border border-border bg-muted/20 p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Or add by URL</span>
              <div className="mt-1.5 flex gap-1.5">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addUrl()
                    }
                  }}
                  placeholder="https://example.com/image.jpg"
                  className="h-8 flex-1 px-2.5 py-1 text-xs"
                />
                <Button type="button" size="sm" variant="outline" onClick={addUrl} className="h-8" disabled={!urlInput.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Field>
  )
}
