import { useEffect, useRef, useState } from "react"
import { Eye } from "../ui/Icons"
import { Button } from "../ui/Ui"
import DocumentSheet from "../documents/DocumentSheet"

// Live, scaled-down render of the real A4 sheet beside the editor form
// (Acctual / Mercury / Airwallex pattern): the document updates as fields
// change, so the user sees what the customer will receive before saving.
// The sheet is laid out at its true 210mm width and scaled with a transform
// to fit the rail; the wrapper's height follows the scaled sheet.
const SHEET_PX = 794 // 210mm at 96dpi

export default function LivePreview({ doc, settings, type, onOpen }) {
  const wrapRef = useRef(null)
  const sheetRef = useRef(null)
  const [scale, setScale] = useState(0.5)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const w = wrap.clientWidth
      const s = Math.min(1, w / SHEET_PX)
      setScale(s)
      setHeight((sheetRef.current?.offsetHeight || 1123) * s)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    if (sheetRef.current) ro.observe(sheetRef.current)
    return () => ro.disconnect()
  }, [doc])

  return (
    <div className="rounded-card bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">Live preview</h3>
          <p className="text-xs text-muted-foreground">Updates as you type · what the customer receives</p>
        </div>
        {onOpen && (
          <Button type="button" variant="outline" size="sm" onClick={onOpen} className="flex-none">
            <Eye className="h-3.5 w-3.5" /> Open
          </Button>
        )}
      </div>
      <div className="bg-muted p-3">
        <div ref={wrapRef} className="relative overflow-hidden rounded-md shadow-md" style={{ height: height || undefined }}>
          <div style={{ width: SHEET_PX, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <DocumentSheet ref={sheetRef} doc={doc} settings={settings} type={type} className="!m-0 !shadow-none" />
          </div>
        </div>
      </div>
    </div>
  )
}
