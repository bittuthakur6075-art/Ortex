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
 * The questions are ones her tools can answer for that person: sales and
 * admins about leads, quotes and the month; everyone else what she can do, plus
 * the catalogue or customers when they hold those modules. Flat card, no shadow
 * or glow, Hinglish to match her voice.
 */

const PHOTO = require("../../../assets/anu.jpg")

type Ask = { label: string; ask: string; icon: IconName }

const SALES: Ask[] = [
  { label: "Aaj kya pending hai?", ask: "Aaj mere liye kya pending hai?", icon: "bell" },
  { label: "Expire hone wale quotes", ask: "Kaunse quotations jaldi expire hone wale hain?", icon: "quote" },
  { label: "Is mahine ki sales", ask: "Is mahine sales kaisi chal rahi hai?", icon: "insights" },
]
// Without lead or quote access Anu can only search the catalogue and customers,
// so each of those asks shows only with its module; the help ask always does.
const HELP: Ask = { label: "Anu kya kar sakti hai?", ask: "Tum mere liye kya kya kar sakti ho?", icon: "assistant" }
const PRODUCTS: Ask = { label: "Lanyard ka rate", ask: "Satin lanyard ka rate kya hai?", icon: "product" }
const CUSTOMERS: Ask = { label: "Customer dhoondo", ask: "Mujhe ek customer dhoondna hai", icon: "customer" }
const ADMIN: Ask[] = [
  { label: "Aaj kya pending hai?", ask: "Aaj kya pending hai?", icon: "bell" },
  { label: "Is mahine ki sales", ask: "Is mahine sales kaisi chal rahi hai?", icon: "insights" },
  { label: "Expire hone wale quotes", ask: "Kaunse quotations jaldi expire hone wale hain?", icon: "quote" },
]

export default function AnuHomeCard() {
  const t = useTheme()
  const { profile } = useAuth()
  const navigation = useNavigation<StackScreenProps<"Tabs">["navigation"]>()
  const asks = isAdmin(profile)
    ? ADMIN
    : canAccess(profile, "quotations") || canAccess(profile, "enquiries") || canAccess(profile, "voice-leads")
    ? SALES
    : [HELP, ...(canAccess(profile, "products") ? [PRODUCTS] : []), ...(canAccess(profile, "customers") ? [CUSTOMERS] : [])]

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
