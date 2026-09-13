import React from "react"
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"

import AnuFace from "@/features/anu/AnuFace"
import { ENGINE_HTML } from "@/features/anu/engineHtml"
import { useAnuSession, type SurfacedCard, type WebViewHandle } from "@/features/anu/useAnuSession"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing, state } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Icon, IconButton } from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * Anu, full screen: the team's voice assistant.
 *
 * DESIGN, from Mobbin references (2026-09-13):
 *   · Shop's "Sol": the assistant's face and a greeting set in large type, as
 *     the whole idle page, instead of a chat log waiting to be filled.
 *   · Cleo and Tiimo: tap-to-ask suggestion chips under the greeting, so the
 *     first question costs one tap and teaches what she can do.
 *   · Gemini Live and Meta AI: while live, the caption IS the content, large
 *     and centred, with the clock at the top and a pill of controls at the foot
 *     (mute, and a quiet dark Done rather than a red hang-up: this is an
 *     assistant, not a phone call).
 *   · ChatGPT Voice: one centred visual that reacts to sound, nothing else
 *     moving on the page.
 * Ortex's own additions: the records Anu mentions surface as tappable cards
 * ("Anu found"), because a rep who hears "Sharma's quote is ₹48,000" usually
 * wants to open it next; and a record or draft she opens replaces this screen
 * the moment the call ends.
 *
 * Rules kept: flat surfaces, no shadow or glow, no em dash in any visible text,
 * native-driver motion throughout.
 */

// react-native-webview types its component without `ref`, though it forwards one.
const EngineView = WebView as unknown as React.ComponentType<
  React.ComponentProps<typeof WebView> & { ref?: React.Ref<WebViewHandle> }
>

const SUGGESTIONS: { label: string; ask: string; icon: IconName }[] = [
  { label: "Aaj kya pending hai?", ask: "Aaj mere liye kya pending hai?", icon: "bell" },
  { label: "Is hafte ke new leads", ask: "Is hafte ke new leads batao.", icon: "leads" },
  { label: "Expire hone wale quotes", ask: "Kaunse quotations jaldi expire hone wale hain?", icon: "quote" },
  { label: "Is mahine ki sales", ask: "Is mahine sales kaisi chal rahi hai?", icon: "money" },
  { label: "Customer dhoondo", ask: "Mujhe ek customer dhoondna hai.", icon: "customer" },
  { label: "Price check karo", ask: "Mujhe ek product ka price check karna hai.", icon: "product" },
]

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

const KIND_ICON: Record<string, IconName> = {
  quotation: "quote",
  customer: "customer",
  enquiry: "enquiry",
  voice_call: "voice",
  product: "product",
}

const KIND_ROUTE: Record<string, "QuotationDetail" | "CustomerDetail" | "EnquiryDetail" | "VoiceCallDetail" | "ProductDetail"> = {
  quotation: "QuotationDetail",
  customer: "CustomerDetail",
  enquiry: "EnquiryDetail",
  voice_call: "VoiceCallDetail",
  product: "ProductDetail",
}

