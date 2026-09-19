import { Image } from "expo-image"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import type { Row } from "@/domain/schema"
import { isAdmin } from "@/domain/modules"
import {
  SOCIAL_PLATFORMS,
  SOCIAL_STATUS,
  sortForTab,
  tabOf,
  whenLabel,
  type SocialPost,
  type SocialTab,
} from "@/domain/social"
import { useCollection } from "@/hooks/useCollection"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import {
  AppScreen,
  DataNotice,
  EmptyState,
  Icon,
  IconButton,
  ListRefreshControl,
  ListRow,
  RowSeparator,
  SegmentedControl,
  SkeletonList,
  StatusBadge,
} from "@/ui"
import { useSocialAccounts } from "./useSocialAccounts"

type Post = SocialPost & Row

const TAB_LABEL: Record<SocialTab, string> = {
  review: "To approve",
  scheduled: "Scheduled",
  drafts: "Drafts",
  published: "Published",
}

/**
 * Social posts on the phone: the same posts as the console's Social page, in the
 * four places a person looks for them. Admins land on "To approve" when
 * something is waiting, everyone else on their drafts.
 */
export default function SocialScreen({ navigation }: StackScreenProps<"Social">) {
  const t = useTheme()
  const { profile } = useAuth()
  const admin = isAdmin(profile)
  const source = useCollection<Post>("social")
  const { status: accounts } = useSocialAccounts()

  const byTab = React.useMemo(() => {
    const out: Record<SocialTab, Post[]> = { review: [], scheduled: [], drafts: [], published: [] }
    for (const p of source.items) out[tabOf(p.status)].push(p)
    return out
  }, [source.items])

  const [tab, setTab] = React.useState<SocialTab | null>(null)
  const current: SocialTab = tab ?? (admin && byTab.review.length ? "review" : byTab.scheduled.length ? "scheduled" : "drafts")
  const data = React.useMemo(() => sortForTab(byTab[current], current), [byTab, current])

  const options = (Object.keys(TAB_LABEL) as SocialTab[]).map((key) => ({
    key,
    label: byTab[key].length ? `${TAB_LABEL[key]} ${byTab[key].length}` : TAB_LABEL[key],
  }))

  const connected = accounts
    ? [
        accounts.meta?.instagram && "Instagram",
        accounts.meta?.facebook && "Facebook",
        accounts.linkedin?.connected && "LinkedIn",
      ].filter(Boolean)
    : null

  const open = (id?: string) => {
    feedback.tap()
    navigation.navigate("SocialPost", id ? { id } : undefined)
  }

  return (
    <AppScreen
      title="Social"
      subtitle={source.loading ? "Loading…" : `${source.items.length} ${source.items.length === 1 ? "post" : "posts"}`}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      headerRight={<IconButton name="add" onPress={() => open()} accessibilityLabel="New post" />}
      list={{
        data: source.loading ? [] : data,
        keyExtractor: (x: unknown) => (x as Post).id,
        refreshControl: <ListRefreshControl refreshing={source.refreshing} onRefresh={source.reload} />,
        ItemSeparatorComponent: RowSeparator,
        ListFooterComponent: data.length ? <RowSeparator /> : null,
        ListEmptyComponent: source.loading ? (
          <SkeletonList count={5} leading="photo" leadingSize={56} />
        ) : source.error && !source.items.length ? (
          <EmptyState
            icon="warning"
            title="Could not load the posts"
            hint={source.error}
            actionLabel="Try again"
            onAction={() => void source.reload()}
          />
        ) : (
          <EmptyState
            icon="image"
            title={
              current === "review"
                ? "Nothing waiting for approval"
                : current === "scheduled"
                  ? "Nothing scheduled"
                  : current === "published"
                    ? "Nothing published yet"
                    : "No drafts"
            }
            hint={
              current === "scheduled"
                ? "Approve a post and pick a time, and it appears here until it goes out."
                : "Start a post with a photo and a caption. An admin approves it before anything goes live."
            }
            actionLabel="New post"
            onAction={() => open()}
          />
        ),
        renderItem: ({ item }: { item: unknown }) => {
          const p = item as Post
          const when =
            p.status === "scheduled"
              ? `Goes out ${whenLabel(p.scheduledFor)}`
              : p.status === "published"
                ? `Posted ${whenLabel(p.publishedAt)}`
                : p.status === "failed"
                  ? "Did not publish. Open to see why"
                  : p.status === "approved"
                    ? "Approved, not scheduled yet"
                    : ""
          const where = (p.platforms || [])
            .map((id) => SOCIAL_PLATFORMS.find((x) => x.id === id)?.label.split(" ")[0])
            .filter(Boolean)
            .join(", ")
          return (
            <ListRow
              leading={<Thumb uri={p.image} />}
              titleLines={1}
              title={p.topic || "Untitled post"}
              subtitle={[when, where].filter(Boolean).join(" · ")}
              trailing={<StatusBadge list={SOCIAL_STATUS} id={p.status} small />}
              onPress={() => open(p.id)}
            />
          )
        },
      }}
    >
      <DataNotice
        error={source.error}
        fromCache={source.fromCache}
        cachedAt={source.cachedAt}
        onRetry={() => void source.reload()}
      />
      <View style={styles.segments}>
        <SegmentedControl options={options} value={current} onChange={setTab} />
      </View>
      {connected && (
        <View style={styles.accounts}>
          <Icon name={connected.length ? "tick" : "info"} size={16} color={connected.length ? t.success : t.textTertiary} variant="Bold" />
          <Text style={[textVariants.caption, styles.accountsText, { color: t.textSecondary }]}>
            {connected.length
              ? `Posting to ${connected.join(", ")}`
              : "No account connected yet. Posts can be written, approved and scheduled; they go out once the office connects Instagram, Facebook or LinkedIn."}
          </Text>
        </View>
      )}
      {data.length ? <RowSeparator /> : null}
    </AppScreen>
  )
}

function Thumb({ uri }: { uri?: string }) {
  const t = useTheme()
  return (
    <View style={[styles.thumb, { backgroundColor: t.surfaceInset }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" transition={120} />
      ) : (
        <Icon name="image" size={24} color={t.textTertiary} variant="Bulk" />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  segments: { paddingHorizontal: gutter, marginBottom: spacing.sm },
  accounts: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: gutter,
    marginBottom: spacing.sm,
  },
  accountsText: { flex: 1 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
})
