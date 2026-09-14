import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowRight, X } from "./Icons"
import { cn } from "../../lib/cn"

// The one full-screen photo viewer, the console's port of the phone's
// ui/ImageViewer.tsx: black ground, contain-fit so nothing is cropped, paging
// with an n/m counter. Opens over a Drawer, so it sits one layer above it
// (z-[60]) and swallows Escape in the capture phase: otherwise the drawer's own
// window listener would close the record underneath at the same time.
//
// Focus moves into the viewer, Tab cycles inside it, and on close it returns to
// whatever opened it (usually the photo that was clicked). Motion is the shared
// fade, which index.css already neutralises under prefers-reduced-motion.
export function ImageViewer({ open, images = [], index = 0, alt = "", onClose, onIndexChange }) {
  const [current, setCurrent] = useState(index)
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const count = images.length

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (open) setCurrent(Math.min(Math.max(index, 0), Math.max(count - 1, 0)))
  }, [open, index, count])

  const go = (step) => {
    if (count < 2) return
    const next = (current + step + count) % count
    setCurrent(next)
    onIndexChange?.(next)
  }
  const goRef = useRef(go)
  useEffect(() => {
    goRef.current = go
  })

  // Keyboard: Esc closes, arrows page, Tab stays inside. Captured on document so
  // a Drawer or Modal beneath never sees these keys.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        e.preventDefault()
        onCloseRef.current?.()
      } else if (e.key === "ArrowRight") {
        e.stopPropagation()
        e.preventDefault()
        goRef.current(1)
      } else if (e.key === "ArrowLeft") {
        e.stopPropagation()
        e.preventDefault()
        goRef.current(-1)
      } else if (e.key === "Tab") {
        const nodes = dialogRef.current?.querySelectorAll("button:not([disabled])")
        if (!nodes?.length) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.body.style.overflow = overflow
      if (opener && typeof opener.focus === "function") opener.focus()
    }
  }, [open])

  if (!open || !count) return null
  const src = images[current]

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Photos of ${alt}` : "Photo viewer"}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-white tabular" aria-live="polite">
        {count > 1 ? `${current + 1} / ${count}` : alt || "Photo"}
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
      >
        <X variant="Linear" className="h-5 w-5" />
      </button>

      <img
        key={src}
        src={src}
        alt={count > 1 ? `${alt || "Photo"} (${current + 1} of ${count})` : alt}
        className="max-h-[calc(100vh-120px)] max-w-[calc(100vw-160px)] select-none object-contain animate-fade-in"
        draggable={false}
      />

      {count > 1 && (
        <>
          <NavButton side="left" label="Previous photo" onClick={() => go(-1)}>
            <ArrowLeft variant="Linear" className="h-5 w-5" />
          </NavButton>
          <NavButton side="right" label="Next photo" onClick={() => go(1)}>
            <ArrowRight variant="Linear" className="h-5 w-5" />
          </NavButton>
        </>
      )}
    </div>,
    document.body,
  )
}

function NavButton({ side, label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      {children}
    </button>
  )
}
