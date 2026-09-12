import React, { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Icon from "@/ui/Icon"

type Props = {
  /** The last fetch failed with this message. */
  error?: string | null
  /** The rows on screen are the saved copy, not the server's. */
  fromCache?: boolean
  /** When that copy was last confirmed, for "saved 2 h ago". */
  cachedAt?: number | null
  /** Tapping the notice retries. */
  onRetry?: () => void
}

/**
 * One line under the title that says where the data came from when it did not
 * come from the server just now.
 *
 * The repo serves the AsyncStorage mirror silently when the network fails, which
 * is the right thing for a rep in a basement showroom — but silently is the
 * problem: a list of yesterday's prices looks identical to today's. This is the
 * difference. It draws nothing at all in the normal case, so a screen can mount
 * it unconditionally.
 *
 * Two states, one look:
 *   · cached rows  → warning tint, "Showing saved copy from 2 h ago"
 *   · no rows, failed → danger tint, the error in words
 * Both end in "Tap to retry", because a rep's next move is always the same.
 */
function DataNotice({ error, fromCache, cachedAt, onRetry }: Props) {
  const t = useTheme()
  if (!error && !fromCache) return null

  const stale = !!fromCache
  const tint = stale ? t.warningBg : t.dangerBg
  const ink = stale ? t.warningText : t.dangerText
  const headline = stale ? `Showing saved copy${cachedAt ? ` from ${ago(cachedAt)}` : ""}` : error || "Could not load"
  const detail = stale && error ? error : null

  return (
    <Pressable
      onPress={onRetry}
      disabled={!onRetry}
      accessibilityRole={onRetry ? "button" : undefined}
      accessibilityLabel={`${headline}. ${onRetry ? "Tap to retry" : ""}`}
      style={({ pressed }) => [styles.row, { backgroundColor: tint, opacity: pressed ? 0.85 : 1 }]}
    >
      <Icon name={stale ? "clock" : "warning"} size={18} color={ink} variant="Bold" />
      <View style={styles.text}>
        <Text style={[textVariants.caption, styles.headline, { color: ink }]}>{headline}</Text>
        {!!detail && (
          <Text numberOfLines={2} style={[textVariants.caption, { color: ink, opacity: 0.8 }]}>
            {detail}
          </Text>
        )}
      </View>
      {!!onRetry && (
        <View style={styles.retry}>
          <Icon name="refresh" size={16} color={ink} />
          <Text style={[textVariants.caption, { color: ink, fontFamily: font.semibold }]}>Retry</Text>
        </View>
      )}
    </Pressable>
  )
}

export default memo(DataNotice)

/** "just now", "5 min ago", "2 h ago", "3 d ago" — the resolution a rep cares about. */
function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: gutter,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  text: { flex: 1 },
  headline: { fontFamily: font.medium },
  retry: { flexDirection: "row", alignItems: "center", gap: 4 },
})
