import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import { font } from '@/theme/typography';

export type SegmentOption<T extends string = string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
};

/**
 * Sliding segmented control with an accent-soft lens behind the active
 * segment, like GlassTabBar's lens. Usage:
 * `<SegmentedControl options={[{key:'grid',label:'Grid'},{key:'list',label:'List'}]} value={viewMode} onChange={setViewMode} />`
 */
function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const slide = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: index,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [index, slide]);

  const segmentWidth = options.length > 0 ? width / options.length : 0;
  const translateX = slide.interpolate({
    inputRange: options.map((_, i) => i),
    outputRange: options.map((_, i) => i * segmentWidth),
  });

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: t.searchBg }]}
    >
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lens,
            {
              width: segmentWidth,
              backgroundColor: t.accentSoft,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={styles.segment}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? t.accent : t.textSecondary, fontFamily: active ? font.bold : font.medium },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(SegmentedControl) as typeof SegmentedControl;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    height: 44,
  },
  lens: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 12,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13.5,
  },
});
