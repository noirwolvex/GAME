import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>NOIR WOLVEX PRESENTS</Text>
      <Text style={styles.title}>GAME</Text>
      <Text style={styles.subtitle}>
        حرف • إنسان • حيوان • نبات • جماد • بلاد
      </Text>

      <Link href="/play" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>PLAY</Text>
        </Pressable>
      </Link>

      <Text style={styles.status}>Foundation v0.1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#09090B",
  },
  eyebrow: {
    color: "#A1A1AA",
    fontSize: 12,
    letterSpacing: 3,
    marginBottom: 14,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: 8,
  },
  subtitle: {
    maxWidth: 420,
    marginTop: 18,
    marginBottom: 34,
    color: "#D4D4D8",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  button: {
    minWidth: 220,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  buttonText: {
    color: "#09090B",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  status: {
    position: "absolute",
    bottom: 28,
    color: "#71717A",
    fontSize: 12,
  },
});
