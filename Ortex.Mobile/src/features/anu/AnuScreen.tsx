import React from "react"
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"

import type { EnquiryRow, QuotationRow } from "@/domain/anu"
import { attentionCounts, foundCount, forYouRows, type ForYouRow, type Turn } from "@/domain/anuConversation"
import AnuFace from "@/features/anu/AnuFace"
import { ENGINE_HTML } from "@/features/anu/engineHtml"
import { useAnuSession, type SurfacedCard, type WebViewHandle } from "@/features/anu/useAnuSession"
import { useReducedMotion } from "@/features/home/motion"
import { useCollection } from "@/hooks/useCollection"
import { keyboardTopInWindow } from "@/hooks/useKeyboardAwareScroll"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing, state } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Button, Icon, IconButton, Panel } from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * Anu, full screen: the team's assistant, by voice AND by typing.
 *
 * DESIGN. The idle page follows the console's Anu panel (AnuPanel.jsx, from
 * Asana's AI panel and Apollo's "Ask Apollo"): her face and a "Namaste" greeting,
 * a "For you" list built from the person's own leads and quotations (only rows
 * with something behind them, tap to ask), four "Ask Anu" tiles, and a composer
 * at the foot: "Type a question" beside a primary Talk.
 *
 * Once started, the page is the TRANSCRIPT (ElevenLabs and Hume voice agents,
 * Fireflies AskFred): spoken and typed lines, her replies, each lookup as a step
 * with the records it found as rows that open the record, and a Confirm /
 * Cancel card when she proposes a change. The composer stays ("Type instead of
 * speaking") above mute and a quiet dark Done: a rep in a showroom can type the
 * question and still hear the answer, and a yes can be a tap.
 *
 * KEYBOARD. The composer sits outside any scroll view, so the repo's
 * useKeyboardAwareScroll (which scrolls a focused field inside one) does not
 * apply. Instead the page is lifted by exactly the part of it the keyboard
 * covers, MEASURED rather than assumed: where Android's adjustResize has already
 * shrunk the window that overlap is zero, and on iOS (or if a future Android
 * build goes edge-to-edge) it is the keyboard's height.
 *
 * Rules kept: flat surfaces, no shadow or glow, no em dash in visible text,
 * motion skipped under the OS reduce-motion setting.
 */

// react-native-webview types its component without `ref`, though it forwards one.
const EngineView = WebView as unknown as React.ComponentType<
  React.ComponentProps<typeof WebView> & { ref?: React.Ref<WebViewHandle> }
>

const PHOTO = require("../../../assets/anu.jpg")

// General questions, always offered. Hinglish, as she speaks (the console's four).
const ASK: { label: string; ask: string; icon: IconName }[] = [
  { label: "Is mahine ki sales", ask: "Is mahine sales kaisi chal rahi hai?", icon: "insights" },
  { label: "Pending quotations", ask: "Kaunse quotations decision ka wait kar rahe hain?", icon: "quote" },
  { label: "Customer dhoondo", ask: "Mujhe ek customer dhoondna hai.", icon: "customer" },
  { label: "Price check karo", ask: "Mujhe ek product ka price check karna hai.", icon: "money" },
]

const FOR_YOU_ICON: Record<ForYouRow["key"], IconName> = {
  support: "warning",
  calls: "voice",
  enquiries: "leads",
  expiring: "clock",
  waiting: "quote",
}

const TOOL_ICON: Record<string, IconName> = {
  get_briefing: "clock",
  find_customers: "customer",
  find_enquiries: "leads",
  find_quotations: "quote",
  get_quotation: "quote",
  find_products: "product",
  sales_summary: "insights",
  set_enquiry_status: "tick",
  start_quotation: "quote",
  open_record: "forward",
  cancel: "close",
}

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

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/** A coordinate-origin difference (status bar) is not a keyboard; below this, no lift. */
const LIFT_SLACK = 40

/** How much of this view the keyboard covers, measured in window coordinates. */
function useKeyboardLift(reduced: boolean) {
  const ref = React.useRef<View>(null)
  const [lift, setLift] = React.useState(0)
  const keyboardTop = React.useRef(0)

  const measure = React.useCallback(() => {
    const view = ref.current
    if (!view) return
    if (!keyboardTop.current) {
      setLift(0)
      return
    }
    try {
      view.measureInWindow((_x, y, _w, h) => {
        if (!h || !keyboardTop.current) return
        const overlap = Math.round(y + h - keyboardTop.current)
        setLift(overlap > LIFT_SLACK ? overlap : 0)
      })
    } catch {
      /* detached mid-measure: nothing to lift */
    }
  }, [])

  React.useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    const animate = (e?: KeyboardEvent) => {
      if (reduced || Platform.OS !== "ios") return
      LayoutAnimation.configureNext({
        duration: e?.duration || 250,
        update: { type: LayoutAnimation.Types.keyboard },
      })
    }
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      keyboardTop.current = keyboardTopInWindow(e)
      animate(e)
      requestAnimationFrame(measure)
    })
    const hide = Keyboard.addListener(hideEvent, (e: KeyboardEvent) => {
      keyboardTop.current = 0
      animate(e)
      setLift(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [measure, reduced])

  return { ref, lift, onLayout: measure }
}

export default function AnuScreen({ navigation, route }: StackScreenProps<"Anu">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { profile } = useAuth()
  const anu = useAnuSession(profile)
  const reduced = useReducedMotion()
  const keyboard = useKeyboardLift(reduced)
  const first = (profile?.name || "").trim().split(/\s+/)[0]

  // Opened with a question (from a chip on Home): start straight away.
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
    const target = KIND_ROUTE[card.kind]
    if (!target) return
    feedback.tap()
    anu.hangUp()
    replaceWith(target, { id: card.id })
  }

  const ask = (question: string) => {
    feedback.tap()
    Keyboard.dismiss()
    void anu.start(question)
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
          ? "Conversation ended"
          : anu.status === "error"
            ? "Could not connect"
            : "Your Ortex assistant"

  return (
    <View
      ref={keyboard.ref}
      onLayout={keyboard.onLayout}
      style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top, paddingBottom: keyboard.lift }]}
    >
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
      <View style={[styles.bar, { borderBottomColor: t.divider }]}>
        <IconButton name="close" onPress={close} accessibilityLabel="Close Anu" />
        <View style={styles.barCentre}>
          <View style={styles.titleRow}>
            <Icon name="assistant" size={16} color={t.primary} variant="Bulk" />
            <Text style={[styles.barTitle, { color: t.text }]}>Anu</Text>
          </View>
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            {anu.status === "live" && <View style={[styles.liveDot, { backgroundColor: anu.muted ? t.warning : t.success }]} />}
            <Text style={[textVariants.caption, { color: anu.status === "error" ? t.dangerText : t.textSecondary }]}>{statusLine}</Text>
          </View>
        </View>
        <View style={[styles.clock, { backgroundColor: anu.status === "live" ? t.surfaceInset : "transparent" }]}>
          {anu.status === "live" && <Text style={[styles.clockText, { color: t.text }]}>{clock(anu.seconds)}</Text>}
        </View>
      </View>

      {/* BODY */}
      <View style={styles.body}>
        {anu.status === "idle" ? (
          <Welcome first={first} access={anu.access} ready={anu.ready} onAsk={ask} />
        ) : (
          <Conversation anu={anu} first={first} reduced={reduced} onOpen={openCard} />
        )}
      </View>

      {anu.pendingAction && (
        <View style={[styles.pending, { backgroundColor: t.warningBg, borderTopColor: t.divider }]} accessibilityRole="alert">
          <View style={styles.pendingHead}>
            <View style={[styles.pendingWell, { backgroundColor: t.surface }]}>
              <Icon name="warning" size={18} color={t.warning} variant="Bulk" />
            </View>
            <View style={styles.flex}>
              <Text style={[textVariants.smallStrong, { color: t.warningText }]}>Anu wants to: {anu.pendingAction.title}</Text>
              {!!anu.pendingAction.detail && (
                <Text numberOfLines={2} style={[textVariants.caption, { color: t.warningText }]}>
                  {anu.pendingAction.detail}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.pendingActions}>
            <Button
              label="Confirm"
              size="md"
              fullWidth
              style={styles.flex}
              onPress={() => {
                feedback.tap()
                void anu.confirmAction()
              }}
            />
            <Button
              label="Cancel"
              size="md"
              variant="outline"
              fullWidth
              style={styles.flex}
              onPress={() => {
                feedback.tap()
                anu.cancelAction()
              }}
            />
          </View>
        </View>
      )}

      <Composer anu={anu} bottom={keyboard.lift > 0 ? spacing.sm : insets.bottom + spacing.sm} />
    </View>
  )
}

