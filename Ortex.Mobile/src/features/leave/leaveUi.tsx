import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { type LeaveBalance, type LeaveRequest, type LeaveStatus } from "@/domain/attendance"
import { leaveDatesWords } from "@/features/leave/leaveFormat"
import {
  DATE_BADGE,
  dayUnit,
  daysFigure,
  leaveIcon,
  leaveTone,
  SHORT_STATUS,
  STATUS_TONE,
  TILE,
} from "@/features/leave/leaveLook"
import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { gutter, radius, size as sizes, spacing, state } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Icon from "@/ui/Icon"
import { AnimatedPressable, usePressMotion } from "@/ui/motion"
import Skeleton from "@/ui/Skeleton"

// The leave screens' shared components. Their colours and glyphs come from
// leaveLook.ts, so every screen draws a leave type the same way.

// ---- status ------------------------------------------------------------------------------

/** Pending / Approved / Rejected / Cancelled on its tone's tinted well. */
export function LeaveStatusPill({ status }: { status: LeaveStatus }) {
  const t = useTheme()
  const c = t.tones[STATUS_TONE[status]]
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[textVariants.chipText, { color: c.fg }]}>{SHORT_STATUS[status].toUpperCase()}</Text>
    </View>
  )
}

// ---- small marks -------------------------------------------------------------------------

/** The round, tinted well a leave type's glyph sits in. */
export function TypeWell({ code, size = 38 }: { code: string; size?: number }) {
  const t = useTheme()
  const c = t.tones[leaveTone(code)]
  return (
    <View style={[styles.well, { width: size, height: size, backgroundColor: c.bg }]}>
      <Icon name={leaveIcon(code)} size={Math.round(size * 0.47)} color={c.fg} variant="Bulk" />
    </View>
  )
}

export function TypeDot({ code }: { code: string }) {
  const t = useTheme()
  return <View style={[styles.dot, { backgroundColor: t.tones[leaveTone(code)].fg }]} />
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]


/**
 * The compact calendar leaf on a request or holiday row: month, date, weekday,
 * tinted in the leave type's colour (or neutral for a holiday).
 */
export function DateBadge({ day, code, tone }: { day: string; code?: string; tone?: StatusTone }) {
  const t = useTheme()
  const c = t.tones[tone ?? (code ? leaveTone(code) : "slate")]
  const d = new Date(`${day}T00:00:00Z`)
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]} accessible={false}>
      <Text style={[textVariants.badgeText, { color: c.fg }]}>{MONTHS[d.getUTCMonth()]}</Text>
      <Text style={[styles.badgeDate, { color: c.fg }]}>{d.getUTCDate()}</Text>
      <Text style={[textVariants.microLabel, { color: c.fg }]}>{WEEKDAYS[d.getUTCDay()]}</Text>
    </View>
  )
}

// ---- balance tile ------------------------------------------------------------------------


/**
 * One leave type's balance, Zoho's way: the glyph in its colour, the name, how
 * many days are AVAILABLE as the big figure, and what is already booked under it.
 */
