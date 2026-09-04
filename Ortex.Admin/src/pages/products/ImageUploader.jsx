import { useState } from "react"
import { toast } from "sonner"
import { Upload, X } from "../../components/ui/Icons"
import { uploadImage, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "../../lib/imageUpload"
import { cn } from "../../lib/cn"
import { Button, Input, Field } from "../../components/ui/Ui"
import { MAX_IMAGES } from "./helpers"

// Product image grid + upload zone + add-by-URL. Operates on the parent form's
// `images` array via the parent's `setForm` updater.
export default function ImageUploader({ images, setForm }) {
  const [urlInput, setUrlInput] = useState("")
  const [isCompressing, setIsCompressing] = useState(false)

  const addImageUrl = () => {
    if (!urlInput.trim()) return
    setForm((f) => ({
      ...f,
      images: [...(f.images || []), urlInput.trim()]
    }))
    setUrlInput("")
  }

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = "" // clear input early so re-selecting the same file works
    if (!files.length) return

    // Guardrails: cap the total number of images and reject oversized files
    // before they bloat the base64 payload / localStorage.
    const currentCount = (images || []).length
    const room = MAX_IMAGES - currentCount
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_IMAGES} images per product.`)
      return
    }
    const oversized = files.filter((f) => f.size > MAX_IMAGE_BYTES)
    let accepted = files.filter((f) => f.size <= MAX_IMAGE_BYTES)
    if (oversized.length) toast.error(`${oversized.length} file(s) skipped — over ${MAX_IMAGE_MB}MB.`)
    let trimmed = false
    if (accepted.length > room) {
      accepted = accepted.slice(0, room)
      trimmed = true
    }
    if (!accepted.length) return

    setIsCompressing(true)
    try {
      // Compress + upload each image to Storage; store the returned public URL.
      const results = await Promise.allSettled(accepted.map((f) => uploadImage(f, "products")))
      const urls = results.filter((r) => r.status === "fulfilled").map((r) => r.value)
      const failed = results.length - urls.length
      setForm((f) => ({
        ...f,
        images: [...(f.images || []), ...urls]
      }))
      if (urls.length) toast.success(`Added ${urls.length} image(s)`)
      if (failed) toast.error(`${failed} image(s) failed to upload.`)
      if (trimmed) toast.error(`Only the first ${room} added — ${MAX_IMAGES}-image limit reached.`)
    } catch (err) {
      console.error("Image upload error:", err)
      toast.error("Failed to upload some images")
    } finally {
      setIsCompressing(false)
    }
  }

  const removeImage = (indexToRemove) => {
    setForm((f) => ({
      ...f,
      images: (f.images || []).filter((_, idx) => idx !== indexToRemove)
    }))
  }

  const makePrimary = (index) => {
    setForm((f) => {
      const currentImages = f.images || []
      if (index === 0 || index >= currentImages.length) return f
      const nextImages = [...currentImages]
      const [selectedImg] = nextImages.splice(index, 1)
      nextImages.unshift(selectedImg)
      return {
        ...f,
        images: nextImages
      }
    })
  }

  return (
    <Field label="Product images">
      <div className="space-y-3">
        {/* Image list grid */}
        {images && images.length > 0 && (
          <div className="grid grid-cols-4 gap-2.5">
            {images.map((img, idx) => (
              <div key={idx} className="group relative aspect-square rounded-lg border border-border bg-muted overflow-hidden">
                <img src={img} alt={`Product ${idx}`} className="h-full w-full object-cover" />

                {/* Hover controls overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="self-end rounded-full p-1 bg-destructive/95 hover:bg-destructive text-white transition-colors cursor-pointer"
                    title="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  {idx === 0 ? (
                    <span className="self-start text-[10px] font-bold text-white bg-primary px-1.5 py-0.5 rounded">
                      Primary
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(idx)}
                      className="self-start text-[10px] font-bold text-white bg-black/60 hover:bg-black/80 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    >
                      Make primary
                    </button>
                  )}
                </div>
                {/* Always visible tiny primary indicator if not hovered */}
                {idx === 0 && (
                  <span className="absolute left-1 bottom-1 text-[9px] font-bold text-white bg-primary px-1 py-0.5 rounded group-hover:hidden shadow-sm">
                    Primary
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload Area & URL Input */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {/* File Upload Zone */}
          <label className={cn(
            "flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:bg-muted/40 transition-colors text-center min-h-[90px]",
            isCompressing && "pointer-events-none opacity-60"
          )}>
            <Upload className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-xs font-semibold text-foreground">
              {isCompressing ? "Processing..." : "Upload images"}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG (compressed)</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              disabled={isCompressing}
            />
          </label>

          {/* Remote URL input */}
          <div className="flex flex-col justify-between border border-border rounded-lg p-2.5 bg-muted/20 min-h-[90px]">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Or add by URL</span>
            <div className="flex gap-1.5 mt-1.5">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="h-8 text-xs py-1 px-2.5 flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addImageUrl}
                className="h-8"
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Field>
  )
}
