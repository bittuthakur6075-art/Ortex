import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import { font } from '@/theme/typography';

export type AvatarSize = 'sm' | 'md' | 'lg';

type Props = {
  name?: string;
  uri?: string;
  size?: AvatarSize;
};

const DIMENSIONS: Record<AvatarSize, number> = { sm: 28, md: 40, lg: 64 };
const FONT_SIZES: Record<AvatarSize, number> = { sm: 11, md: 15, lg: 24 };

function initialsFor(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Circular avatar with initials fallback. Usage:
 * `<Avatar name={account?.name} uri={account?.photoUrl} size="md" />`
 */
function Avatar({ name, uri, size = 'md' }: Props) {
  const t = useTheme();
  const dimension = DIMENSIONS[size];

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={name}
        style={[
          styles.image,
          { width: dimension, height: dimension, borderRadius: dimension / 2 },
        ]}
      />
    );
  }

  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.circle,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: t.accentSoft,
        },
      ]}
    >
      <Text style={[styles.initials, { color: t.accent, fontSize: FONT_SIZES[size] }]}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

export default memo(Avatar);

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    resizeMode: 'cover',
  },
  initials: {
    fontFamily: font.bold,
  },
});
