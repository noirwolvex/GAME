import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const GOLD = "#C9A227";

function PulseCircle({ size, delay, duration, top, left }: { size: number; delay: number; duration: number; top: number | string; left: number | string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [delay, duration, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.16] });
  const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.08, 0.24, 0.08] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          top,
          left,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

export function AnimatedBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.haloOne} />
      <View style={styles.haloTwo} />
      <PulseCircle size={300} delay={0} duration={3200} top="2%" left="-18%" />
      <PulseCircle size={220} delay={850} duration={2600} top="56%" left="76%" />
      <PulseCircle size={150} delay={1400} duration={2200} top="18%" left="77%" />

      <Animated.View style={[styles.line, styles.lineOne]} />
      <Animated.View style={[styles.line, styles.lineTwo]} />
      <View style={[styles.orbit, styles.orbitOne]} />
      <View style={[styles.orbit, styles.orbitTwo]} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: GOLD,
    backgroundColor: "rgba(201,162,39,0.025)",
  },
  haloOne: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(201,162,39,0.045)",
    top: -180,
    right: -150,
  },
  haloTwo: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(201,162,39,0.035)",
    bottom: -180,
    left: -150,
  },
  line: {
    position: "absolute",
    height: 1,
    backgroundColor: "rgba(201,162,39,0.18)",
    transformOrigin: "center",
  },
  lineOne: {
    width: "140%",
    top: "22%",
    left: "-20%",
    transform: [{ rotate: "-12deg" }],
  },
  lineTwo: {
    width: "140%",
    bottom: "18%",
    left: "-20%",
    transform: [{ rotate: "14deg" }],
  },
  orbit: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.11)",
  },
  orbitOne: {
    width: 520,
    height: 220,
    borderRadius: 260,
    top: "34%",
    left: "-20%",
    transform: [{ rotate: "18deg" }],
  },
  orbitTwo: {
    width: 460,
    height: 180,
    borderRadius: 230,
    top: "39%",
    right: "-22%",
    transform: [{ rotate: "-20deg" }],
  },
});
