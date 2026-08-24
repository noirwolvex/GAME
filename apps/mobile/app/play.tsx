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

const GOLD = "#C9A227";
const GOLD_DARK = "#9F7D18";
const INK = "#151515";
const MUTED = "#77736A";

const labels: Record<Category, string> = {
  human: "إنسان",
  animal: "حيوان",
  plant: "نبات",
  object: "جماد",
  country: "بلاد",
};

const icons: Record<Category, string> = {
  human: "01",
  animal: "02",
  plant: "03",
  object: "04",
  country: "05",
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
  const progress = Math.max(0, Math.min(1, secondsLeft / 60));
  const isDanger = secondsLeft <= 10 && round.state === "playing";

  useEffect(() => {
    if (round.state !== "playing") return;

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
  }, [round.state]);

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
      // The round is already visually timed out.
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
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.ambientCircleOne} />
      <View style={styles.ambientCircleTwo} />
      <View style={styles.goldLine} />

      <View style={styles.shell}>
        <View style={styles.topBar}>
          <Link href="/" asChild>
            <Pressable style={styles.iconButton}>
              <Text style={styles.iconButtonText}>‹</Text>
            </Pressable>
          </Link>

          <View style={styles.centerBrand}>
            <Text style={styles.brandKicker}>NOIR WOLVEX</Text>
            <Text style={styles.brandTitle}>QUICK PLAY</Text>
          </View>

          <View style={styles.roundPill}>
            <View style={styles.liveDot} />
            <Text style={styles.roundPillText}>ROUND 01</Text>
          </View>
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>WRITE FAST · THINK SMART</Text>
            <Text style={styles.heroTitle}>جاهز للجولة؟</Text>
            <Text style={styles.heroDescription}>
              اكتب كلمة صحيحة في كل فئة تبدأ بالحرف المختار قبل انتهاء الوقت.
            </Text>
          </View>

          <View style={styles.timerCard}>
            <View style={styles.timerRing}>
              <View style={styles.timerRingInner}>
                <Text style={[styles.timerNumber, isDanger && styles.timerDanger]}>
                  {String(secondsLeft).padStart(2, "0")}
                </Text>
                <Text style={styles.timerLabel}>SEC</Text>
              </View>
            </View>
            <Text style={styles.timerCaption}>TIME LEFT</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.letterCard}>
          <View style={styles.letterGlow} />
          <Text style={styles.letterEyebrow}>YOUR LETTER</Text>
          <Text style={styles.letter}>{round.config.letter}</Text>
          <View style={styles.letterDivider} />
          <Text style={styles.letterHint}>كل إجابة يجب أن تبدأ بهذا الحرف</Text>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>FIVE CATEGORIES</Text>
            <Text style={styles.sectionTitle}>اكتب إجاباتك</Text>
          </View>
          <Text style={styles.answerCount}>
            {Object.values(answers).filter(Boolean).length}/{categories.length}
          </Text>
        </View>

        <View style={styles.grid}>
          {categories.map((category) => (
            <View key={category} style={styles.answerCard}>
              <View style={styles.answerCardTop}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{icons[category]}</Text>
                </View>
                <View style={styles.categoryCopy}>
                  <Text style={styles.categoryLabel}>{labels[category]}</Text>
                  <Text style={styles.categoryMeta}>STARTS WITH {round.config.letter}</Text>
                </View>
              </View>
              <TextInput
                value={answers[category] ?? ""}
                onChangeText={(value) => updateAnswer(category, value)}
                editable={round.state === "playing"}
                placeholder="اكتب إجابتك..."
                placeholderTextColor="#A8A39A"
                style={styles.input}
                textAlign="right"
                returnKeyType="next"
              />
            </View>
          ))}
        </View>

        {round.state === "playing" ? (
          <View style={styles.actionArea}>
            <Pressable
              style={({ pressed }) => [styles.finishButton, pressed && styles.buttonPressed]}
              onPress={finishNow}
            >
              <Text style={styles.finishButtonText}>إنهاء الجولة</Text>
              <Text style={styles.finishButtonArrow}>↗</Text>
            </Pressable>
            <Text style={styles.actionHint}>يمكنك الإنهاء في أي وقت</Text>
          </View>
        ) : (
          <View style={styles.resultCard}>
            <Text style={styles.resultEyebrow}>ROUND COMPLETE</Text>
            <Text style={styles.resultTitle}>نتيجة الجولة</Text>
            <Text style={styles.score}>{score ?? 0}</Text>
            <Text style={styles.resultPoints}>POINTS</Text>
            <Pressable style={styles.finishButton} onPress={restart}>
              <Text style={styles.finishButtonText}>جولة جديدة</Text>
              <Text style={styles.finishButtonArrow}>↗</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>CLASSIC CATEGORIES · MODERN COMPETITION</Text>
          <View style={styles.footerMark} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 18,
    overflow: "hidden",
  },
  ambientCircleOne: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -180,
    right: -130,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.16)",
  },
  ambientCircleTwo: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    bottom: -150,
    left: -130,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.11)",
  },
  goldLine: {
    position: "absolute",
    width: "82%",
    maxWidth: 960,
    height: 1,
    backgroundColor: "rgba(201,162,39,0.14)",
    top: 92,
    alignSelf: "center",
  },
  shell: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
  },
  topBar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(21,21,21,0.08)",
  },
  iconButtonText: {
    color: INK,
    fontSize: 28,
    lineHeight: 28,
    marginTop: -2,
  },
  centerBrand: {
    alignItems: "center",
  },
  brandKicker: {
    color: "#A89562",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  brandTitle: {
    color: INK,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginTop: 4,
  },
  roundPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.24)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  roundPillText: {
    color: "#7E6C38",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  heroRow: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  heroCopy: {
    flex: 1,
    maxWidth: 640,
  },
  heroEyebrow: {
    color: "#A18B4A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  heroTitle: {
    color: INK,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 42,
  },
  heroDescription: {
    marginTop: 8,
    color: MUTED,
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 560,
  },
  timerCard: {
    width: 122,
    minHeight: 122,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.84)",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.22)",
    shadowColor: "#A78A2A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 5,
  },
  timerRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
    borderColor: "rgba(201,162,39,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  timerRingInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(21,21,21,0.06)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  timerNumber: {
    color: INK,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 27,
  },
  timerDanger: {
    color: "#B33A2B",
  },
  timerLabel: {
    color: "#96885F",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginTop: 1,
  },
  timerCaption: {
    marginTop: 6,
    color: "#A69A7D",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 4,
    backgroundColor: "#EEECE7",
    marginTop: 22,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  letterCard: {
    marginTop: 18,
    width: "100%",
    minHeight: 260,
    borderRadius: 34,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.18)",
    shadowColor: "#B08D2B",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 38,
    elevation: 7,
  },
  letterGlow: {
    position: "absolute",
    width: 260,
    height: 160,
    borderRadius: 130,
    backgroundColor: "rgba(201,162,39,0.075)",
    top: -56,
    right: -50,
  },
  letterEyebrow: {
    color: "#A18B4A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 3,
  },
  letter: {
    color: INK,
    fontSize: 106,
    fontWeight: "900",
    lineHeight: 112,
    marginTop: 5,
  },
  letterDivider: {
    width: 54,
    height: 2,
    borderRadius: 2,
    backgroundColor: GOLD,
    marginTop: 3,
  },
  letterHint: {
    color: "#8D887C",
    fontSize: 11,
    marginTop: 11,
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionEyebrow: {
    color: "#A18B4A",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.1,
  },
  sectionTitle: {
    color: INK,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  answerCount: {
    color: "#9A8A5A",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  grid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  answerCard: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 280,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: "rgba(21,21,21,0.07)",
    shadowColor: "#9D8A4A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
  },
  answerCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  categoryBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F3E8",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.18)",
  },
  categoryBadgeText: {
    color: GOLD_DARK,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  categoryCopy: {
    flex: 1,
  },
  categoryLabel: {
    color: INK,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "right",
  },
  categoryMeta: {
    marginTop: 2,
    color: "#AAA391",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "right",
  },
  input: {
    marginTop: 13,
    color: INK,
    backgroundColor: "#FAF9F5",
    borderRadius: 14,
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#ECE9E1",
    fontSize: 16,
    fontWeight: "700",
  },
  actionArea: {
    alignItems: "center",
    marginTop: 20,
  },
  finishButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 6,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  finishButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  finishButtonArrow: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: -2,
  },
  actionHint: {
    marginTop: 8,
    color: "#A59E8E",
    fontSize: 10,
  },
  resultCard: {
    width: "100%",
    marginTop: 20,
    padding: 24,
    borderRadius: 28,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.2)",
  },
  resultEyebrow: {
    color: "#A18B4A",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.3,
  },
  resultTitle: {
    color: INK,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 5,
  },
  score: {
    color: GOLD_DARK,
    fontSize: 68,
    lineHeight: 74,
    fontWeight: "900",
    marginTop: 4,
  },
  resultPoints: {
    color: "#A7A08D",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 16,
  },
  footerRow: {
    marginTop: 28,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#EFEEE9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerText: {
    color: "#B1AB9E",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  footerMark: {
    width: 24,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#D0BA78",
  },
});