// ---- idle ----------------------------------------------------------------------

function Welcome({
  first,
  access,
  ready,
  onAsk,
}: {
  first: string
  access: ReturnType<typeof useAnuSession>["access"]
  ready: boolean
  onAsk: (question: string) => void
}) {
  const t = useTheme()
  const wantsData = access.enquiries || access.voice || access.quotations

  return (
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.welcome}>
      <Panel>
        <View style={styles.hero}>
          <AnuFace size={96} status="idle" speaking={false} micLevel={IDLE_LEVEL} outLevel={IDLE_LEVEL} />
          <Text style={[styles.hello, { color: t.text }]}>Namaste{first ? `, ${first}` : ""}</Text>
          <Text style={[textVariants.screenSubtitle, styles.helloSub, { color: t.textSecondary }]}>
            Leads, quotations, customers ya prices: bas poochiye. Main dhoondh ke yahin khol dungi.
          </Text>
        </View>
      </Panel>

      {wantsData && <ForYou access={access} ready={ready} onAsk={onAsk} />}

      <Panel title="Ask Anu" padded>
        <View style={styles.grid}>
          {ASK.map((q) => (
            <Pressable
              key={q.label}
              onPress={() => onAsk(q.ask)}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel={`Ask Anu: ${q.label}`}
              style={({ pressed }) => [styles.tile, { backgroundColor: t.surfaceInset, opacity: pressed ? state.pressedOpacity : 1 }]}
            >
              <Icon name={q.icon} size={20} color={t.primary} variant="Bulk" />
              <Text style={[textVariants.smallStrong, { color: t.text }]}>{q.label}</Text>
            </Pressable>
          ))}
        </View>
      </Panel>

      <Text style={[textVariants.caption, styles.footnote, { color: t.textTertiary }]}>
        Anu reads only what your access allows, and asks before changing anything.
      </Text>
    </ScrollView>
  )
}

