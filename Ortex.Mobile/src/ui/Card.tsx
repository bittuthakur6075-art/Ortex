import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { SquircleView } from 'react-native-figma-squircle';

import { useTheme } from '@/store/ThemeContext';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  padding?: number;
  radius?: number;
  smooth?: boolean;
  color?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

/**
 * Generic surface container. Usage:
 * `<Card padding={16}><Text>Hello</Text></Card>`
 * `<Card onPress={openNote} color={t.noteColors.yellow}>...</Card>`
 */
function Card({
  children,
  onPress,
  padding = 16,
  radius = 28,
  smooth = true,
  color,
  style,
  accessibilityLabel,
}: Props) {
  const t = useTheme();
  const bg = color ?? t.card;

  const background = smooth ? (
    <SquircleView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      squircleParams={{
        cornerRadius: radius,
        cornerSmoothing: 0.7,
        fillColor: bg,
      }}
    />
  ) : (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: bg, borderRadius: radius }]}
    />
  );

  const content = (
    <View style={[styles.content, { padding }]}>{children}</View>
  );

  if (!onPress) {
    return (
      <View style={style}>
        {background}
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, { opacity: pressed ? 0.85 : 1 }]}
    >
      {background}
      {content}
    </Pressable>
  );
}

export default memo(Card);

const styles = StyleSheet.create({
  content: {
    width: '100%',
  },
});
