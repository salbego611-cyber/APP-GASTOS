import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

const duration = 900;
const green = '#123F33';
const mint = '#A6E9BD';

export function StartupIntro({ onFinish }: { onFinish: () => void }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      isInteraction: false,
      useNativeDriver: Platform.OS !== 'web',
    });

    function finish() {
      if (!active) return;
      active = false;
      onFinish();
    }

    // Release the screen even if the native accessibility query or animation stalls.
    const timeout = setTimeout(finish, duration + 600);
    void AccessibilityInfo.isReduceMotionEnabled().then(reduceMotion => {
      if (!active) return;
      if (reduceMotion) finish();
      else animation.start(finish);
    }).catch(finish);

    return () => {
      active = false;
      clearTimeout(timeout);
      animation.stop();
    };
  }, [onFinish, progress]);

  const coinOpacity = progress.interpolate({ inputRange: [0, 0.22], outputRange: [0, 1], extrapolate: 'clamp' });
  const coinDrop = progress.interpolate({
    inputRange: [0, 0.22, 0.4, 0.49, 0.57, 1],
    outputRange: [-19, -14, 5, 23, 44, 44],
  });
  const coinTilt = progress.interpolate({
    inputRange: [0, 0.22, 0.57, 1],
    outputRange: ['-18deg', '-10deg', '14deg', '14deg'],
  });
  const coinWidth = progress.interpolate({ inputRange: [0, 0.22, 0.57, 1], outputRange: [0.58, 1, 0.72, 0.72] });
  const walletScale = progress.interpolate({
    inputRange: [0, 0.49, 0.56, 0.7, 0.85, 1],
    outputRange: [1, 1, 0.97, 1.08, 0.99, 1],
  });
  const rippleOpacity = progress.interpolate({ inputRange: [0, 0.56, 0.7, 1], outputRange: [0, 0, 0.25, 0] });
  const rippleScale = progress.interpolate({ inputRange: [0, 0.56, 1], outputRange: [0.8, 0.8, 1.22] });
  const nameOpacity = progress.interpolate({ inputRange: [0, 0.16, 0.73, 1], outputRange: [0, 0, 1, 1] });
  const nameOffset = progress.interpolate({ inputRange: [0, 0.16, 0.73, 1], outputRange: [5, 5, 0, 0] });

  return (
    <View testID="startup-intro" style={[StyleSheet.absoluteFill, styles.screen]}
      aria-hidden importantForAccessibility="no-hide-descendants">
      <View style={styles.mark}>
        <Animated.View style={[styles.ripple, { opacity: rippleOpacity, transform: [{ scale: rippleScale }] }]} />
        <Animated.View testID="startup-coin" style={[styles.coin, {
          opacity: coinOpacity, transform: [{ translateY: coinDrop }, { rotate: coinTilt }, { scaleX: coinWidth }],
        }]}>
          <View style={styles.rim} />
          <Text allowFontScaling={false} style={styles.symbol}>$</Text>
        </Animated.View>
        <Animated.View style={[styles.wallet, { transform: [{ scale: walletScale }] }]}>
          <View style={styles.walletFold} />
          <View style={styles.walletBody} />
          <View style={styles.walletClasp}><View style={styles.walletDot} /></View>
        </Animated.View>
      </View>
      <Animated.Text style={[styles.name, { opacity: nameOpacity, transform: [{ translateY: nameOffset }] }]}>
        Bolso em Dia
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    zIndex: 1,
    backgroundColor: green,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
  },
  mark: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center' },
  ripple: { position: 'absolute', inset: 7, borderRadius: 36, borderWidth: 1, borderColor: mint },
  coin: {
    position: 'absolute', top: -11.4, left: 45.6, width: 10.8, height: 10.8,
    borderRadius: 5.4, backgroundColor: mint, alignItems: 'center', justifyContent: 'center',
  },
  rim: { position: 'absolute', inset: 1, borderRadius: 5, borderWidth: 0.75, borderColor: '#659D80' },
  symbol: { color: green, fontSize: 7, fontWeight: '800', lineHeight: 8, includeFontPadding: false },
  wallet: { width: 44, height: 38, zIndex: 1 },
  walletFold: {
    position: 'absolute', top: 0, left: 0, width: 40, height: 20,
    borderColor: mint, borderWidth: 2.5, borderRadius: 6, backgroundColor: green,
  },
  walletBody: {
    position: 'absolute', top: 8, left: 0, right: 0, bottom: 0,
    borderColor: mint, borderWidth: 2.5, borderRadius: 6, backgroundColor: green,
  },
  walletClasp: {
    position: 'absolute', top: 18, right: 0, width: 16, height: 11,
    borderColor: mint, borderWidth: 2.5, borderRadius: 4, backgroundColor: green, justifyContent: 'center',
  },
  walletDot: { width: 2.5, height: 2.5, borderRadius: 2, marginLeft: 2, backgroundColor: mint },
  name: { color: '#F5FCF7', fontSize: 19, fontWeight: '800', textAlign: 'center' },
});
