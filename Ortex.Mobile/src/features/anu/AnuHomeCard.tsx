import { useNavigation } from "@react-navigation/native"
import React from "react"
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { canAccess, isAdmin } from "@/domain/modules"
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
      <Pressable
        onPress={() => open()}
        accessibilityRole="button"
        accessibilityLabel="Talk to Anu, your AI assistant"
        style={({ pressed }) => [styles.hero, { opacity: pressed ? state.pressedOpacity : 1 }]}
      >
        <View>
          <Image source={PHOTO} style={styles.face} />
          <View style={[styles.badge, { backgroundColor: t.tones.violet.bg, borderColor: t.surfaceRaised }]}>
            <Icon name="assistant" size={11} color={t.tones.violet.fg} variant="Bold" />
          </View>
        </View>
        <View style={styles.body}>
          <Text style={[styles.name, { color: t.text }]}>Ask Anu</Text>
          <Text style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
            Bolo ya likho, main hoon na
          </Text>
        </View>
        <View style={[styles.mic, { backgroundColor: t.primary }]}>
          <Icon name="voice" size={20} color={t.textOnPrimary} variant="Bold" />
        </View>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.asks}>
        {asks.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => open(a.ask)}
            accessibilityRole="button"
            accessibilityLabel={`Ask Anu: ${a.label}`}
            style={({ pressed }) => [styles.ask, { opacity: pressed ? state.pressedOpacity : 1 }]}
          >
            <SquircleBackground fill={t.surfaceInset} radius={14} />
            <Icon name={a.icon} size={15} color={t.primary} variant="Bulk" />
            <Text style={[styles.askText, { color: t.text }]}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { paddingTop: 14, paddingBottom: 14 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  face: { width: 44, height: 44, borderRadius: 22 },
  badge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20 },
  sub: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  asks: { gap: 8, paddingHorizontal: 16 },
  ask: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  askText: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 16 },
})
