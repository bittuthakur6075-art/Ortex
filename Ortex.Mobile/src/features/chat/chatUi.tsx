import React from "react"
import { Image, StyleSheet, Text, View } from "react-native"

import { peerOf, type Conversation, type Tick } from "@/domain/chat"
import { useTheme } from "@/store/ThemeContext"
import { fontFamily } from "@/theme/typography"
import { Avatar, Icon, type IconName } from "@/ui"

/**
 * The small shared pieces of Team chat on the phone: a conversation's picture
 * (a colleague's photo with a live dot, a group, a team channel, or Anu) and
 * WhatsApp's ticks. The console's pages/chat/parts.jsx, in React Native.
 */

export const ANU_PHOTO = require("../../../assets/anu.jpg")

const TEAM_ICON: Record<string, IconName> = {
  sales: "insights",
  accounts: "money",
  staff: "product",
  management: "lock",
  everyone: "website",
}

export function ConversationAvatar({ conv, meId, online, size = 48 }: { conv: Conversation; meId: string | null; online?: Set<string>; size?: number }) {
  const t = useTheme()
  const round = { width: size, height: size, borderRadius: size / 2 }

  if (conv.kind === "assistant") {
    return (
      <View style={{ width: size, height: size }}>
        <Image source={ANU_PHOTO} style={[round, { backgroundColor: t.primary10 }]} />
        <View style={[styles.aiBadge, { backgroundColor: t.primary, borderColor: t.surface }]}>
          <Text style={[styles.aiText, { color: t.textOnPrimary }]}>AI</Text>
        </View>
      </View>
    )
  }
  if (conv.kind === "team" || conv.kind === "group") {
    const team = conv.kind === "team"
    return (
      <View style={[round, styles.center, { backgroundColor: team ? t.successBg : t.primary10 }]}>
        <Icon name={team ? TEAM_ICON[conv.team || ""] || "customer" : "customer"} size={size * 0.46} color={team ? t.success : t.primary} variant="Bulk" />
      </View>
    )
  }
  const peer = peerOf(conv, meId)
  return <PersonFace name={peer?.name || "?"} uri={peer?.avatar_url || undefined} online={Boolean(peer && online?.has(peer.id))} size={size} />
}

export function PersonFace({ name, uri, online, size = 40 }: { name: string; uri?: string; online?: boolean; size?: number }) {
  const t = useTheme()
  return (
    <View style={{ width: size, height: size }}>
      <Avatar name={name} uri={uri} size={size} />
      {online ? <View style={[styles.dot, { backgroundColor: t.success, borderColor: t.surface }]} /> : null}
    </View>
  )
}

/** One tick sent, two read by everyone, a clock while sending, "!" on failure. */
export function Ticks({ state, color, readColor }: { state: Tick; color: string; readColor: string }) {
  const glyph = state === "pending" ? "◷" : state === "failed" ? "!" : state === "read" ? "✓✓" : "✓"
  return (
    <Text
      accessibilityLabel={state === "read" ? "Read" : state === "pending" ? "Sending" : state === "failed" ? "Not sent" : "Sent"}
      style={[styles.ticks, { color: state === "read" ? readColor : color }]}
    >
      {glyph}
    </Text>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  aiBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  aiText: { fontFamily: fontFamily.bold, fontSize: 9, lineHeight: 11 },
  dot: { position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  ticks: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 14, letterSpacing: -2 },
})
