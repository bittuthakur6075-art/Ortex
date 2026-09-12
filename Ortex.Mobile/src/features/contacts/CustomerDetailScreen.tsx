import React from "react"
import { Animated, Pressable, Share, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { formatCurrency, relativeTime } from "@/domain/format"
import { stateLabel } from "@/domain/gstStates"
import { ENQUIRY_STATUS, QUOTATION_STATUS, type Enquiry, type Quotation } from "@/domain/schema"
import type { CustomerRow } from "@/features/contacts/ContactsScreen"
import CustomerEditSheet from "@/features/contacts/CustomerEditSheet"
import { useCollection } from "@/hooks/useCollection"
import { callNumber, copy, email as sendEmail, prettyPhone, whatsapp } from "@/lib/contact"
import { toggleFavourite, useFavourites } from "@/lib/favourites"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { border, gutter, radius, size as sizes, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Avatar, Button, Card, Divider, Icon, IconButton, RecordActivityPanel, DetailSkeleton, StatusBadge, useToast } from "@/ui"
import type { IconName } from "@/ui/Icon"

/**
 * The contact card, laid out the way Samsung Contacts lays one out.
 *
 * One UI's contact page is a portrait, not a form: the face and the name own the
 * top of the screen with nothing beside them, a row of round action circles sits
 * directly under the name, and everything factual lives below in grouped cards on
 * a recessed plane. The reason it works is priority — nine times in ten you
 * opened this page to CALL someone, and the call button is the first thing your
 * thumb finds.
 *
 * Samsung's own affordances kept here: the star in the app bar (Favourites, see
 * lib/favourites), share, the tappable info rows — a phone row rings, an email
 * row composes, a long press copies — and the collapsing name, which fades into
 * the app bar as the page scrolls so you never lose track of whose record this is.
 *
 * What Samsung cannot have and this does: the business behind the person. The
 * quotation and enquiry history under the info cards is the reason a salesperson
 * opens a customer at all, and it is matched the console's way — email first,
 * then phone digits, never by name.
 */

/** The distance the name takes to hand over to the app bar title. */
const COLLAPSE = 96

/** Digits-only comparison, so a `+91` prefix does not hide someone's history. */
const digits = (v?: string) =>
  String(v || "")
    .replace(/\D/g, "")
    .slice(-10)

export default function CustomerDetailScreen({ route, navigation }: StackScreenProps<"CustomerDetail">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const favourites = useFavourites()
  const { items: customers, loading } = useCollection<CustomerRow>("customers")
  const { items: quotations } = useCollection<Quotation>("quotations")
  const { items: enquiries } = useCollection<Enquiry>("enquiries")
  const scrollY = React.useRef(new Animated.Value(0)).current
  const [editing, setEditing] = React.useState(false)

  const customer = customers.find((c) => c.id === route.params.id)

  // A quotation snapshots the customer rather than referencing the master row,
  // so history is matched the same way the console's `sameCustomer` does it:
  // email first, then phone digits. Never by name.
  const belongs = React.useCallback(
    (snapshot?: { email?: string; phone?: string }) => {
      if (!customer) return false
      const mail = (customer.email || "").trim().toLowerCase()
      const phone = digits(customer.phone)
      if (mail && (snapshot?.email || "").trim().toLowerCase() === mail) return true
      if (phone && digits(snapshot?.phone) === phone) return true
      return false
    },
    [customer],
  )

  const theirQuotes = React.useMemo(
    () => quotations.filter((q) => belongs(q.customer)),
    [quotations, belongs],
  )
  const theirEnquiries = React.useMemo(
    () => enquiries.filter((e) => belongs(e.customer)),
    [enquiries, belongs],
  )

  if (!customer && loading) {
    return (
      <DetailSkeleton onBack={() => navigation.goBack()} panels={[3, 3, 2]} />
    )
  }

  if (!customer) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <Text style={{ color: t.textSecondary, fontFamily: font.medium }}>
          This contact no longer exists.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button label="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const name = customer.name || customer.company || "Unnamed contact"
  const hasPhone = !!digits(customer.phone)
  const starred = favourites.has(customer.id)
  const won = theirQuotes.filter((q) => q.status === "accepted" || q.status === "invoiced")
  const lifetime = won.reduce((s, q) => s + (q.totals?.grandTotal || 0), 0)

  const barTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE * 0.6, COLLAPSE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  })

  const share = async () => {
    const body = [
      name,
      customer.company,
      hasPhone ? prettyPhone(customer.phone) : "",
      customer.email,
      customer.gstin ? `GSTIN ${customer.gstin}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    try {
      await Share.share({ message: body })
    } catch {
      toast.show({ message: "Could not share", tone: "danger" })
    }
  }

  const copyValue = async (value: string, what: string) => {
    await copy(value)
    toast.show({ message: `${what} copied`, tone: "success" })
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: t.surface,
            borderBottomColor: t.divider,
            paddingTop: insets.top,
            height: insets.top + sizes.appBar,
          },
        ]}
      >
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        <Animated.Text
          numberOfLines={1}
          style={[styles.barTitle, textVariants.appBarTitleBack, { color: t.text, opacity: barTitleOpacity }]}
        >
          {name}
        </Animated.Text>
        <IconButton name="edit" onPress={() => setEditing(true)} accessibilityLabel="Edit contact" />
        <IconButton
          name="star"
          variant={starred ? "Bold" : "Linear"}
          color={starred ? t.warning : t.text}
          accessibilityLabel={starred ? "Remove from favourites" : "Add to favourites"}
          onPress={() => {
            const next = toggleFavourite(customer.id)
            toast.show({
              message: next ? "Added to favourites" : "Removed from favourites",
              tone: "success",
            })
          }}
        />
        <IconButton name="share" onPress={() => void share()} accessibilityLabel="Share contact" />
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Panel>
          <View style={styles.identity}>
            <Avatar name={name} size={96} />
            <Text style={[styles.name, { color: t.text }]}>{name}</Text>
            {!!customer.company && customer.company !== name && (
              <Text style={[styles.company, { color: t.textSecondary }]}>{customer.company}</Text>
            )}
            {!!customer.stateCode && (
              <View style={[styles.place, { backgroundColor: t.surface }]}>
                <Icon name="address" size={13} color={t.textTertiary} variant="Bulk" />
                <Text style={[styles.placeText, { color: t.textSecondary }]}>
                  {stateLabel(customer.stateCode)}
                </Text>
              </View>
            )}
          </View>
        </Panel>

        {/* The round action circles. Samsung's are the page's whole point: one
            thumb-length from the name, and nothing between them and it. */}
        <Panel>
          <View style={styles.quickRow}>
            <QuickAction
              icon="call"
              label="Call"
              tone="blue"
              disabled={!hasPhone}
              onPress={() => void callNumber(customer.phone)}
            />
            <QuickAction
              icon="whatsapp"
              label="WhatsApp"
              tone="emerald"
              disabled={!hasPhone}
              onPress={() => void whatsapp(customer.phone)}
            />
            <QuickAction
              icon="mail"
              label="Email"
              tone="amber"
              disabled={!customer.email}
              onPress={() => void sendEmail(customer.email)}
            />
            <QuickAction
              icon="quote"
              label="Quote"
              tone="primary"
              onPress={() => {
                feedback.tap()
                navigation.navigate("QuotationEditor", { prefill: { customer } })
              }}
            />
          </View>
        </Panel>

        <Panel>
          <InfoRow
            icon="call"
            label="Mobile"
            value={hasPhone ? prettyPhone(customer.phone) : "Not set"}
            onPress={hasPhone ? () => void callNumber(customer.phone) : undefined}
            onLongPress={hasPhone ? () => void copyValue(customer.phone || "", "Number") : undefined}
            action={hasPhone ? { icon: "whatsapp", onPress: () => void whatsapp(customer.phone) } : undefined}
          />
          <Divider inset={56} />
          <InfoRow
            icon="mail"
            label="Email"
            value={customer.email || "Not set"}
            onPress={customer.email ? () => void sendEmail(customer.email) : undefined}
            onLongPress={customer.email ? () => void copyValue(customer.email || "", "Email") : undefined}
          />
          {!!customer.address && (
            <>
              <Divider inset={56} />
              <InfoRow icon="address" label="Address" value={customer.address} />
            </>
          )}
        </Panel>

        <Panel title="Business">
          <InfoRow
            icon="gst"
            label="GSTIN"
            value={customer.gstin || "Not set"}
            onLongPress={customer.gstin ? () => void copyValue(customer.gstin || "", "GSTIN") : undefined}
          />
          <Divider inset={56} />
          <InfoRow
            icon="address"
            label="Place of supply"
            value={customer.stateCode ? stateLabel(customer.stateCode) : "Not set"}
          />
        </Panel>

        <Panel>
          <View style={styles.statRow}>
            <Stat label="Quotations" value={String(theirQuotes.length)} />
            <Stat label="Accepted" value={String(won.length)} />
            <Stat label="Won value" value={formatCurrency(lifetime, { compact: true })} />
          </View>
        </Panel>

        {theirQuotes.length > 0 && (
          <>
            <Panel title="Quotations">
              {theirQuotes.map((q, i) => (
                <View key={q.id}>
                  {i > 0 && <Divider inset={68} />}
                  <Pressable
                    onPress={() => navigation.navigate("QuotationDetail", { id: q.id })}
                    android_ripple={{ color: t.accentTint }}
                    style={styles.historyRow}
                  >
                    <View style={[styles.historyWell, { backgroundColor: t.iconWell }]}>
                      <Icon name="quote" size={18} color={t.primary} variant="Bulk" />
                    </View>
                    <View style={styles.historyBody}>
                      <Text style={[styles.historyTitle, { color: t.text }]}>{q.number}</Text>
                      <Text style={[styles.historySub, { color: t.textTertiary }]}>
                        {relativeTime(q.createdAt)}
                      </Text>
                    </View>
                    <View style={styles.historyEnd}>
                      <Text style={[styles.historyAmount, { color: t.text }]}>
                        {formatCurrency(q.totals?.grandTotal || 0)}
                      </Text>
                      <StatusBadge list={QUOTATION_STATUS} id={q.status} small />
                    </View>
                  </Pressable>
                </View>
              ))}
            </Panel>
          </>
        )}

        {theirEnquiries.length > 0 && (
          <>
            <Panel title="Enquiries">
              {theirEnquiries.map((e, i) => (
                <View key={e.id}>
                  {i > 0 && <Divider inset={20} />}
                  <View style={styles.historyRow}>
                    <View style={styles.historyBody}>
                      <Text numberOfLines={1} style={[styles.historyTitle, { color: t.text }]}>
                        {e.productInterest || e.source || "Enquiry"}
                      </Text>
                      <Text style={[styles.historySub, { color: t.textTertiary }]}>
                        {relativeTime(e.createdAt)}
                      </Text>
                    </View>
                    <StatusBadge list={ENQUIRY_STATUS} id={e.status} small />
                  </View>
                </View>
              ))}
            </Panel>
          </>
        )}

        {/* Who created this contact and who has edited it since — a changed
            GSTIN or address needs a name against it. */}
        <RecordActivityPanel collection="customers" record={customer} />
      </Animated.ScrollView>
      <CustomerEditSheet visible={editing} customer={customer} onClose={() => setEditing(false)} />
    </View>
  )
}

/**
 * A section of the page: full-bleed on `surface`, no radius and no border, with
 * a 2dp band of `colors.border` beneath it. Capnix's panel language (see
 * ui/Section.tsx) — the SEPARATION is the boundary, so a rounded card floating on
 * a page of the same colour would draw it twice.
 */
function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  const t = useTheme()
  return (
    <>
      <View style={{ backgroundColor: t.surface }}>
        {!!title && <Text style={[styles.sectionLabel, { color: t.textTertiary }]}>{title}</Text>}
        {children}
      </View>
      <View style={[styles.band, { backgroundColor: t.border }]} />
    </>
  )
}

function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  icon: IconName
  label: string
  onPress: () => void
  disabled?: boolean
  tone?: StatusTone | "primary"
}) {
  const t = useTheme()
  const fill = tone === "primary" ? t.primary : t.tones[tone].fg
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.quick, { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 }]}
    >
      <View style={[styles.quickCircle, { backgroundColor: fill }]}>
        <Icon name={icon} size={22} color={t.textOnPrimary} variant="Bold" />
      </View>
      <Text style={[styles.quickLabel, { color: t.text }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * A fact, and what you can do with it. The row itself performs the obvious verb
 * (ring the number, compose to the address); the trailing circle carries the
 * second one, which is how Samsung fits "call" and "message" onto one line.
 */
function InfoRow({
  icon,
  label,
  value,
  onPress,
  onLongPress,
  action,
}: {
  icon: IconName
  label: string
  value: string
  onPress?: () => void
  onLongPress?: () => void
  action?: { icon: IconName; onPress: () => void }
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      android_ripple={onPress ? { color: t.accentTint } : undefined}
      style={({ pressed }) => [styles.infoRow, { opacity: pressed && onPress ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={20} color={t.textTertiary} variant="Bulk" />
      <View style={styles.infoBody}>
        <Text style={[styles.infoLabel, { color: t.textTertiary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: t.text }]}>{value}</Text>
      </View>
      {action && (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${label} on WhatsApp`}
          style={({ pressed }) => [
            styles.infoAction,
            { backgroundColor: t.surfaceInset, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name={action.icon} size={19} color={t.success} variant="Bulk" />
        </Pressable>
      )}
    </Pressable>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <Card padding={0} squircle squircleRadius={16} style={styles.stat}>
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.textTertiary }]}>{label}</Text>
    </Card>
  )
}


