import React from "react"
import { FlatList, StyleSheet, View } from "react-native"

import { canAccess } from "@/domain/modules"
import { VOICE_SOURCE, voiceCallsFrom, type VoiceCall } from "@/domain/voice"
import type { Enquiry } from "@/domain/schema"
import EnquiryCard from "@/features/leads/EnquiryCard"
import VoiceCallCard from "@/features/leads/VoiceCallCard"
import { useCollection } from "@/hooks/useCollection"
import type { TabScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { EmptyState, IconButton, ScreenHeader, SearchField, SegmentedControl, Skeleton } from "@/ui"
import { TAB_BAR_HEIGHT } from "@/ui/Fab"

// Enquiries and voice calls read the SAME `enquiries` collection — a voice lead
// is just a row tagged with VOICE_SOURCE. The console splits them into two tabs
// of one hub for that reason, and so does this screen.

type Tab = "enquiries" | "voice"

export default function LeadsScreen({ navigation }: TabScreenProps<"Leads">) {
  const t = useTheme()
  const { profile } = useAuth()
  const { items, loading } = useCollection<Enquiry>("enquiries")
  const [query, setQuery] = React.useState("")

  const canEnquiries = canAccess(profile, "enquiries")
  const canVoice = canAccess(profile, "voice-leads")
  const [tab, setTab] = React.useState<Tab>(canEnquiries ? "enquiries" : "voice")

  const segments = React.useMemo(
    () =>
      [
        canEnquiries ? { key: "enquiries" as const, label: "Enquiries" } : null,
        canVoice ? { key: "voice" as const, label: "Voice calls" } : null,
      ].filter(Boolean) as { key: Tab; label: string }[],
    [canEnquiries, canVoice],
  )

  // Typed enquiries: everything that did not come from the voice assistant.
  const enquiries = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((e) => e.source !== VOICE_SOURCE)
      .filter((e) => {
        if (!q) return true
        return [
          e.customer?.name,
          e.customer?.company,
          e.customer?.phone,
          e.productInterest,
          e.message,
          e.source,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      })
      .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
  }, [items, query])

  const calls = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = voiceCallsFrom(items)
    if (!q) return all
    return all.filter((c: VoiceCall) =>
      [
        c.name,
        c.customer.phone,
        c.customer.company,
        c.productInterest,
        c.quantity,
        c.timeline,
        c.summary,
        ...c.itemsList.map((i) => `${i.product} ${i.quantity}`),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [items, query])

  const showingVoice = tab === "voice"
  const count = showingVoice ? calls.length : enquiries.length

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <ScreenHeader
        title="Leads"
        subtitle={loading ? "Loading…" : showingVoice ? `${count} calls` : `${count} enquiries`}
        trailing={
          <IconButton
            name="profile"
            onPress={() => navigation.navigate("Profile")}
            accessibilityLabel="Profile"
          />
        }
      >
        <SearchField value={query} onChangeText={setQuery} placeholder="Name, number or product" />
        {segments.length > 1 && (
          <View style={styles.segments}>
            <SegmentedControl options={segments} value={tab} onChange={setTab} />
          </View>
        )}
      </ScreenHeader>

      {loading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={128} radius={24} />
          ))}
        </View>
      ) : showingVoice ? (
        <FlatList
          data={calls}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="voice"
              title={query ? "No matching calls" : "No voice calls yet"}
              hint="Anu saves a lead every time someone talks to her on the website."
            />
          }
          renderItem={({ item }) => <VoiceCallCard call={item} navigation={navigation} />}
        />
      ) : (
        <FlatList
          data={enquiries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="enquiry"
              title={query ? "No matching enquiries" : "No enquiries yet"}
              hint="Website forms and the quote calculator land here."
            />
          }
          renderItem={({ item }) => <EnquiryCard enquiry={item} navigation={navigation} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  segments: { paddingHorizontal: 20, marginTop: 12 },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: TAB_BAR_HEIGHT + 24, gap: 12 },
  skeletons: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
})