const IDLE_LEVEL = new Animated.Value(0)

/** Mounted only when the person can see leads or quotations, so no one fetches what RLS would refuse. */
function ForYou({
  access,
  ready,
  onAsk,
}: {
  access: ReturnType<typeof useAnuSession>["access"]
  ready: boolean
  onAsk: (question: string) => void
}) {
  const t = useTheme()
  const enquiries = useCollection<EnquiryRow>("enquiries")
  const quotations = useCollection<QuotationRow>("quotations")
  const loading = (access.enquiries || access.voice ? enquiries.loading : false) || (access.quotations ? quotations.loading : false)
  const rows = React.useMemo(
    () => forYouRows(attentionCounts({ enquiries: enquiries.items, quotations: quotations.items }, access)),
    [enquiries.items, quotations.items, access],
  )

  const tone = (r: ForYouRow) =>
    r.tone === "danger"
      ? { bg: t.dangerBg, fg: t.danger }
      : r.tone === "warning"
        ? { bg: t.warningBg, fg: t.warning }
        : r.tone === "primary"
          ? { bg: t.primary10, fg: t.primary }
          : { bg: t.surfaceInset, fg: t.textSecondary }

  return (
    <Panel title="For you">
      {loading && !rows.length ? (
        <View style={styles.forYouList}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.skeletonRow, { backgroundColor: t.skeleton }]} />
          ))}
        </View>
      ) : rows.length ? (
        <View style={styles.forYouList}>
          {rows.map((r) => {
            const c = tone(r)
            return (
              <Pressable
                key={r.key}
                onPress={() => onAsk(r.ask)}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityLabel={`${r.text}. Ask Anu`}
                style={({ pressed }) => [styles.forYouRow, { backgroundColor: t.surfaceInset, opacity: pressed ? state.pressedOpacity : 1 }]}
              >
                <View style={[styles.well, { backgroundColor: c.bg }]}>
                  <Icon name={FOR_YOU_ICON[r.key]} size={18} color={c.fg} variant="Bulk" />
                </View>
                <Text style={[textVariants.smallStrong, styles.flex, { color: t.text }]}>{r.text}</Text>
                <Icon name="forward" size={16} color={t.textFaint} />
              </Pressable>
            )
          })}
          <Pressable
            onPress={() => onAsk("Aaj mere liye kya pending hai? Poora briefing do.")}
            disabled={!ready}
            accessibilityRole="button"
            style={({ pressed }) => [styles.fullBriefing, { opacity: pressed ? state.pressedOpacity : 1 }]}
          >
            <Icon name="assistant" size={16} color={t.primary} variant="Bulk" />
            <Text style={[textVariants.smallStrong, { color: t.primary }]}>Full briefing for today</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.forYouRow, styles.forYouEmpty, { backgroundColor: t.surfaceInset }]}>
          <Icon name="tick" size={20} color={t.success} variant="Bulk" />
          <Text style={[textVariants.small, styles.flex, { color: t.textSecondary }]}>Nothing waiting on you right now.</Text>
        </View>
      )}
    </Panel>
  )
}

