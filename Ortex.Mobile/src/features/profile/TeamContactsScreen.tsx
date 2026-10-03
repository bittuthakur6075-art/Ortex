import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { cachedAt, readCache, writeCache } from "@/data/cache"
import { supabase, errorMessage } from "@/data/supabase"
import { ROLE_TONE, roleLabel } from "@/domain/modules"
import NotificationBell from "@/features/notifications/NotificationBell"
import { callNumber, email, prettyPhone, whatsapp } from "@/lib/contact"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Avatar,
  DataNotice,
  EmptyState,
  IconButton,
  ListRefreshControl,
  RowSeparator,
  SearchField,
  SkeletonList,
} from "@/ui"

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; avatar_url: string | null; role: string | null }

/**
 * The Staff role's Team tab: a phone book of colleagues and nothing more. No
 * invite, no activity, no account standing; that is the admin's Team page.
 * Reads `team_contacts()` (migration 0064) because `profiles` RLS returns only
 * your own row to a non-admin.
 */
export default function TeamContactsScreen() {
  const t = useTheme()
  const { profile } = useAuth()
  const [people, setPeople] = React.useState<Contact[]>([])
  const [failed, setFailed] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [query, setQuery] = React.useState("")
  // The last good list, per person, so the phone book still opens offline.
  const [savedAt, setSavedAt] = React.useState<number | null>(null)
  const cacheKey = `team_contacts/${profile?.id || "anon"}`

  const load = React.useCallback(async () => {
    const { data, error } = await supabase.rpc("team_contacts")
    if (error) {
      const saved = await readCache<Contact[]>(cacheKey)
      if (saved) {
        setPeople(saved)
        setSavedAt((await cachedAt(cacheKey)) ?? Date.now())
      }
      setFailed(errorMessage(error, "Could not load the team"))
    } else {
      const rows = (data as Contact[]) || []
      setPeople(rows)
      setFailed(null)
      setSavedAt(null)
      void writeCache(cacheKey, rows)
    }
    setLoading(false)
    setRefreshing(false)
  }, [cacheKey])

  React.useEffect(() => void load(), [load])

  const needle = query.trim().toLowerCase()
  const digits = needle.replace(/\D/g, "")
  const shown = people.filter(
    (p) =>
      !needle ||
      (p.name || "").toLowerCase().includes(needle) ||
      (p.email || "").toLowerCase().includes(needle) ||
      (!!digits && String(p.phone || "").includes(digits)),
  )

  return (
    <AppScreen
      title="Team"
      subtitle={loading ? "Loading…" : `${people.length} ${people.length === 1 ? "person" : "people"}`}
      headerRight={<NotificationBell />}
      list={{
        data: loading || (failed && !savedAt) ? [] : shown,
        keyExtractor: (p: unknown) => (p as Contact).id,
        refreshControl: (
          <ListRefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load()
            }}
          />
        ),
        ItemSeparatorComponent: RowSeparator,
        ListEmptyComponent: loading ? (
          <SkeletonList count={6} leading="avatar" leadingSize={48} />
        ) : failed && !savedAt ? (
          <EmptyState icon="warning" title="Could not load the team" hint={failed} actionLabel="Try again" onAction={() => void load()} />
        ) : (
          <EmptyState icon="search" title="No one matches" hint={needle ? `Nobody on the team matches “${query.trim()}”.` : "No one to show."} />
        ),
        renderItem: ({ item }: { item: unknown }) => {
          const p = item as Contact
          const name = p.name?.trim() || p.email || "Unnamed"
          const tone = t.tones[ROLE_TONE[p.role || ""] || "slate"]
          const you = p.id === profile?.id
          return (
            <View style={styles.row}>
              <Avatar name={name} uri={p.avatar_url || undefined} size={48} />
              <View style={styles.body}>
                <Text numberOfLines={1} style={[textVariants.listTitle, { color: t.text }]}>
                  {name}
                  {you ? " (you)" : ""}
                </Text>
                <View style={styles.meta}>
                  <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.pillText, { color: tone.fg }]}>{roleLabel(p.role || undefined) || "No role"}</Text>
                  </View>
                  {!!p.phone && (
                    <Text numberOfLines={1} style={[textVariants.small, styles.flex, { color: t.textSecondary }]}>
                      {prettyPhone(p.phone)}
                    </Text>
                  )}
                </View>
                {!!p.email && (
                  <Text numberOfLines={1} style={[textVariants.small, { color: t.textSecondary }]}>
                    {p.email}
                  </Text>
                )}
              </View>
              {!you && !!p.phone && (
                <>
                  <IconButton name="call" accessibilityLabel={`Call ${name}`} onPress={() => void callNumber(p.phone!)} />
                  <IconButton name="whatsapp" accessibilityLabel={`WhatsApp ${name}`} onPress={() => void whatsapp(p.phone!)} />
                </>
              )}
              {!you && !p.phone && !!p.email && (
                <IconButton name="mail" accessibilityLabel={`Email ${name}`} onPress={() => void email(p.email!)} />
              )}
            </View>
          )
        },
      }}
    >
      {!!savedAt && <DataNotice fromCache cachedAt={savedAt} error={failed} onRetry={() => void load()} />}
      <View style={styles.tools}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search name, email or phone" />
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  tools: { paddingBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: gutter, paddingVertical: spacing.md },
  body: { flex: 1, minWidth: 0, gap: 3, marginLeft: spacing.xs },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flexShrink: 1 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, lineHeight: 14, fontFamily: font.semibold },
})
