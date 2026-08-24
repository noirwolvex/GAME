import { useEffect, useMemo, useState } from "react";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  DEFAULT_CATEGORIES,
  createRound,
  finishRound,
  startRound,
  submitAnswers,
  type Category,
  type GameRound,
} from "@game/game-engine";

const labels: Record<Category, string> = {
  human: "إنسان",
  animal: "حيوان",
  plant: "نبات",
  object: "جماد",
  country: "بلاد",
};

function makeRound(): GameRound {
  return startRound(
    createRound({
      durationSeconds: 60,
      categories: DEFAULT_CATEGORIES,
    }),
  );
}

export default function PlayScreen() {
  const [round, setRound] = useState<GameRound>(() => makeRound());
  const [answers, setAnswers] = useState<Partial<Record<Category, string>>>({});
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [score, setScore] = useState<number | null>(null);

  const categories = useMemo(() => round.config.categories, [round]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secondsLeft !== 0 || round.state !== "playing") return;

    try {
      const submitted = submitAnswers(round, {
        playerId: "local-player",
        answers,
        submittedAt: Date.now(),
      });
      const result = finishRound(submitted);
      setRound(result.round);
      setScore(result.result.scores[0]?.points ?? 0);
    } catch {
      // The UI is already in the time-up state; no extra action is required.
    }
  }, [answers, round, secondsLeft]);

  const updateAnswer = (category: Category, value: string) => {
    setAnswers((current) => ({ ...current, [category]: value }));
  };

  const finishNow = () => {
    if (round.state !== "playing") return;

    const submitted = submitAnswers(round, {
      playerId: "local-player",
      answers,
      submittedAt: Date.now(),
    });
    const result = finishRound(submitted);
    setRound(result.round);
    setScore(result.result.scores[0]?.points ?? 0);
    setSecondsLeft(0);
  };

  const restart = () => {
    setRound(makeRound());
    setAnswers({});
    setScore(null);
    setSecondsLeft(60);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>ROUND {round.state.toUpperCase()}</Text>
          <Text style={styles.title}>حرف</Text>
        </View>
        <View style={styles.timer}>
          <Text style={styles.timerNumber}>{secondsLeft}</Text>
          <Text style={styles.timerLabel}>ثانية</Text>
        </View>
      </View>

      <View style={styles.letterCard}>
        <Text style={styles.letterLabel}>الحرف</Text>
        <Text style={styles.letter}>{round.config.letter}</Text>
        <Text style={styles.hint}>كل إجابة يجب أن تبدأ بالحرف الظاهر.</Text>
      </View>

      {categories.map((category) => (
        <View key={category} style={styles.inputCard}>
          <Text style={styles.category}>{labels[category]}</Text>
          <TextInput
            value={answers[category] ?? ""}
            onChangeText={(value) => updateAnswer(category, value)}
            editable={round.state === "playing"}
            placeholder={`اكتب ${labels[category]}...`}
            placeholderTextColor="#71717A"
            style={styles.input}
            textAlign="right"
          />
        </View>
      ))}

      {round.state === "playing" ? (
        <Pressable style={styles.primaryButton} onPress={finishNow}>
          <Text style={styles.primaryText}>إنهاء الجولة</Text>
        </Pressable>
      ) : (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>نتيجة الجولة</Text>
          <Text style={styles.score}>{score ?? 0}</Text>
          <Text style={styles.resultHint}>نقاط</Text>
          <Pressable style={styles.primaryButton} onPress={restart}>
            <Text style={styles.primaryText}>جولة جديدة</Text>
          </Pressable>
        </View>
      )}

      <Link href="/" asChild>
        <Pressable style={styles.back}>
          <Text style={styles.backText}>العودة</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#09090B",
    padding: 20,
    paddingBottom: 48,
  },
  header: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  kicker: {
    color: "#71717A",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "800",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    marginTop: 4,
  },
  timer: {
    minWidth: 86,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#18181B",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#27272A",
  },
  timerNumber: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  timerLabel: {
    color: "#A1A1AA",
    fontSize: 11,
  },
  letterCard: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    alignItems: "center",
    paddingVertical: 28,
    borderRadius: 24,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#27272A",
    marginBottom: 14,
  },
  letterLabel: {
    color: "#A1A1AA",
    fontSize: 12,
  },
  letter: {
    color: "#FFFFFF",
    fontSize: 74,
    fontWeight: "900",
    lineHeight: 84,
    marginTop: 4,
  },
  hint: {
    color: "#71717A",
    fontSize: 12,
    marginTop: 8,
  },
  inputCard: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "#27272A",
    marginTop: 10,
  },
  category: {
    color: "#F4F4F5",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "right",
  },
  input: {
    color: "#FFFFFF",
    backgroundColor: "#18181B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    fontSize: 16,
  },
  primaryButton: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  primaryText: {
    color: "#09090B",
    fontSize: 15,
    fontWeight: "900",
  },
  resultCard: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    marginTop: 16,
    padding: 22,
    borderRadius: 20,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#27272A",
    alignItems: "center",
  },
  resultTitle: {
    color: "#A1A1AA",
    fontSize: 14,
  },
  score: {
    color: "#FFFFFF",
    fontSize: 52,
    fontWeight: "900",
    marginTop: 4,
  },
  resultHint: {
    color: "#71717A",
    fontSize: 12,
  },
  back: {
    alignSelf: "center",
    padding: 14,
    marginTop: 16,
  },
  backText: {
    color: "#A1A1AA",
    fontWeight: "700",
  },
});