// ---- conversation ------------------------------------------------------------

type Session = ReturnType<typeof useAnuSession>

function Conversation({ anu, first, reduced, onOpen }: { anu: Session; first: string; reduced: boolean; onOpen: (card: SurfacedCard) => void }) {
  const t = useTheme()
  const scroll = React.useRef<ScrollView>(null)
  // Follow the conversation unless the person has scrolled up to read.
  const stick = React.useRef(true)

  const hint =
    anu.status === "connecting"
      ? "Mic aur Anu ko jod rahe hain"
      : anu.status === "live"
        ? anu.muted
          ? "Mic off hai. Type karke poochiye."
          : "Boliye, ya neeche type kijiye"
        : anu.status === "ended"
          ? `${clock(anu.seconds)} ki baat-cheet${foundCount(anu.turns) ? `, ${foundCount(anu.turns)} records mile` : ""}`
          : ""

  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onScroll={(e) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
        stick.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80
      }}
      scrollEventThrottle={64}
      onContentSizeChange={() => stick.current && scroll.current?.scrollToEnd({ animated: !reduced })}
      contentContainerStyle={styles.transcript}
    >
      <View style={styles.stage}>
        <AnuFace size={60} status={anu.status} speaking={anu.speaking} micLevel={anu.micLevel} outLevel={anu.outLevel} />
        {!!hint && <Text style={[textVariants.caption, { color: t.textSecondary }]}>{hint}</Text>}
      </View>

      {anu.turns.map((turn) => (
        <TurnView key={turn.id} turn={turn} reduced={reduced} onOpen={onOpen} />
      ))}
      {anu.partial?.role === "user" && <UserBubble text={anu.partial.text} partial />}
      {anu.partial?.role === "anu" && <AnuLine text={anu.partial.text} partial />}
      {anu.thinking && anu.partial?.role !== "anu" && anu.status === "live" && <Thinking reduced={reduced} />}
      {anu.status === "live" && !anu.turns.length && !anu.partial && !anu.thinking && (
        <Text style={[textVariants.small, styles.centre, { color: t.textTertiary }]}>
          Anu {first ? `${first} ji` : "aap"} ko greet kar rahi hai
        </Text>
      )}
      {anu.status === "error" && (
        <View style={[styles.errorBox, { backgroundColor: t.dangerBg }]}>
          <Icon name="warning" size={18} color={t.danger} variant="Bulk" />
          <Text style={[textVariants.small, styles.flex, { color: t.dangerText }]}>{anu.error || "Anu abhi nahi mil payi. Phir se try kijiye."}</Text>
        </View>
      )}
    </ScrollView>
  )
}