const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },
  // The first panel under this bar is white, so the bar needs the divider
  // hairline to have an edge at all. A bar over a grey plane draws none.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: border.hairline,
  },
  barTitle: { flex: 1, marginHorizontal: 4 },
  // Full bleed: the page is a stack of panels separated by 2dp bands, so only
  // the panels themselves carry the gutter.
  content: { paddingTop: 0 },
  band: { height: 2 },

  identity: {
    alignItems: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: gutter,
  },
  name: { marginTop: 14, fontSize: 25, lineHeight: 32, textAlign: "center", fontFamily: font.bold },
  company: { marginTop: 3, fontSize: 15, textAlign: "center", fontFamily: font.regular },
  place: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  placeText: { fontSize: 12.5, fontFamily: font.medium },

  quickRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
  },
  quick: { alignItems: "center", width: 76 },
  quickCircle: {
    width: 76,
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { marginTop: 7, fontSize: 12, fontFamily: font.semibold },

  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingHorizontal: gutter,
    paddingTop: gutter,
    paddingBottom: spacing.sm,
    fontFamily: font.semibold,
  },

  infoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingVertical: 14 },
  infoBody: { flex: 1, marginLeft: 16, minWidth: 0 },
  infoLabel: { fontSize: 12, fontFamily: font.semibold, textTransform: "uppercase", letterSpacing: 0.3 },
  infoValue: { marginTop: 3, fontSize: 16, lineHeight: 21, fontFamily: font.medium },
  infoAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },

  statRow: { flexDirection: "row", gap: 10, paddingHorizontal: gutter, paddingVertical: spacing.md },
  stat: { flex: 1, paddingVertical: 16, alignItems: "center" },
  statValue: { fontSize: 18, fontFamily: font.bold },
  statLabel: { marginTop: 3, fontSize: 11.5, fontFamily: font.regular },

  historyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingVertical: 14 },
  historyWell: {
    width: 38,
    height: 38,
    borderRadius: 12,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  historyBody: { flex: 1 },
  historyTitle: { fontSize: 14.5, fontFamily: font.semibold },
  historySub: { marginTop: 2, fontSize: 12, fontFamily: font.regular },
  historyEnd: { alignItems: "flex-end", gap: 5, marginLeft: 10 },
  historyAmount: { fontSize: 14, fontFamily: font.bold },
})