export default function AnuScreen({ navigation, route }: StackScreenProps<"Anu">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { profile } = useAuth()
  const anu = useAnuSession(profile)
  const first = (profile?.name || "").trim().split(/\s+/)[0]

  const live = anu.status === "connecting" || anu.status === "live"
  const started = anu.status !== "idle"

  // The face shrinks and rises once the call starts, so the captions own the
  // middle of the page: one spring, native driver.
  const stage = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    Animated.spring(stage, { toValue: started ? 1 : 0, damping: 22, stiffness: 180, mass: 0.9, useNativeDriver: true }).start()
  }, [started, stage])
  const faceScale = stage.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] })

  // Captions fade in on each new line rather than snapping.
  const captionFade = React.useRef(new Animated.Value(1)).current
  const lastAnu = [...anu.captions].reverse().find((c) => c.role === "anu")
  const lastUser = [...anu.captions].reverse().find((c) => c.role === "user")
  const anuLine = anu.partial?.role === "anu" ? anu.partial.text : lastAnu?.text || ""
  const userLine = anu.partial?.role === "user" ? anu.partial.text : lastUser?.text || ""
  const lineKey = lastAnu?.id ?? 0
  React.useEffect(() => {
    captionFade.setValue(0.2)
    Animated.timing(captionFade, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [lineKey, captionFade])

  // Opened with a question (from a chip elsewhere): start straight away.
  const autoAsk = route.params?.ask
  const asked = React.useRef(false)
  React.useEffect(() => {
    if (anu.ready && autoAsk && !asked.current) {
      asked.current = true
      void anu.start(autoAsk)
    }
  }, [anu.ready, autoAsk, anu])

  // The routes Anu opens take different params; the call sites guarantee the pairing.
  const replaceWith = (name: string, params?: object) =>
    (navigation.replace as unknown as (n: string, p?: object) => void)(name, params)

  // A record or draft Anu opened replaces this screen once the call is over.
  React.useEffect(() => {
    if ((anu.status === "ended" || anu.status === "error") && anu.pending) {
      const target = anu.pending
      replaceWith(target.name, target.params)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anu.status, anu.pending])

  const close = () => {
    anu.hangUp()
    navigation.goBack()
  }

  const openCard = (card: SurfacedCard) => {
    feedback.tap()
    anu.hangUp()
    replaceWith(KIND_ROUTE[card.kind], { id: card.id })
  }

  const statusLine =
    anu.status === "connecting"
      ? "Connecting"
      : anu.status === "live"
        ? anu.speaking
          ? "Speaking"
          : anu.thinking
            ? "Looking it up"
            : anu.muted
              ? "Muted"
              : "Listening"
        : anu.status === "ended"
          ? `Conversation ended · ${clock(anu.seconds)}`
          : anu.status === "error"
            ? "Could not connect"
            : "Your Ortex assistant"

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      {/* The engine: invisible, but mounted for the life of the screen. */}
      <View style={styles.engine} pointerEvents="none">
        <EngineView
          ref={anu.webRef}
          source={{ html: ENGINE_HTML, baseUrl: "https://anu.ortex.app/" }}
          originWhitelist={["*"]}
          onMessage={anu.onMessage}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grant"
          webviewDebuggingEnabled={__DEV__}
        />
      </View>

      {/* TOP BAR */}
      <View style={styles.bar}>
        <IconButton name="close" onPress={close} accessibilityLabel="Close Anu" />
        <View style={styles.barCentre}>
          <View style={styles.titleRow}>
            <Icon name="assistant" size={16} color={t.primary} variant="Bulk" />
            <Text style={[styles.barTitle, { color: t.text }]}>Anu</Text>
          </View>
          <View style={styles.statusRow}>
            {anu.status === "live" && <View style={[styles.liveDot, { backgroundColor: anu.muted ? t.warning : t.success }]} />}
            <Text style={[textVariants.caption, { color: anu.status === "error" ? t.dangerText : t.textSecondary }]}>{statusLine}</Text>
          </View>
        </View>
        <View style={[styles.clock, { backgroundColor: anu.status === "live" ? t.surfaceInset : "transparent" }]}>
          {anu.status === "live" && <Text style={[styles.clockText, { color: t.text }]}>{clock(anu.seconds)}</Text>}
        </View>
      </View>

      {/* STAGE */}
      <View style={styles.stage}>
        <Animated.View style={{ transform: [{ scale: faceScale }] }}>
          <AnuFace size={132} status={anu.status} speaking={anu.speaking} micLevel={anu.micLevel} outLevel={anu.outLevel} />
        </Animated.View>

        {!started ? (
          <View style={styles.greeting}>
            <Text style={[styles.hello, { color: t.text }]}>
              Hi{first ? ` ${first}` : ""}, I'm <Text style={{ color: t.primary }}>Anu</Text>.
            </Text>
            <Text style={[textVariants.screenSubtitle, styles.helloSub, { color: t.textSecondary }]}>
              Leads, quotations, customers ya products, kuch bhi puchiye. Main aapka live Ortex data dekhkar batati hoon.
            </Text>
          </View>
        ) : anu.status === "error" ? (
          <View style={styles.greeting}>
            <Text style={[styles.errorTitle, { color: t.text }]}>Anu is not available</Text>
            <Text style={[textVariants.screenSubtitle, styles.helloSub, { color: t.textSecondary }]}>{anu.error}</Text>
          </View>
        ) : (
          <Animated.View style={[styles.captions, { opacity: captionFade }]}>
            {!!userLine && (
              <Text numberOfLines={2} style={[styles.userLine, { color: t.textTertiary }]}>
                {userLine}
              </Text>
            )}
            <Text
              numberOfLines={10}
              // A briefing runs long: step the type down rather than cut it mid-sentence.
              style={[styles.anuLine, anuLine.length > 140 && styles.anuLineLong, { color: t.text }]}
            >
              {anuLine ||
                (anu.status === "connecting"
                  ? "Anu se connect ho raha hai"
                  : anu.status === "ended"
                    ? "Jab bhi zarurat ho, phir se baat kariye."
                    : "Boliye, main sun rahi hoon.")}
            </Text>
            {anu.thinking && anu.status === "live" && <ThinkingDots />}
          </Animated.View>
        )}
      </View>

      {/* SUGGESTIONS or FOUND RECORDS */}
      {!live && anu.status !== "ended" ? (
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s.label}
              onPress={() => {
                feedback.tap()
                void anu.start(s.ask)
              }}
              disabled={!anu.ready}
              style={({ pressed }) => [styles.chip, { backgroundColor: t.surfaceInset, opacity: pressed ? state.pressedOpacity : 1 }]}
              accessibilityRole="button"
            >
              <Icon name={s.icon} size={15} color={t.primary} variant="Bulk" />
              <Text style={[styles.chipText, { color: t.text }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : anu.cards.length > 0 ? (
        <View>
          <Text style={[styles.foundLabel, { color: t.textTertiary }]}>ANU FOUND</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {anu.cards.map((card) => (
              <Pressable
                key={card.key}
                onPress={() => openCard(card)}
                style={({ pressed }) => [styles.card, { backgroundColor: t.surfaceInset, opacity: pressed ? state.pressedOpacity : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${card.title}`}
              >
                <View style={[styles.cardWell, { backgroundColor: t.surface }]}>
                  <Icon name={KIND_ICON[card.kind] || "info"} size={16} color={t.primary} variant="Bulk" />
                </View>
                <View style={styles.cardBody}>
                  <Text numberOfLines={1} style={[styles.cardTitle, { color: t.text }]}>
                    {card.title}
                  </Text>
                  <Text numberOfLines={1} style={[textVariants.caption, { color: t.textSecondary }]}>
                    {card.subtitle}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* CONTROLS */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
        {live ? (
          <>
            <Pressable
              onPress={() => {
                feedback.tap()
                anu.toggleMute()
              }}
              disabled={anu.status !== "live"}
              style={({ pressed }) => [
                styles.round,
                { backgroundColor: anu.muted ? t.text : t.surfaceInset, opacity: pressed ? state.pressedOpacity : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={anu.muted ? "Unmute" : "Mute"}
            >
              <Icon name={anu.muted ? "voiceOff" : "voice"} size={24} color={anu.muted ? t.background : t.text} variant="Bold" />
            </Pressable>
            {/* NOT a red hang-up: this is an assistant, not a phone call. ChatGPT
                Voice and Claude close a voice session with a quiet dark control,
                so "Done" finishes the conversation the way closing a sheet does. */}
            <Pressable
              onPress={() => {
                feedback.tap()
                anu.hangUp()
              }}
              style={({ pressed }) => [styles.done, { backgroundColor: t.text, opacity: pressed ? state.pressedOpacity : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Done, finish talking to Anu"
            >
              <Icon name="tick" size={22} color={t.background} variant="Bold" />
              <Text style={[styles.doneText, { color: t.background }]}>Done</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => {
              feedback.tap()
              void anu.start()
            }}
            disabled={!anu.ready}
            style={({ pressed }) => [
              styles.talk,
              { backgroundColor: t.primary, opacity: !anu.ready ? 0.5 : pressed ? state.pressedOpacity : 1 },
            ]}
            accessibilityRole="button"
          >
            <Icon name="voice" size={22} color={t.textOnPrimary} variant="Bold" />
            <Text style={[styles.talkText, { color: t.textOnPrimary }]}>
              {anu.status === "ended" ? "Talk again" : anu.status === "error" ? "Try again" : "Talk to Anu"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

/** Three dots that pulse in turn while Anu runs a lookup. */
function ThinkingDots() {
  const t = useTheme()
  const v = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [v])
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: t.primary,
              opacity: v.interpolate({
                inputRange: [0, (i + 0.5) / 3, 1],
                outputRange: [0.25, 1, 0.25],
              }),
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  engine: { position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, height: 56 },
  barCentre: { flex: 1, alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  barTitle: { fontSize: 16, lineHeight: 21, fontFamily: font.semibold },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  clock: { minWidth: 56, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginRight: spacing.xs },
  clockText: { fontSize: 13, fontFamily: font.semibold, fontVariant: ["tabular-nums"] },

  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: gutter },
  greeting: { alignItems: "center", marginTop: spacing.md },
  hello: { fontSize: 30, lineHeight: 38, fontFamily: font.bold, textAlign: "center" },
  helloSub: { marginTop: spacing.sm, textAlign: "center", maxWidth: 320 },
  errorTitle: { fontSize: 22, lineHeight: 30, fontFamily: font.semibold, textAlign: "center" },
  captions: { alignItems: "center", marginTop: spacing.xs, minHeight: 150, width: "100%" },
  userLine: { fontSize: 15, lineHeight: 21, fontFamily: font.regular, textAlign: "center", marginBottom: spacing.sm },
  anuLine: { fontSize: 22, lineHeight: 31, fontFamily: font.medium, textAlign: "center" },
  anuLineLong: { fontSize: 18, lineHeight: 26 },
  dots: { flexDirection: "row", gap: 6, marginTop: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 4 },

  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.lg },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: radius.pill },
  chipText: { fontSize: 13.5, fontFamily: font.medium },

  foundLabel: { fontSize: 11.5, letterSpacing: 0.4, fontFamily: font.semibold, paddingHorizontal: gutter, marginBottom: spacing.sm },
  cards: { gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.lg },
  card: { flexDirection: "row", alignItems: "center", gap: 10, width: 236, padding: 12, borderRadius: 16 },
  cardWell: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, lineHeight: 19, fontFamily: font.semibold },

  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: gutter, paddingTop: spacing.sm },
  round: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  done: { flexDirection: "row", alignItems: "center", gap: 8, height: 64, paddingHorizontal: 34, borderRadius: 32 },
  doneText: { fontSize: 16, fontFamily: font.semibold },
  talk: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 58, borderRadius: 29 },
  talkText: { fontSize: 16, fontFamily: font.semibold },
})
