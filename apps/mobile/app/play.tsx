import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const categories = ["إنسان", "حيوان", "نبات", "جماد", "بلاد"];

export default function PlayScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>QUICK PLAY</Text>
      <Text style={styles.title}>READY?</Text>
      <Text style={styles.description}>
        المرحلة التالية ستكون نظام الجولة الحقيقي: حرف، مؤقت، إجابات واحتساب نقاط.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>CATEGORIES</Text>
        <View style={styles.categories}>
          {categories.map((category) => (
            <View key={category} style={styles.category}>
              <Text style={styles.categoryText}>{category}</Text>
            </View>
          ))}
        </View>
      </View>

      <Link href="/" asChild>
        <Pressable style={styles.back}>
          <Text style={styles.backText}>BACK</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090B",
    padding: 24,
    justifyContent: "center",
  },
  kicker: {
    color: "#A1A1AA",
    fontSize: 12,
    letterSpacing: 3,
    textAlign: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 44,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
  },
  description: {
    color: "#A1A1AA",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 520,
    alignSelf: "center",
    marginTop: 16,
    marginBottom: 28,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#27272A",
  },
  cardTitle: {
    color: "#71717A",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 14,
  },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  category: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#27272A",
  },
  categoryText: {
    color: "#F4F4F5",
    fontSize: 14,
  },
  back: {
    alignSelf: "center",
    padding: 14,
    marginTop: 20,
  },
  backText: {
    color: "#A1A1AA",
    fontWeight: "700",
    letterSpacing: 1.5,
  },
});
