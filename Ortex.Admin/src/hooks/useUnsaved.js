import { createContext, useContext, useEffect, useId } from "react"

// The Control centre's one dirty model. Settings.jsx provides `report(id,
// dirty)`; a card embedded there (attendance rules, payroll cards, modules)
// calls useReportUnsaved(dirty) so the page can warn before a section change
// or a reload throws its edits away. Outside the Control centre it does nothing.
export const UnsavedContext = createContext(null)

export function useReportUnsaved(dirty) {
  const report = useContext(UnsavedContext)
  const id = useId()
  useEffect(() => {
    if (!report) return
    report(id, !!dirty)
    return () => report(id, false)
  }, [report, id, dirty])
}