function TurnView({ turn, reduced, onOpen }: { turn: Turn; reduced: boolean; onOpen: (card: SurfacedCard) => void }) {
  if (turn.role === "user") return <UserBubble text={turn.text} typed={turn.typed} />
  if (turn.role === "anu") return <AnuLine text={turn.text} />
  return <ToolStep turn={turn} reduced={reduced} onOpen={onOpen} />
}

function UserBubble({ text, partial, typed }: { text: string; partial?: boolean; typed?: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.userRow}>
      <View
        style={[styles.userBubble, { backgroundColor: t.primary10, opacity: partial ? 0.6 : 1 }]}
        accessibilityLabel={`You ${typed ? "typed" : "said"}: ${text}`}
      >
        <Text style={[textVariants.body, { color: t.text }]}>{text}</Text>
      </View>
    </View>
  )
}

function AnuLine({ text, partial }: { text: string; partial?: boolean }) {
  const t = useTheme()
  return (
    <View style={styles.anuRow} accessibilityLabel={`Anu: ${text}`}>
      <Image source={PHOTO} style={styles.anuAvatar} />
      <Text style={[textVariants.body, styles.flex, { color: partial ? t.textSecondary : t.text }]}>{text}</Text>
    </View>
  )
}

function ToolStep({ turn, reduced, onOpen }: { turn: Turn; reduced: boolean; onOpen: (card: SurfacedCard) => void }) {
  const t = useTheme()
  const [expanded, setExpanded] = React.useState(false)
  const cards = turn.cards || []
  const shown = expanded ? cards : cards.slice(0, 3)
  const ink = turn.failed ? t.dangerText : t.textSecondary

  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <Icon name={TOOL_ICON[turn.tool || ""] || "search"} size={14} color={turn.failed ? t.danger : t.textTertiary} />
        <Text style={[textVariants.caption, styles.flex, { color: ink }]}>
          {turn.text}
          {typeof turn.count === "number" && <Text style={{ color: t.textTertiary }}> · {turn.count} found</Text>}
        </Text>
      </View>

      {!!turn.stats?.length && (
        <View style={styles.stats}>
          {turn.stats.map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: t.surfaceInset }]}>
              <Text style={[textVariants.caption, { color: t.textSecondary }]}>{s.label}</Text>
              <Text style={[styles.statValue, { color: t.text }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      {cards.length > 0 && (
        <View style={[styles.cards, { borderColor: t.border }]}>
          {shown.map((card, i) => (
            <Pressable
              key={card.key}
              onPress={() => onOpen(card)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${card.title}`}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: pressed ? t.surfacePressed : t.surface },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.divider },
              ]}
            >
              <View style={[styles.well, { backgroundColor: t.surfaceInset }]}>
                <Icon name={KIND_ICON[card.kind] || "info"} size={18} color={t.primary} variant="Bulk" />
              </View>
              <View style={styles.flex}>
                <View style={styles.cardTitleRow}>
                  <Text numberOfLines={1} style={[textVariants.smallStrong, styles.shrink, { color: t.text }]}>
                    {card.title}
                  </Text>
                  {!!card.flag && (
                    <View style={[styles.flag, { backgroundColor: card.flag === "support" ? t.tones.rose.bg : t.tones.amber.bg }]}>
                      <Text style={[textVariants.badgeText, { color: card.flag === "support" ? t.tones.rose.fg : t.tones.amber.fg }]}>
                        {card.flag === "support" ? "Support" : "Urgent"}
                      </Text>
                    </View>
                  )}
                </View>
                {!!card.subtitle && (
                  <Text numberOfLines={1} style={[textVariants.caption, { color: t.textSecondary }]}>
                    {card.subtitle}
                  </Text>
                )}
              </View>
              <Icon name="forward" size={16} color={t.textFaint} />
            </Pressable>
          ))}
          {cards.length > 3 && (
            <Pressable
              onPress={() => {
                if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
                setExpanded((e) => !e)
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.more, { borderTopColor: t.divider, opacity: pressed ? state.pressedOpacity : 1 }]}
            >
              <Text style={[textVariants.captionStrong, { color: t.primary }]}>{expanded ? "Show fewer" : `Show ${cards.length - 3} more`}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

/** Three dots that pulse in turn while Anu looks something up. Still under reduce motion. */
function Thinking({ reduced }: { reduced: boolean }) {
  const t = useTheme()
  const v = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [v, reduced])
  return (
    <View style={styles.thinking}>
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: t.primary,
                opacity: reduced ? 0.6 : v.interpolate({ inputRange: [0, (i + 0.5) / 3, 1], outputRange: [0.25, 1, 0.25] }),
              },
            ]}
          />
        ))}
      </View>
      <Text style={[textVariants.caption, { color: t.textSecondary }]}>Dekh rahi hoon</Text>
    </View>
  )
}

// ---- composer --------------------------------------------------------------

function Composer({ anu, bottom }: { anu: Session; bottom: number }) {
  const t = useTheme()
  const [text, setText] = React.useState("")
  const connecting = anu.status === "connecting"
  const live = anu.status === "live"
  const inCall = connecting || live
  const hasText = !!text.trim()

  const submit = () => {
    const words = text.trim()
    if (!words || connecting) return
    if (live) {
      if (!anu.sendText(words)) return
    } else {
      if (!anu.ready) return
      Keyboard.dismiss()
      void anu.start(words)
    }
    feedback.tap()
    setText("")
  }

  const placeholder = connecting ? "Connecting" : live ? "Type instead of speaking" : "Type a question"

  return (
    <View style={[styles.composer, { borderTopColor: t.divider, backgroundColor: t.background, paddingBottom: bottom }]}>
      <View style={[styles.inputRow, { backgroundColor: t.fieldBg }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={t.textTertiary}
          editable={!connecting}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="send"
          multiline={false}
          maxLength={500}
          selectionColor={t.fieldCursor}
          cursorColor={t.fieldCursor}
          accessibilityLabel="Message Anu"
          style={[styles.input, { color: t.text, opacity: connecting ? 0.6 : 1 }]}
        />
        {hasText ? (
          <Pressable
            onPress={submit}
            disabled={connecting}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [styles.send, { backgroundColor: t.primary, opacity: pressed ? state.pressedOpacity : 1 }]}
          >
            <Icon name="send" size={18} color={t.textOnPrimary} variant="Bold" />
          </Pressable>
        ) : !inCall ? (
          <Pressable
            onPress={() => {
              feedback.tap()
              Keyboard.dismiss()
              void anu.start()
            }}
            disabled={!anu.ready}
            accessibilityRole="button"
            accessibilityLabel="Talk to Anu"
            style={({ pressed }) => [
              styles.talk,
              { backgroundColor: t.primary, opacity: !anu.ready ? 0.5 : pressed ? state.pressedOpacity : 1 },
            ]}
          >
            <Icon name="voice" size={18} color={t.textOnPrimary} variant="Bold" />
            <Text style={[styles.talkText, { color: t.textOnPrimary }]}>
              {anu.status === "ended" ? "Talk again" : anu.status === "error" ? "Try again" : "Talk"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {inCall && (
        <View style={styles.controls}>
          <Pressable
            onPress={() => {
              feedback.tap()
              anu.toggleMute()
            }}
            disabled={!live}
            accessibilityRole="button"
            accessibilityLabel={anu.muted ? "Unmute" : "Mute"}
            accessibilityState={{ selected: anu.muted, disabled: !live }}
            // Light blue while the mic is open, light red while muted, so a closed mic cannot be missed.
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: anu.muted ? t.dangerBg : t.infoBg, opacity: !live ? 0.5 : pressed ? state.pressedOpacity : 1 },
            ]}
          >
            <Icon name={anu.muted ? "voiceOff" : "voice"} size={18} color={anu.muted ? t.danger : t.info} variant="Bold" />
            <Text style={[styles.pillText, { color: anu.muted ? t.dangerText : t.infoText }]}>{anu.muted ? "Unmute" : "Mute"}</Text>
          </Pressable>
          {/* NOT a red hang-up: this is an assistant, not a phone call. A quiet
              dark Done finishes the conversation the way closing a sheet does. */}
          <Pressable
            onPress={() => {
              feedback.tap()
              anu.hangUp()
            }}
            accessibilityRole="button"
            accessibilityLabel="Done, finish talking to Anu"
            style={({ pressed }) => [styles.pill, { backgroundColor: t.text, opacity: pressed ? state.pressedOpacity : 1 }]}
          >
            <Icon name="tick" size={18} color={t.background} variant="Bold" />
            <Text style={[styles.pillText, { color: t.background }]}>Done</Text>
          </Pressable>
        </View>
      )}

      {anu.status === "ended" && (
        <Pressable onPress={anu.reset} accessibilityRole="button" style={({ pressed }) => [styles.reset, { opacity: pressed ? state.pressedOpacity : 1 }]}>
          <Text style={[textVariants.captionStrong, { color: t.primary }]}>Nayi shuruaat</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  centre: { textAlign: "center" },
  engine: { position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, height: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  barCentre: { flex: 1, alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  barTitle: { fontSize: 16, lineHeight: 21, fontFamily: font.semibold },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  clock: { minWidth: 56, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginRight: spacing.xs },
  clockText: { fontSize: 13, fontFamily: font.semibold, fontVariant: ["tabular-nums"] },
  body: { flex: 1 },

  welcome: { paddingBottom: spacing.lg },
  hero: { alignItems: "center", paddingHorizontal: gutter, paddingBottom: spacing.lg },
  hello: { fontSize: 26, lineHeight: 34, fontFamily: font.bold, textAlign: "center", marginTop: -spacing.sm },
  helloSub: { marginTop: spacing.xs, textAlign: "center", maxWidth: 320 },
  forYouList: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.sm },
  forYouRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md },
  forYouEmpty: { marginHorizontal: gutter, marginBottom: spacing.md },
  skeletonRow: { height: 52, borderRadius: radius.md },
  fullBriefing: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40 },
  well: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: "45%", minHeight: 76, padding: 12, borderRadius: radius.md, justifyContent: "space-between", gap: spacing.sm },
  footnote: { textAlign: "center", paddingHorizontal: gutter, paddingTop: spacing.md },

  transcript: { paddingHorizontal: gutter, paddingBottom: spacing.lg, gap: spacing.md },
  stage: { alignItems: "center", paddingTop: spacing.xs, gap: 2 },
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  userBubble: { maxWidth: "85%", borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  anuRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  anuAvatar: { width: 26, height: 26, borderRadius: 13, marginTop: 1 },
  step: { paddingLeft: 36, gap: spacing.sm },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stat: { flexGrow: 1, flexBasis: "45%", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  statValue: { fontSize: 15, lineHeight: 21, fontFamily: font.semibold, fontVariant: ["tabular-nums"] },
  cards: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: "hidden" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  flag: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  more: { alignItems: "center", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 36 },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.md },

  pending: { paddingHorizontal: gutter, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  pendingHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pendingWell: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pendingActions: { flexDirection: "row", gap: spacing.sm },

  composer: { paddingHorizontal: gutter, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, borderRadius: 26, paddingLeft: 18, paddingRight: 6 },
  input: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: font.regular, paddingVertical: Platform.OS === "ios" ? 14 : 8 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  talk: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 20 },
  talkText: { fontSize: 14, fontFamily: font.semibold },
  controls: { flexDirection: "row", gap: spacing.sm },
  pill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 24 },
  pillText: { fontSize: 15, fontFamily: font.semibold },
  reset: { alignSelf: "center", paddingVertical: 4 },
})
