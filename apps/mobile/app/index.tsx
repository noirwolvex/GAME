import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedBackdrop } from "../components/AnimatedBackdrop";

const GOLD = "#C9A227";
const INK = "#171717";

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <AnimatedBackdrop />

      <View style={styles.headerRow}>
        <View style={styles.brandMark}>
          <View style={styles.brandMarkCore} />
        </View>
        <Text style={styles.headerLabel}>NOIR WOLVEX</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>THE WORD GAME, REFINED</Text>
        <Text style={styles.title}>GAME</Text>
        <View style={styles.goldRule} />
        <Text style={styles.arabicTitle}>حرف • إنسان • حيوان • نبات • جماد • بلاد</Text>
        <Text style={styles.subtitle}>
          Classic categories. Modern competition. Built for fast, elegant matches.
        </Text>

        <View style={styles.glassCard}>
          <View style={styles.cardGlow} />
          <Text style={styles.cardEyebrow}>QUICK PLAY</Text>
          <Text style={styles.cardTitle}>Ready when you are.</Text>
          <Text style={styles.cardText}>
            Jump into a round, race the clock, and prove your word power.
          </Text>

          <Link href="/play" asChild>
            <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <View style={styles.buttonInner}>
                <Text style={styles.buttonText}>PLAY NOW</Text>
                <Text style={styles.buttonArrow}>↗</Text>
              </View>
            </Pressable>
          </Link>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>5 CATEGORIES</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>60 SEC</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>MULTIPLAYER READY</Text>
          </View>
        </View>
      </View>

      <Text style={styles.footer}>FOUNDATION v0.1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    paddingTop: 26,
    paddingBottom: 28,
    overflow: "hidden",
  },
  headerRow: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.45)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  brandMarkCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GOLD,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3.2,
    color: "#7A6A38",
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "#8F8360",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3,
    textAlign: "center",
    marginBottom: 12,
  },
  title: {
    color: INK,
    fontSize: 78,
    fontWeight: "900",
    letterSpacing: 11,
    lineHeight: 82,
    textAlign: "center",
  },
  goldRule: {
    width: 68,
    height: 3,
    borderRadius: 3,
    backgroundColor: GOLD,
    marginTop: 14,
    marginBottom: 17,
  },
  arabicTitle: {
    color: "#2D2D2D",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 30,
  },
  subtitle: {
    maxWidth: 620,
    marginTop: 12,
    color: "#777777",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  glassCard: {
    width: "100%",
    maxWidth: 630,
    marginTop: 32,
    padding: 26,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "rgba(255,255,255,0.76)",
    shadowColor: "#9B7A22",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 34,
    elevation: 8,
  },
  cardGlow: {
    position: "absolute",
    width: 210,
    height: 110,
    top: -22,
    right: -38,
    borderRadius: 80,
    backgroundColor: "rgba(201,162,39,0.075)",
    transform: [{ rotate: "-12deg" }],
  },
  cardEyebrow: {
    color: "#A18746",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.6,
  },
  cardTitle: {
    marginTop: 7,
    color: INK,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  cardText: {
    maxWidth: 520,
    marginTop: 8,
    color: "#6D6D6D",
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    marginTop: 22,
    alignSelf: "flex-start",
    minWidth: 176,
    borderRadius: 16,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  buttonPressed: {
    transform: [{ scale: 0.975 }],
    opacity: 0.9,
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 18,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  buttonArrow: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 20,
  },
  metaText: {
    color: "#9A9A9A",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#C7B172",
  },
  footer: {
    width: "100%",
    textAlign: "center",
    color: "#B0A98E",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
});
