import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/theme/theme';
import { font } from '@/theme/typography';

const DOTS = [0, 1, 2];

/**
 * Branded startup screen shown while the store hydrates and the fonts load.
 * Uses the RN Animated driver only — no reanimated dependency.
 */
export default function AppLoader({ label = 'Loading your notes' }: { label?: string }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const dots = useRef(DOTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    const bounces = dots.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 380,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((DOTS.length - index) * 140),
        ]),
      ),
    );
    bounces.forEach((b) => b.start());

    return () => {
      pulse.stop();
      bounces.forEach((b) => b.stop());
    };
  }, [breathe, dots]);

  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const glow = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.32],
  });

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <Animated.View
          style={[styles.halo, { opacity: glow, transform: [{ scale }] }]}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.mark}
            resizeMode="contain"
          />
        </Animated.View>

        <Text style={styles.title}>Notes</Text>
        <Text style={styles.label}>{label}</Text>

        <View style={styles.dots}>
          {dots.map((value, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  opacity: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.35, 1],
                  }),
                  transform: [
                    {
                      translateY: value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -7],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>

      <Text style={styles.footer}>Stored on this device</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
  },
  halo: {
    position: 'absolute',
    top: -24,
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: palette.white,
  },
  mark: {
    width: 104,
    height: 104,
    borderRadius: 30,
  },
  title: {
    marginTop: 22,
    fontSize: 26,
    fontFamily: font.extrabold,
    color: palette.white,
    letterSpacing: 0.2,
  },
  label: {
    marginTop: 6,
    fontSize: 13.5,
    fontFamily: font.regular,
    color: palette.primary20,
  },
  dots: {
    flexDirection: 'row',
    marginTop: 26,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 5,
    backgroundColor: palette.white,
  },
  footer: {
    position: 'absolute',
    bottom: 44,
    fontSize: 12,
    fontFamily: font.regular,
    color: palette.primary30,
  },
});
