import { createRef } from "react"
import type { View } from "react-native"

/**
 * Android's blur backend blurs whatever is drawn inside a target view — a view
 * cannot blur its own siblings. So the tab navigator wraps its screens in a
 * `BlurTargetView` carrying this ref, and the floating tab capsule points its
 * `BlurView` at the same one.
 *
 * A module-level ref rather than context: the two live in different trees, and
 * one shared handle is the whole contract.
 */
export const blurTargetRef = createRef<View>()
