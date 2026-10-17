// Motion + formatting shared by the call panel, the minimised pill and the
// launcher. Kept out of the component files so Fast Refresh still works on them.

// The one spring every shape of the widget morphs on (layoutId="anu-morph").
export const MORPH_SPRING = { type: "spring", stiffness: 340, damping: 32 }
export const EASE = [0.16, 1, 0.3, 1]

export function mmss(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}
