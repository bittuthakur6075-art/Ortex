import { useState, useEffect, useRef } from "react"
import { Check, ChevronDown } from "../../components/ui/Icons"

/**
 * Themed dropdown replacing the native <select>, whose option list is
 * OS-rendered and can't be styled to the brand. Click / outside-click / Escape;
 * options highlight in primary on hover and show a check when selected.
 */
export default function SelectField({ id, value, placeholder, options, onChange, invalid }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 bg-[#F9FBFC] border rounded-[20px] [corner-shape:squircle] text-left outline-none transition-colors duration-200 ${
          invalid
            ? "border-destructive"
            : open
              ? "border-primary/70 bg-white"
              : "border-[#EBEDF3] focus:border-primary/70 focus:bg-white"
        }`}
      >
        <span className={value ? "text-foreground" : "text-[#4B5675]"}>{value || placeholder}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          data-lenis-prevent
          className="absolute z-30 mt-2 w-full max-h-72 overflow-auto rounded-[20px] [corner-shape:squircle] border border-[#EBEDF3] bg-white p-1.5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#EBEDF3] [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-width:thin] [scrollbar-color:#EBEDF3_transparent]"
        >
          {options.map((opt) => {
            const selected = value === opt
            return (
              <li
                key={opt}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-[12px] [corner-shape:squircle] text-[16px] font-semibold cursor-pointer transition-colors duration-150 ${
                  selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-primary/10"
                }`}
              >
                {opt}
                {selected && <Check className="h-4 w-4 flex-shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
