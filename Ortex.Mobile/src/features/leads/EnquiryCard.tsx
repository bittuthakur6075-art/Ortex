import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { repo } from "@/data/repo"
import { relativeTime } from "@/domain/format"
import { ENQUIRY_STATUS, newLine, type Enquiry } from "@/domain/schema"
import StatusSheet from "@/features/leads/StatusSheet"
import { callNumber, prettyPhone, whatsapp } from "@/lib/contact"
import { feedback } from "@/lib/feedback"
import type { TabScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Button, Card, StatusBadge, useToast } from "@/ui"

/** A typed enquiry — website form, quote calculator, WhatsApp, referral. */
export default function EnquiryCard({
  enquiry,
  navigation,
}: {
  enquiry: Enquiry
  navigation: TabScreenProps<"Leads">["navigation"]
}) {
  const t = useTheme()
  const toast = useToast()
  const [statusOpen, setStatusOpen] = React.useState(false)

  const name = enquiry.customer?.name || enquiry.customer?.company || "Unnamed enquiry"
  const phone = enquiry.customer?.phone
  const hasPhone = !!String(phone || "").replace(/\D/g, "")

  const setStatus = async (status: string) => {
    setStatusOpen(false)
    try {
      await repo.update("enquiries", enquiry.id, { status })
      feedback.created()
      toast.show({ message: `Marked ${status}`, tone: "success" })
    } catch {
      feedback.error()
      toast.show({ message: "Could not update — check your connection", tone: "danger" })
    }
  }

  const quote = () => {
    feedback.tap()
    navigation.navigate("QuotationEditor", {
      prefill: {
        customer: enquiry.customer,
        lines: enquiry.productInterest ? [newLine({ description: enquiry.productInterest })] : undefined,
        notes: enquiry.message ? `Ref: ${enquiry.message}` : undefined,
        enquiryId: enquiry.id,
      },
    })
  }

  return (
    <Card padding={16}>
      <View style={styles.head}>
        <View style={styles.headBody}>
          <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
            {name}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: t.textTertiary }]}>
            {[enquiry.source, hasPhone ? prettyPhone(phone) : null, relativeTime(enquiry.createdAt)]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <StatusBadge list={ENQUIRY_STATUS} id={enquiry.status} />
      </View>

      {!!enquiry.productInterest && (
        <Text numberOfLines={2} style={[styles.interest, { color: t.text }]}>
          {enquiry.productInterest}
        </Text>
      )}
      {!!enquiry.message && (
        <Text numberOfLines={3} style={[styles.message, { color: t.textSecondary }]}>
          {enquiry.message}
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
      <View style={styles.primary}>
        <Button label="Create quotation" icon="quote" size="sm" onPress={quote} fullWidth />
      </View>

      <StatusSheet
        visible={statusOpen}
        current={enquiry.status}
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
  interest: { marginTop: 10, fontSize: 14.5, fontFamily: font.medium },
  message: { marginTop: 5, fontSize: 13.5, lineHeight: 19, fontFamily: font.regular },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  primary: { marginTop: 8 },
})
