import { useState } from "react"
import { AlertTriangle, Sparkles } from "../ui/Icons"
import { Button, Chip, Input, Modal, Banner } from "../ui/Ui"
import { aiEnhancePhoto } from "../../services/ai"

// Re-shoot one product photo with the product-image-studio Edge Function
// (Cloudflare Workers AI, FLUX.2 [klein] 4B).
//
// The original is never touched. A result is shown BESIDE the photo it came from
// and only "Add as new photo" puts it on the product, as an extra image, because
// an image model can quietly redraw a logo or a line of engraved text and a buyer
// orders exactly what the photo shows. The warning under the pair says so.

const STYLES = [
  { key: "studio", label: "White studio" },
  { key: "gradient", label: "Gradient" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "clean", label: "Clean up" },
  { key: "lighting", label: "Fix lighting" },
]

export default function PhotoStudioModal({ open, source, productName, canAdd = true, onClose, onAdd }) {
  const [style, setStyle] = useState("studio")
  const [instruction, setInstruction] = useState("")
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const close = () => {
    if (busy) return
    setResult("")
    setError("")
    setInstruction("")
    onClose()
  }

  const generate = async () => {
    setBusy(true)
    setError("")
    const { data, error: err } = await aiEnhancePhoto({
      imageUrl: source,
      style,
      instruction: instruction.trim() || undefined,
      productName: productName || undefined,
    })
    setBusy(false)
    if (err) return setError(err)
    setResult(data.image)
  }

  const add = () => {
    onAdd(result)
    setResult("")
    setInstruction("")
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Enhance photo with AI"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Close
          </Button>
          {result ? (
            <>
              <Button variant="outline" onClick={generate} disabled={busy}>
                {busy ? "Generating…" : "Try again"}
              </Button>
              <Button onClick={add} disabled={busy || !canAdd} title={canAdd ? undefined : "The photo limit is reached. Remove a photo first."}>
                Add as new photo
              </Button>
            </>
          ) : (
            <Button onClick={generate} disabled={busy}>
              <Sparkles className="h-4 w-4" /> {busy ? "Generating…" : "Generate"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {STYLES.map((s) => (
            <Chip key={s.key} active={style === s.key} onClick={() => !busy && setStyle(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>

        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Optional: describe the change, for example place it on a wooden table"
          disabled={busy}
        />

        {error && <Banner tone="danger">{error}</Banner>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <figure className="space-y-1.5">
            <figcaption className="text-xs font-medium text-subtle-foreground">Original</figcaption>
            <div className="aspect-square overflow-hidden rounded-[16px] squircle border border-border bg-muted">
              {source && <img src={source} alt="Original product" className="h-full w-full object-contain" />}
            </div>
          </figure>
          <figure className="space-y-1.5">
            <figcaption className="text-xs font-medium text-subtle-foreground">AI version</figcaption>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[16px] squircle border border-border bg-muted">
              {busy ? (
                <span className="text-[13px] text-muted-foreground">Generating, this takes a few seconds…</span>
              ) : result ? (
                <img src={result} alt="AI enhanced product" className="h-full w-full object-contain" />
              ) : (
                <span className="px-6 text-center text-[13px] text-muted-foreground">Pick a style and press Generate.</span>
              )}
            </div>
          </figure>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-warning-text">
          <AlertTriangle className="h-3.5 w-3.5 flex-none" /> Check the logo and text match your product before using this photo.
        </p>
        {!canAdd && result && <p className="text-xs text-subtle-foreground">The photo limit is reached. Remove a photo to add this one.</p>}
      </div>
    </Modal>
  )
}
