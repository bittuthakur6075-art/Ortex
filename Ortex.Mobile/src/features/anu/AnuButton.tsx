import { useNavigation } from "@react-navigation/native"
import React from "react"

import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import IconButton from "@/ui/IconButton"

/** The app bar's way into Anu, beside the bell on every tab root. */
export default function AnuButton() {
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()
  return (
    <IconButton
      name="voice"
      accessibilityLabel="Talk to Anu, your voice assistant"
      onPress={() => {
        feedback.tap()
        navigation.navigate("Anu")
      }}
    />
  )
}
