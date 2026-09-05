import React from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { formatCurrency, relativeTime } from "@/domain/format"
import { stateLabel } from "@/domain/gstStates"
import { ENQUIRY_STATUS, QUOTATION_STATUS, type Enquiry, type Quotation } from "@/domain/schema"
import { useCollection } from "@/hooks/useCollection"
import { callNumber, copy, email as sendEmail, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Avatar, Button, Card, Divider, Icon, IconButton, StatusBadge, useToast } from "@/ui"
import type { CustomerRow } from "@/features/contacts/ContactsScreen"

/** Digits-only comparison, so a `+91` prefix does not hide someone's history. */
const digits = (v?: string) =>
  String(v || "")
    .replace(/\D/g, "")
    .slice(-10)

export default function CustomerDetailScreen({ route, navigation }: StackScreenProps<"CustomerDetail">) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { items: customers } = useCollection<CustomerRow>("customers")
  const { items: quotations } = useCollection<Quotation>("quotations")
  const { items: enquiries } = useCollection<Enquiry>("enquiries")

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

  if (!customer) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: t.bg, paddingTop: insets.top }]}>
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
  const won = theirQuotes.filter((q) => q.status === "accepted" || q.status === "invoiced")
  const lifetime = won.reduce((s, q) => s + (q.totals?.grandTotal || 0), 0)

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <IconButton name="back" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.identity}>
          <Avatar name={name} size="lg" />
          <Text style={[styles.name, { color: t.text }]}>{name}</Text>
          {!!customer.company && customer.company !== name && (
            <Text style={[styles.company, { color: t.textSecondary }]}>{customer.company}</Text>
          )}
        </View>

        <View style={styles.quickRow}>
          <QuickButton
            icon="call"
            label="Call"
            disabled={!hasPhone}
            onPress={() => void callNumber(customer.phone)}
          />
          <QuickButton
            icon="whatsapp"
            label="WhatsApp"
            disabled={!hasPhone}
            onPress={() => void whatsapp(customer.phone)}
          />
          <QuickButton
            icon="mail"
            label="Email"
            disabled={!customer.email}
            onPress={() => void sendEmail(customer.email)}
          />
        </View>

        <Card padding={0} style={styles.card}>
          <DetailRow
            icon="call"
            label="Phone"
            value={hasPhone ? prettyPhone(customer.phone) : "-"}
            onLongPress={
              hasPhone
                ? async () => {
                    await copy(customer.phone)
                    toast.show({ message: "Number copied", tone: "success" })
                  }
                : undefined
            }
          />
          <Divider inset={52} />
          <DetailRow icon="mail" label="Email" value={customer.email || "-"} />
          <Divider inset={52} />
          <DetailRow icon="gst" label="GSTIN" value={customer.gstin || "-"} />
          <Divider inset={52} />
          <DetailRow
            icon="address"
            label="Place of supply"
            value={customer.stateCode ? stateLabel(customer.stateCode) : "Not set"}
          />
          {!!customer.address && (
            <>
              <Divider inset={52} />
              <DetailRow icon="address" label="Address" value={customer.address} />
            </>
          )}
        </Card>

        <View style={styles.statRow}>
          <Stat label="Quotations" value={String(theirQuotes.length)} />
          <Stat label="Accepted" value={String(won.length)} />
          <Stat label="Won value" value={formatCurrency(lifetime, { compact: true })} />
        </View>

        <View style={styles.action}>
          <Button
            label="New quotation"
            icon="quote"
            fullWidth
            onPress={() => {
              feedback.tap()
              navigation.navigate("QuotationEditor", { prefill: { customer } })
            }}
          />
        </View>

        {theirQuotes.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: t.textTertiary }]}>Quotations</Text>
            <Card padding={0} style={styles.card}>
              {theirQuotes.map((q, i) => (
                <View key={q.id}>
                  {i > 0 && <Divider inset={20} />}
                  <Pressable
                    onPress={() => navigation.navigate("QuotationDetail", { id: q.id })}
                    android_ripple={{ color: t.ripple }}
                    style={styles.historyRow}
                  >
                    <View style={styles.historyBody}>
                      <Text style={[styles.historyTitle, { color: t.text }]}>{q.number}</Text>
                      <Text style={[styles.historySub, { color: t.textTertiary }]}>
                        {relativeTime(q.createdAt)}
                      </Text>
                    </View>
                    <Text style={[styles.historyAmount, { color: t.text }]}>
                      {formatCurrency(q.totals?.grandTotal || 0)}
                    </Text>
                    <View style={styles.historyBadge}>
                      <StatusBadge list={QUOTATION_STATUS} id={q.status} small />
                    </View>
                  </Pressable>
                </View>
              ))}
            </Card>
          </>
        )}

        {theirEnquiries.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: t.textTertiary }]}>Enquiries</Text>
            <Card padding={0} style={styles.card}>
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
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function QuickButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "call" | "whatsapp" | "mail"
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.quick,
        { backgroundColor: t.searchBg, opacity: disabled ? 0.35 : pressed ? 0.65 : 1 },
      ]}
    >
      <Icon name={icon} size={20} color={t.accent} variant="Bold" />
      <Text style={[styles.quickLabel, { color: t.textSecondary }]}>{label}</Text>
    </Pressable>
  )
}

function DetailRow({
  icon,
  label,
  value,
  onLongPress,
}: {
  icon: "call" | "mail" | "gst" | "address"
  label: string
  value: string
  onLongPress?: () => void
}) {
  const t = useTheme()
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={320} style={styles.detailRow}>
      <Icon name={icon} size={18} color={t.textTertiary} />
      <View style={styles.detailBody}>
        <Text style={[styles.detailLabel, { color: t.textTertiary }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: t.text }]}>{value}</Text>
      </View>
    </Pressable>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={[styles.stat, { backgroundColor: t.surface }]}>
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.textTertiary }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },
  head: { paddingHorizontal: 12, paddingBottom: 4 },
  content: { paddingHorizontal: 20 },
  identity: { alignItems: "center", paddingTop: 6, paddingBottom: 18 },
  name: { marginTop: 12, fontSize: 22, fontFamily: font.bold },
  company: { marginTop: 2, fontSize: 14, fontFamily: font.regular },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  quick: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 },
  quickLabel: { marginTop: 5, fontSize: 12, fontFamily: font.medium },
  card: { marginBottom: 16 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, paddingVertical: 13 },
  detailBody: { flex: 1, marginLeft: 14 },
  detailLabel: { fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", fontFamily: font.medium },
  detailValue: { marginTop: 2, fontSize: 15, fontFamily: font.medium },
  statRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  stat: { flex: 1, borderRadius: 18, paddingVertical: 14, alignItems: "center" },
  statValue: { fontSize: 18, fontFamily: font.bold },
  statLabel: { marginTop: 2, fontSize: 11.5, fontFamily: font.regular },
  action: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    fontFamily: font.semibold,
  },
  historyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 13 },
  historyBody: { flex: 1 },
  historyTitle: { fontSize: 14.5, fontFamily: font.semibold },
  historySub: { marginTop: 2, fontSize: 12, fontFamily: font.regular },
  historyAmount: { fontSize: 14, marginRight: 10, fontFamily: font.bold },
  historyBadge: {},
})
