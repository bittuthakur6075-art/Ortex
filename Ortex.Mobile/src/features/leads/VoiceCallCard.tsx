import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { relativeTime } from "@/domain/format"
import { ENQUIRY_STATUS } from "@/domain/schema"
import { buildQuotationPrefill, type VoiceCall } from "@/domain/voice"
import StatusSheet from "@/features/leads/StatusSheet"
import { callNumber, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Button, Card, Chip, StatusBadge, useToast } from "@/ui"

/**
 * One conversation with Anu, folded from however many `capture_lead` rows it
 * produced. The flags are hints for a human, never a classification the card
 * acts on: a `support` call is one where someone is trying to cancel or
 * complain, and pitching them a quotation is the worst thing this screen could
 * do — so the primary button steps aside for those.
 */
export default function VoiceCallCard({
  call,
  navigation,
}: {
  call: VoiceCall
  navigation: TabScreenProps<"Leads">["navigation"]
}) {
  const t = useTheme()
  const toast = useToast()
  const [statusOpen, setStatusOpen] = React.useState(false)

  const phone = call.customer.phone
  const hasPhone = !!String(phone || "").replace(/\D/g, "")

  // A "call" is several enquiry rows. The console writes the status to every one
  // of them, so the next person to open any single row sees the same truth.
  const setStatus = async (status: string) => {
    setStatusOpen(false)
    try {
      await Promise.all(call.rows.map((r) => repo.update("enquiries", r.id, { status })))
      feedback.created()
      toast.show({ message: `Marked ${status}`, tone: "success" })
    } catch {
      feedback.error()
      toast.show({ message: "Could not update — check your connection", tone: "danger" })
    }
  }

  const quote = () => {
    feedback.tap()
    const prefill = buildQuotationPrefill(call)
    navigation.navigate("QuotationEditor", { prefill })
  }

  return (
    <Card padding={16}>
      <View style={styles.head}>
        <View style={styles.headBody}>
          <Text numberOfLines={1} style={[styles.name, { color: t.text, opacity: call.named ? 1 : 0.75 }]}>
            {call.name}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: t.textTertiary }]}>
            {[
              hasPhone ? prettyPhone(phone) : "No number",
              relativeTime(call.endedAt),
              call.callTotal > 1 ? `Call ${call.callIndex} of ${call.callTotal}` : null,
              call.captures > 1 ? `${call.captures} captures` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <StatusBadge list={ENQUIRY_STATUS} id={call.status} />
      </View>

      {(call.flags.support || call.flags.urgent || call.flags.hugeQty || call.flags.incomplete) && (
        <View style={styles.flags}>
          {call.flags.support && <Chip label="Support, not a lead" tint={t.danger} active small />}
          {call.flags.urgent && <Chip label="Urgent" tint={t.warning} active small />}
          {call.flags.hugeQty && <Chip label="Check quantity" tint={t.warning} active small />}
          {call.flags.incomplete && <Chip label="Missing quantities" tint={t.textTertiary} active small />}
        </View>
      )}

      {call.itemsList.length > 0 ? (
        <View style={styles.items}>
          {call.itemsList.slice(0, 4).map((item, i) => (
            <View key={`${item.product}-${i}`} style={styles.item}>
              <Text numberOfLines={1} style={[styles.itemName, { color: t.text }]}>
                {item.product}
              </Text>
              <Text style={[styles.itemQty, { color: item.quantity ? t.textSecondary : t.warning }]}>
                {item.quantity || "qty?"}
              </Text>
            </View>
          ))}
          {call.itemsList.length > 4 && (
            <Text style={[styles.more, { color: t.textTertiary }]}>+{call.itemsList.length - 4} more</Text>
          )}
        </View>
      ) : (
        !!call.productInterest && (
          <Text numberOfLines={2} style={[styles.interest, { color: t.text }]}>
            {call.productInterest}
          </Text>
        )
      )}

      {!!call.summary && (
        <Text numberOfLines={3} style={[styles.summary, { color: t.textSecondary }]}>
          {call.summary}
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          label="Call"
          icon="call"
          size="sm"
          variant="secondary"
          disabled={!hasPhone}
          onPress={() => void callNumber(phone)}
        />
        <Button
          label="WhatsApp"
          icon="whatsapp"
          size="sm"
          variant="secondary"
          disabled={!hasPhone}
          onPress={() => void whatsapp(phone)}
        />
        <Button label="Status" icon="tick" size="sm" variant="ghost" onPress={() => setStatusOpen(true)} />
      </View>
      {!call.flags.support && (
        <View style={styles.primary}>
          <Button label="Create quotation" icon="quote" size="sm" onPress={quote} fullWidth />
        </View>
      )}

      <StatusSheet
        visible={statusOpen}
        current={call.status}
        onClose={() => setStatusOpen(false)}
        onPick={(id) => void setStatus(id)}
      />
    </Card>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start" },
  headBody: { flex: 1, marginRight: 10 },
  name: { fontSize: 16, fontFamily: font.semibold },
  meta: { marginTop: 3, fontSize: 12.5, fontFamily: font.regular },
  flags: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, marginBottom: -2 },
  items: { marginTop: 10 },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  itemName: { flex: 1, fontSize: 14, fontFamily: font.medium },
  itemQty: { marginLeft: 10, fontSize: 13, fontFamily: font.semibold },
  more: { marginTop: 3, fontSize: 12.5, fontFamily: font.regular },
  interest: { marginTop: 10, fontSize: 14.5, fontFamily: font.medium },
  summary: { marginTop: 8, fontSize: 13.5, lineHeight: 19, fontFamily: font.regular },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  primary: { marginTop: 8 },
})
