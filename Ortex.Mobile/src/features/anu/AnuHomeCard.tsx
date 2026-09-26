import { useNavigation } from "@react-navigation/native"
import React from "react"
import { Image, Pressable, StyleSheet, Text, View } from "react-native"

import { canAccess, isAdmin } from "@/domain/modules"
import { CardHead } from "@/features/home/homeCards"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { state } from "@/theme/tokens"
import { fontFamily } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import { Card } from "@/ui/OneUi"
import { SquircleBackground } from "@/ui/Squircle"

/**
 * Anu's card on Home (Figma "Ask Anu"): her face, one line on what she does, a
 * round talk button, and three questions that open Anu and ask straight away.
 *
 * The questions are the role's own: Staff cannot open quotes or sales, so they
 * are asked about leave, pay and hours; admins about the business, who is out
 * and what waits on them. Flat card, no shadow or glow, Hinglish to match her
 * voice.
 */

const PHOTO = require("../../../assets/anu.jpg")

type Ask = { label: string; ask: string; icon: IconName }

const SALES: Ask[] = [
  { label: "Aaj kya pending hai?", ask: "Aaj mere liye kya pending hai?", icon: "bell" },
  { label: "Expire hone wale quotes", ask: "Kaunse quotations jaldi expire hone wale hain?", icon: "quote" },
  { label: "Is mahine ki sales", ask: "Is mahine sales kaisi chal rahi hai?", icon: "insights" },
]
const STAFF: Ask[] = [
  { label: "Meri kitni leave bachi hai?", ask: "Meri kitni leave bachi hai?", icon: "calendar" },
  { label: "Salary kab aayegi?", ask: "Meri salary kab aayegi?", icon: "money" },
  { label: "Is hafte mere ghante", ask: "Is hafte maine kitne ghante kaam kiya?", icon: "clock" },
]
const ADMIN: Ask[] = [
  { label: "Aaj ka business kaisa hai?", ask: "Aaj ka business kaisa hai?", icon: "insights" },
  { label: "Aaj kaun absent hai?", ask: "Aaj kaun absent hai?", icon: "team" },
  { label: "Mere pending approvals", ask: "Mere pending approvals kya hain?", icon: "tick" },
]

export default function AnuHomeCard() {
  const t = useTheme()
  const { profile } = useAuth()
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()
  const asks = isAdmin(profile)
    ? ADMIN
    : canAccess(profile, "quotations") || canAccess(profile, "enquiries") || canAccess(profile, "voice-leads")
    ? SALES
    : STAFF

  const open = (ask?: string) => {
    feedback.tap()
    navigation.navigate("Anu", ask ? { ask } : undefined)
  }

  return (
    <Card style={styles.card}>
      <CardHead icon="assistant" tone="violet" title="Ask Anu" />
      <Pressable
        onPress={() => open()}
        accessibilityRole="button"
        accessibilityLabel="Talk to Anu, your AI assistant"
        style={({ pressed }) => [styles.hero, { opacity: pressed ? state.pressedOpacity : 1 }]}
      >
        <Image source={PHOTO} style={styles.face} />
        <View style={styles.body}>
          <Text style={[styles.name, { color: t.text }]}>Bolo ya likho</Text>
          <Text style={[styles.sub, { color: t.textTertiary }]} numberOfLines={1}>
            Main dhoondh deti hoon, aapke access ke hisaab se
          </Text>
        </View>
        <View style={[styles.mic, { backgroundColor: t.primary }]}>
          <Icon name="voice" size={22} color={t.textOnPrimary} variant="Bold" />
        </View>
      </Pressable>

      <View style={styles.asks}>
        {asks.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => open(a.ask)}
            accessibilityRole="button"
            accessibilityLabel={`Ask Anu: ${a.label}`}
            style={({ pressed }) => [styles.ask, { opacity: pressed ? state.pressedOpacity : 1 }]}
          >
            <SquircleBackground fill={t.surfaceInset} radius={18} />
            <Icon name={a.icon} size={16} color={t.primary} variant="Bulk" />
            <Text style={[styles.askText, { color: t.textSecondary }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { paddingTop: 18, paddingBottom: 18 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
  },
  face: { width: 52, height: 52, borderRadius: 26 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 21 },
  sub: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  asks: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 },
  ask: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 9,
  },
  askText: { fontFamily: fontFamily.medium, fontSize: 13.5, lineHeight: 17 },
})
