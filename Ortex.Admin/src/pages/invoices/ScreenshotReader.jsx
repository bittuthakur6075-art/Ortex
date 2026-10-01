import { useEffect, useRef, useState } from "react"
import { Sparkles, ImageIcon, X } from "../../components/ui/Icons"
import { Button } from "../../components/ui/Ui"
import { mergeReadings, otsuThreshold, parseReceiptText, readingScore } from "../../lib/paymentReader"

// Drop, paste or pick a UPI / bank-transfer screenshot. It is read IN THE
// BROWSER: the image is cleaned for recognition, Tesseract's LSTM network turns
// it into text, and parseReceiptText() reads the fields. `onRead(reading)` hands
// the raw reading back for lib/paymentReader.js to turn into the form's values.
// No language model, no upload: the image never leaves this computer.

// Text recognises best at roughly 30px capitals: phone screenshots are already
// there, small crops are scaled up, huge ones down.
const MIN_WIDTH = 1200
const MAX_WIDTH = 2400

/**
 * Image file -> dark text on light, scaled for recognition. Greyscale by default
 * (Tesseract binarises it itself, locally); `threshold` forces one Otsu cut,
 * which rescues low-contrast text but can wash out coloured text.
 */
async function prepare(file, threshold = false) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(Math.max(MIN_WIDTH / bitmap.width, 1), MAX_WIDTH / bitmap.width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  const grey = new Uint8ClampedArray(px.length / 4)
  const hist = new Array(256).fill(0)
  let total = 0
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
    grey[j] = g
    hist[g]++
    total += g
  }
  // A dark-mode screenshot is light text on dark: flip it so text is dark.
  const dark = total / grey.length < 110
  const cut = threshold ? otsuThreshold(dark ? [...hist].reverse() : hist) : -1
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = dark ? 255 - grey[j] : grey[j]
    const v = cut < 0 ? g : g > cut ? 255 : 0
    px[i] = px[i + 1] = px[i + 2] = v
    px[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// One recogniser for the session: the English model (about 10 MB, cached by the
// browser after the first read) loads once, on the first screenshot.
let worker = null
let onProgress = () => {}
function recogniser() {
  worker ||= import("tesseract.js").then(({ createWorker }) =>
    createWorker("eng", 1, { logger: (m) => m.status === "recognizing text" && onProgress(m.progress) }),
  )
  return worker
}

export default function ScreenshotReader({ onRead }) {
  const input = useRef(null)
  const [preview, setPreview] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState(0)

  const read = async (file) => {
    if (!file || !file.type.startsWith("image/")) return setError("Choose an image of the payment.")
    setBusy(true)
    setError("")
    setProgress(0)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
    try {
      const ocr = await recogniser()
      const pass = async (threshold, from, span) => {
        onProgress = (p) => setProgress(from + p * span)
        const { data } = await ocr.recognize(await prepare(file, threshold), {}, { blocks: true })
        // Confidence per line (its weakest word), so the parser can doubt a misread ₹.
        const lineConf = {}
        for (const line of (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))) {
          lineConf[line.text.replace(/\s+/g, "")] = Math.min(...line.words.map((w) => w.confidence))
        }
        return parseReceiptText(data.text, data.confidence, lineConf)
      }
      // Greyscale first; only if a field is still missing, a thresholded second
      // pass fills the gaps (about twice the time, only when it is needed).
      const first = await pass(false, 0, 1)
      onRead(readingScore(first) >= 4 ? first : mergeReadings(first, await pass(true, 0.5, 0.5)))
    } catch (e) {
      console.error("screenshot reader", e)
      worker = null
      setError("That image could not be read. Try a clearer screenshot, or enter the payment by hand.")
    }
    setBusy(false)
  }

  // Ctrl/Cmd+V of a screenshot anywhere while the form is open.
  useEffect(() => {
    const onPaste = (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"))
      if (file) {
        e.preventDefault()
        read(file)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  })

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files?.[0]) }}
        className={`squircle flex items-center gap-3 rounded-lg border border-dashed p-3 ${over ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
      >
        {preview ? (
          <div className="relative shrink-0">
            <img src={preview} alt="Payment screenshot" className="h-14 w-10 rounded object-cover" />
            {!busy && (
              <button
                type="button"
                onClick={() => { setPreview(""); setError("") }}
                aria-label="Remove screenshot"
                className="absolute -right-1.5 -top-1.5 rounded-full bg-card text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ImageIcon size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <div className="text-sm font-medium text-foreground">{busy ? `Reading the screenshot… ${Math.round(progress * 100)}%` : "Fill from a screenshot"}</div>
          UPI, NEFT, RTGS or IMPS receipt. Drop, paste or choose one. Read on this computer.
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Sparkles className="h-4 w-4" /> {preview ? "Another" : "Choose"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { read(e.target.files?.[0]); e.target.value = "" }}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}
