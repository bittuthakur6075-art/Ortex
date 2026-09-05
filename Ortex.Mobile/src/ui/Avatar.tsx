import React, { memo } from "react"
import { Image, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Icon from "@/ui/Icon"

export type AvatarSize = "sm" | "md" | "lg"

/**
 * The ring drawn around the face. Ported from Capnix's AppAvatar, where it
 * carries the account's verification standing; here it carries the same idea in
 * Ortex's vocabulary — the signed-in user's role tint on the profile hero.
 */
export type AvatarRing = "primary" | "success" | "warning" | "danger"

type Props = {
  name?: string
  uri?: string
  /** A step on the scale, or an explicit diameter for a hero. */
  size?: AvatarSize | number
  ring?: AvatarRing
  /** Gap between the face and its ring, in dp. */
  ringGap?: number
  /** Camera badge pinned to the bottom-right, for a tappable avatar. */
  edit?: boolean
}

const DIMENSIONS: Record<AvatarSize, number> = { sm: 28, md: 40, lg: 64 }

function initialsFor(name?: string) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : ""
  return (first + last).toUpperCase()
}

/**
 * Circular avatar with initials fallback. Usage:
 * `<Avatar name={account?.name} uri={account?.photoUrl} size="md" />`
 * `<Avatar name={name} uri={photo} size={100} ring="primary" edit />`
 *
 * The initial's type scales with the circle (38% of the diameter) rather than
 * coming from a lookup table, so a hero-sized avatar is not a small letter
 * floating in a large disc.
 */
function Avatar({ name, uri, size = "md", ring, ringGap = 3, edit }: Props) {
  const t = useTheme()
  const dimension = typeof size === "number" ? size : DIMENSIONS[size]
  const ringWidth = dimension >= 64 ? 2 : 1.5
  const ringColor = ring
    ? { primary: t.primary, success: t.success, warning: t.warning, danger: t.danger }[ring]
    : undefined
  const badge = Math.max(22, Math.round(dimension * 0.3))

  const face = uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel={name}
      style={[styles.image, { width: dimension, height: dimension, borderRadius: dimension / 2 }]}
    />
  ) : (
    <View
      accessibilityLabel={name}
      style={[
        styles.circle,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: t.primary10,
        },
      ]}
    >
      <Text style={[styles.initials, { color: t.primary, fontSize: Math.round(dimension * 0.38) }]}>
        {initialsFor(name)}
      </Text>
    </View>
  )

  if (!ring && !edit) return face

  // The ring is a padded circle behind the face rather than a border on it: a
  // border would eat into the picture, and the gap is what makes the ring read
  // as a ring instead of a rim.
  const outer = dimension + (ring ? (ringGap + ringWidth) * 2 : 0)

  return (
    <View style={{ width: outer, height: outer }}>
      <View
        style={[
          styles.ring,
          ring
            ? {
                width: outer,
                height: outer,
                borderRadius: outer / 2,
                borderWidth: ringWidth,
                borderColor: ringColor,
              }
            : null,
        ]}
      >
        {face}
      </View>
      {edit && (
        <View
          style={[
            styles.badge,
            {
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              backgroundColor: t.primary,
              borderColor: t.surface,
            },
          ]}
        >
          <Icon name="camera" size={Math.round(badge * 0.55)} color={t.textOnPrimary} variant="Bold" />
        </View>
      )}
    </View>
  )
}

export default memo(Avatar)

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    resizeMode: "cover",
  },
  initials: {
    fontFamily: font.bold,
  },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
})
