import { useNavigation } from "@react-navigation/native"
import React from "react"
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing, state } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import Panel from "@/ui/Panel"

/**
 * Anu's section on Home: her face, one line on what she does, a big "talk" tap
 * target, and three questions a rep asks most often, each of which opens Anu
 * and asks it straight away.
 *
 * On Home rather than only behind the app bar sparkle because a feature nobody
 * sees is a feature nobody uses, and the first screen is where a rep decides
 * how to find something. Flat panel, no shadow or glow, Hinglish copy to match
 * her voice.
 */

const PHOTO = require("../../../assets/anu.jpg")

const ASKS: { label: string; ask: string; icon: IconName }[] = [
  { label: "Aaj kya pending hai?", ask: "Aaj mere liye kya pending hai?", icon: "bell" },
  { label: "Expire hone wale quotes", ask: "Kaunse quotations jaldi expire hone wale hain?", icon: "quote" },
  { label: "Is mahine ki sales", ask: "Is mahine sales kaisi chal rahi hai?", icon: "money" },
]

export default function AnuHomeCard() {
  const t = useTheme()
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()

  const open = (ask?: string) => {
    feedback.tap()
    navigation.navigate("Anu", ask ? { ask } : undefined)
  }

  return (
    <Panel title="AI Assistant">
      <Pressable
        onPress={() => open()}
        accessibilityRole="button"
        accessibilityLabel="Talk to Anu, your AI assistant"
        style={({ pressed }) => [styles.hero, { backgroundColor: t.primary10, opacity: pressed ? state.pressedOpacity : 1 }]}
      >
        <View style={[styles.face, { borderColor: t.surface }]}>
          <Image source={PHOTO} style={styles.faceImg} />
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: t.text }]}>Ask Anu</Text>
            <Icon name="assistant" size={15} color={t.primary} variant="Bulk" />
          </View>
          <Text style={[textVariants.small, { color: t.textSecondary }]} numberOfLines={2}>
            Leads, quotes ya prices, bas boliye.
          </Text>
        </View>
        <View style={[styles.mic, { backgroundColor: t.primary }]}>
          <Icon name="voice" size={22} color={t.textOnPrimary} variant="Bold" />
        </View>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.asks}>
        {ASKS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => open(a.ask)}
            accessibilityRole="button"
            accessibilityLabel={`Ask Anu: ${a.label}`}
            style={({ pressed }) => [styles.ask, { backgroundColor: t.surfaceInset, opacity: pressed ? state.pressedOpacity : 1 }]}
          >
            <Icon name={a.icon} size={15} color={t.primary} variant="Bulk" />
            <Text style={[styles.askText, { color: t.text }]}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Panel>
  )
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: gutter,
    padding: spacing.md,
    borderRadius: 20,
  },
  face: { width: 56, height: 56, borderRadius: 28, overflow: "hidden", borderWidth: 2 },
  faceImg: { width: "100%", height: "100%" },
  body: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 17, lineHeight: 23, fontFamily: font.semibold },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  asks: { gap: spacing.sm, paddingHorizontal: gutter, paddingTop: spacing.md, paddingBottom: spacing.md },
  ask: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill },
  askText: { fontSize: 13, fontFamily: font.medium },
})
