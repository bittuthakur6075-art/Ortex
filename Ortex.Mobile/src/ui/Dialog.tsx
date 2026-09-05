import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '@/store/ThemeContext';
import { font } from '@/theme/typography';

export type DialogAction = {
  label: string;
  tone?: 'default' | 'danger';
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  children?: React.ReactNode;
  actions: DialogAction[];
};

/**
 * Centered confirmation dialog. Usage:
 * `<Dialog visible={confirmOpen} onClose={close} title="Delete note?" message="This cannot be undone."
 *   actions={[{ label: 'Cancel', onPress: close }, { label: 'Delete', tone: 'danger', onPress: doDelete }]} />`
 */
export default function Dialog({ visible, onClose, title, message, children, actions }: Props) {
  const t = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress]);

  if (!mounted) return null;

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={styles.backdropPress} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.card,
            { backgroundColor: t.sheetBg, opacity: progress, transform: [{ scale }] },
          ]}
        >
          {!!title && <Text style={[styles.title, { color: t.text }]}>{title}</Text>}
          {!!message && <Text style={[styles.message, { color: t.textSecondary }]}>{message}</Text>}
          {children}

          <View style={styles.actions}>
            {actions.map((action, index) => (
              <Pressable
                key={index}
                onPress={action.onPress}
                android_ripple={{ color: t.ripple }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text
                  style={[
                    styles.actionLabel,
                    { color: action.tone === 'danger' ? t.danger : t.accent },
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(7,20,55,0.35)',
  },
  backdropPress: {
    flex: 1,
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 22,
  },
  title: {
    fontSize: 18,
    fontFamily: font.bold,
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: font.regular,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: 6,
  },
  actionLabel: {
    fontSize: 14.5,
    fontFamily: font.semibold,
  },
});
