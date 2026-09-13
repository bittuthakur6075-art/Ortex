import { useNavigation } from "@react-navigation/native"
import React from "react"

import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import IconButton from "@/ui/IconButton"

/**
 * The app bar's way into Anu, beside the bell on every tab root.
 *
 * The AI sparkle (not a microphone: Anu is an assistant you ask things of, and
 * a mic reads as "record"), in the brand blue and Bulk weight so it stands
 * apart from the neutral bell and search beside it.
 */
export default function AnuButton() {
  const t = useTheme()
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()
  return (
    <IconButton
      name="assistant"
      variant="Bulk"
      color={t.primary}
      accessibilityLabel="Ask Anu, your AI assistant"
      onPress={() => {
        feedback.tap()
        navigation.navigate("Anu")
      }}
    />
  )
}