export function BalanceTile({ b, onPress }: { b: LeaveBalance; onPress?: () => void }) {
  const t = useTheme()
  const press = usePressMotion({ scale: 0.97, dim: state.pressedOpacity })
  const unpaid = b.accrual === "none"
  const booked = `Booked ${daysFigure(b.taken_year)}${b.pending ? ` · ${daysFigure(b.pending)} pending` : ""}`

  const body = (
    <>
      <View style={styles.tileHead}>
        <TypeWell code={b.code} size={36} />
        {onPress ? <Icon name="forward" size={16} color={t.textTertiary} /> : null}
      </View>
      <Text numberOfLines={1} style={[textVariants.smallStrong, { color: t.textSecondary, marginTop: spacing.sm }]}>
        {b.name}
      </Text>
      {unpaid ? (
        <>
          <Text style={[textVariants.stat, { color: t.textSecondary }]}>Unpaid</Text>
          <Text numberOfLines={1} style={[textVariants.caption, { color: t.textTertiary }]}>
            No balance, loss of pay
          </Text>
        </>
      ) : (
        <>
          <Text style={[textVariants.stat, { color: b.available > 0 ? t.text : t.textTertiary }]}>
            {daysFigure(b.available)}
            <Text style={[textVariants.small, { color: t.textTertiary }]}>{` ${dayUnit(b.available)}`}</Text>
          </Text>
          <Text numberOfLines={1} style={[textVariants.caption, { color: t.textTertiary }]}>
            available
          </Text>
        </>
      )}
      <View style={[styles.tileRule, { backgroundColor: t.border }]} />
      <Text numberOfLines={1} style={[textVariants.captionStrong, { color: t.textSecondary }]}>
        {booked}
      </Text>
    </>
  )

  const label = unpaid
    ? `${b.name}, unpaid. ${booked}`
    : `${b.name}, ${daysFigure(b.available)} ${dayUnit(b.available)} available. ${booked}`

  if (!onPress) {
    return (
      <View style={[styles.tile, { backgroundColor: t.surfaceInset }]} accessible accessibilityLabel={label}>
        {body}
      </View>
    )
  }
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Opens the history`}
      style={[styles.tile, { backgroundColor: t.surfaceInset }, press.style]}
    >
      {body}
    </AnimatedPressable>
  )
}

export function BalanceTileSkeleton() {
  const t = useTheme()
  return (
    <View style={[styles.tile, { backgroundColor: t.surfaceInset }]}>
      <Skeleton width={36} height={36} radius={18} />
      <Skeleton width="62%" height={12} radius={6} style={{ marginTop: spacing.sm + 4 }} />
      <Skeleton width={56} height={26} radius={8} style={{ marginTop: spacing.sm }} />
      <Skeleton width="44%" height={11} radius={5} style={{ marginTop: spacing.sm }} />
      <Skeleton width="70%" height={11} radius={5} style={{ marginTop: spacing.md + 4 }} />
    </View>
  )
}

// ---- request row -------------------------------------------------------------------------

/**
 * A leave request in a list: its date leaf, the type with its colour dot, the
 * dates in words, and on the right the day count over the status chip.
 */
export function LeaveRow({ r, typeName, onPress }: { r: LeaveRequest; typeName: string; onPress?: () => void }) {
  const t = useTheme()
  const press = usePressMotion({ scale: 0.985, dim: state.pressedOpacity })
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${typeName}, ${leaveDatesWords(r)}, ${daysFigure(r.days)} ${dayUnit(r.days)}, ${SHORT_STATUS[r.status]}`}
      style={[styles.row, press.style]}
    >
      <DateBadge day={r.from_day} code={r.type_code} />
      <View style={styles.rowBody}>
        <View style={styles.typeLine}>
          <TypeDot code={r.type_code} />
          <Text numberOfLines={1} style={[textVariants.listTitle, { color: t.text, flexShrink: 1 }]}>
            {typeName}
          </Text>
        </View>
        <Text numberOfLines={2} style={[textVariants.listSubtitle, { color: t.textTertiary, marginTop: 4 }]}>
          {leaveDatesWords(r)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[textVariants.listAmount, { color: r.status === "cancelled" || r.status === "rejected" ? t.textTertiary : t.text }]}>
          {daysFigure(r.days)}
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{` ${dayUnit(r.days)}`}</Text>
        </Text>
        <LeaveStatusPill status={r.status} />
      </View>
    </AnimatedPressable>
  )
}

/** `LeaveRow`'s geometry as a placeholder; keep the two in step. */
export function LeaveRowSkeleton({ index = 0 }: { index?: number }) {
  const widths = ["58%", "46%", "64%"] as const
  const subs = ["72%", "54%", "66%"] as const
  return (
    <View style={styles.row}>
      <Skeleton width={DATE_BADGE.width} height={DATE_BADGE.height} radius={radius.card} />
      <View style={styles.rowBody}>
        <Skeleton width={widths[index % 3]} height={15} radius={7} />
        <Skeleton width={subs[index % 3]} height={12} radius={6} style={{ marginTop: 8 }} />
      </View>
      <View style={styles.rowRight}>
        <Skeleton width={52} height={18} radius={7} />
        <Skeleton width={64} height={18} radius={9} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  well: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: {
    width: DATE_BADGE.width,
    height: DATE_BADGE.height,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDate: { fontFamily: font.bold, fontSize: 19, lineHeight: 22, fontVariant: ["tabular-nums"] },
  tile: {
    width: TILE.width,
    minHeight: TILE.height,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tileHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tileRule: { height: 1, marginVertical: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: gutter,
    paddingVertical: spacing.md,
    minHeight: sizes.touchMin,
  },
  rowBody: { flex: 1, minWidth: 0 },
  typeLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowRight: { alignItems: "flex-end", gap: 6 },
})
