import React from "react"
import type { TextInput } from "react-native"

/**
 * Next on the keyboard walks a form: spread `chain(i)` on field i and the
 * return key focuses field i + 1; `chain(i, true)` ends with Done. Works on
 * `ui/TextField` because it forwards every other prop (React 19 passes `ref`
 * as one) to its input; typed loosely since TextField's props do not name it.
 */
export function useFocusChain() {
  const refs = React.useRef<(TextInput | null)[]>([])
  return (i: number, last = false) =>
    ({
      ref: (r: TextInput | null) => {
        refs.current[i] = r
      },
      returnKeyType: last ? "done" : "next",
      submitBehavior: last ? "blurAndSubmit" : "submit",
      onSubmitEditing: last ? undefined : () => refs.current[i + 1]?.focus(),
    }) as object
}
