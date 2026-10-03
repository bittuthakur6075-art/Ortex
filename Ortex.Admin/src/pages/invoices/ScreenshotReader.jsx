import { useEffect, useRef, useState } from "react"
import { ImageIcon, X } from "../../components/ui/Icons"
import { cn } from "../../lib/cn"
import { evenPolarity, mergeReadings, otsuThreshold, parseReceiptText, pickHeadline, readingScore } from "../../lib/paymentReader"

// Drop, paste or pick a UPI / bank-transfer screenshot. It is read IN THE
// BROWSER: the image is cleaned for recognition, Tesseract's LSTM network turns
// it into text, and parseReceiptText() reads the fields. `onRead(reading)` hands
// the raw reading back for lib/paymentReader.js to turn into the form's values.
// No language model, no upload: the image never leaves this computer.

// Text recognises best at roughly 30px capitals: phone screenshots are already
// there, small crops are scaled up, huge ones down.
const MIN_WIDTH = 1200
const MAX_WIDTH = 2400
// The recogniser skips very large text, which is exactly how apps print the
// amount ("₹453" at 70px). A pass at this width brings it down to body size.
const HEADLINE_WIDTH = 400

/**
 * Image file -> dark text on light, scaled for recognition. Greyscale by default
 * (Tesseract binarises it itself, locally); `threshold` forces one Otsu cut,
 * which rescues low-contrast text but can wash out coloured text. `width`
 * forces the scale (the headline pass).
 */
async function prepare(file, threshold = false, width = 0) {
  const bitmap = await createImageBitmap(file)
  const scale = width ? width / bitmap.width : Math.min(Math.max(MIN_WIDTH / bitmap.width, 1), MAX_WIDTH / bitmap.width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  const raw = new Uint8ClampedArray(px.length / 4)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) raw[j] = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
  // Dark text on light everywhere: dark mode flipped, coloured bands inverted.
  const grey = evenPolarity(raw, canvas.width)
  let cut = -1
  if (threshold) {
    const hist = new Array(256).fill(0)
    for (const g of grey) hist[g]++
    cut = otsuThreshold(hist)
  }
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = grey[j]
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
  worker ||= import("tesseract.js").then(async ({ createWorker }) => {
    const w = await createWorker("eng", 1, { logger: (m) => m.status === "recognizing text" && onProgress(m.progress) })
    // Automatic page layout. tesseract.js defaults to "one uniform block",
    // which throws away an app's big headline amount as a picture.
    await w.setParameters({ tessedit_pageseg_mode: "3" })
    return w
  })
  return worker
}

// `onClear` runs when the X removes the screenshot, so the form can drop what
// it filled. One read at a time: a screenshot dropped or pasted while one is
// being read is ignored, and a read that ends after X was pressed is discarded.
export default function ScreenshotReader({ onRead, onClear }) {
  const input = useRef(null)
  const [preview, setPreview] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState(0)
  const busyRef = useRef(false)
  const seq = useRef(0)
  const previewRef = useRef("")
  // The latest callbacks: a read finishes seconds later, after the form has moved on.
  const callbacks = useRef({ onRead, onClear })
  useEffect(() => {
    callbacks.current = { onRead, onClear }
  })
  // The preview's object URL dies with the drawer.
  useEffect(() => () => previewRef.current && URL.revokeObjectURL(previewRef.current), [])

  const showPreview = (url) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = url
    setPreview(url)
  }

  const clear = () => {
    seq.current++
    showPreview("")
    setError("")
    callbacks.current.onClear?.()
  }

  const read = async (file) => {
    if (busyRef.current) return
    if (!file || !file.type.startsWith("image/")) return setError("Choose an image.")
    const ticket = ++seq.current
    busyRef.current = true
    setBusy(true)
    setError("")
    setProgress(0)
    showPreview(URL.createObjectURL(file))
    try {
      const ocr = await recogniser()
      const pass = async (threshold, width = 0) => {
        onProgress = setProgress
        const { data } = await ocr.recognize(await prepare(file, threshold, width), {}, { blocks: true })
        const lines = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
        // Confidence per line (its weakest word), so the parser can doubt a misread ₹.
        const lineConf = {}
        for (const line of lines) lineConf[line.text.replace(/\s+/g, "")] = Math.min(...line.words.map((w) => w.confidence))
        const headline = pickHeadline(lines.map((l) => ({ text: l.text, height: l.bbox.y1 - l.bbox.y0 })))
        return { ...parseReceiptText(data.text, data.confidence, lineConf, headline), text: data.text }
      }
      // Greyscale first. Only for what is still missing: a thresholded pass,
      // then a small one for a headline amount too large to be recognised or unclear.
      const passes = [await pass(false)]
      if (readingScore(passes[0]) < 4) passes.push(await pass(true))
      let reading = passes.reduce(mergeReadings)
      // Also when the amount is ambiguous (a ₹ read as a 7 or 3): the small pass
      // often sees the symbol, and mergeReadings settles on the one it confirms.
      if (!reading.amount || reading.amountAlt) {
        passes.push(await pass(false, HEADLINE_WIDTH))
        reading = mergeReadings(reading, passes.at(-1))
      }
      if (ticket === seq.current) callbacks.current.onRead({ ...reading, text: passes.map((p) => p.text.trim()).join("\n\n--- next pass ---\n\n") })
    } catch (e) {
      console.error("screenshot reader", e)
      // A broken worker would fail every later read: end it, start afresh next time.
      const dead = worker
      worker = null
      dead?.then((w) => w.terminate()).catch(() => {})
      if (ticket === seq.current) setError("Could not read that image. Try a clearer one, or type it in.")
    }
    busyRef.current = false
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

  // One target: click, drop or paste. The text says only what to do next.
  const title = busy ? "Reading…" : preview ? "Screenshot read" : "Add a payment screenshot"
  const sub = busy ? "On this device, nothing is uploaded" : preview ? "Click to use another" : "Drop, paste or click. UPI or bank transfer."

  return (
    <div>
      <div className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files?.[0]) }}
          className={cn(
            "squircle relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-dashed p-3 text-left transition-colors",
            over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-subtle",
          )}
        >
          {preview ? (
            <img src={preview} alt="" className="h-12 w-9 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ImageIcon size={20} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{title}</span>
            <span className="block text-xs text-muted-foreground">{sub}</span>
          </span>
          {busy && <span className="text-xs font-medium tabular text-muted-foreground">{Math.round(progress * 100)}%</span>}
          {busy && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/15">
              <span className="block h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          )}
        </button>
        {preview && !busy && (
          <button
            type="button"
            onClick={clear}
            aria-label="Remove screenshot"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { read(e.target.files?.[0]); e.target.value = "" }} />
      {error && <p className="mt-1.5 text-xs text-destructive-text" role="alert">{error}</p>}
    </div>
  )
}
