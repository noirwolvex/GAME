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
  type PlayerScore,
  type ValidatedAnswer,
} from "@game/game-engine";

const GOLD = "#C9A227";
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

const reasonLabels: Record<ValidatedAnswer["reason"], string> = {
  empty: "لم تتم الإجابة",
  too_short: "الإجابة قصيرة جدًا",
  wrong_letter: "لا تبدأ بالحرف",
  wrong_category: "ليست إجابة صحيحة لهذه الفئة",
  accepted: "إجابة صحيحة",
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
  const [playerScore, setPlayerScore] = useState<PlayerScore | null>(null);

  const categories = useMemo(() => round.config.categories, [round]);
  const progress = Math.max(0, Math.min(1, secondsLeft / 60));
  const isDanger = secondsLeft <= 10 && round.state === "playing";
  const answeredCount = Object.values(answers).filter((value) => Boolean(value?.trim())).length;

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
    completeRound();
  }, [secondsLeft, round.state]);

  const completeRound = () => {
    if (round.state !== "playing") return;

    const submitted = submitAnswers(round, {
      playerId: "local-player",
      answers,
      submittedAt: Date.now(),
    });
    const result = finishRound(submitted);
    const score = result.result.scores.find((entry) => entry.playerId === "local-player") ?? null;

    setRound(result.round);
    setPlayerScore(score);
    setSecondsLeft(0);
  };

  const updateAnswer = (category: Category, value: string) => {
    setAnswers((current) => ({ ...current, [category]: value }));
  };

  const restart = () => {
    setRound(makeRound());
    setAnswers({});
    setSecondsLeft(60);
    setPlayerScore(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.ambientOne} />
      <View style={styles.ambientTwo} />

      <View style={styles.shell}>
        <View style={styles.topBar}>
          <Link href="/" asChild>
            <Pressable style={styles.backButton}>
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          </Link>

          <View style={styles.brand}>
            <Text style={styles.brandKicker}>NOIR WOLVEX</Text>
            <Text style={styles.brandTitle}>QUICK PLAY</Text>
          </View>

          <View style={styles.roundPill}>
            <View style={styles.dot} />
            <Text style={styles.roundText}>ROUND 01</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>WRITE FAST · THINK SMART</Text>
            <Text style={styles.title}>جاهز للجولة؟</Text>
            <Text style={styles.description}>
              اكتب إجابة حقيقية ومطابقة للفئة تبدأ بالحرف المطلوب. بعد انتهاء الجولة سنراجع كل إجابة.
            </Text>
          </View>

          <View style={styles.timerCard}>
            <View style={styles.timerRing}>
              <Text style={[styles.timerNumber, isDanger && styles.danger]}>
                {String(secondsLeft).padStart(2, "0")}
              </Text>
              <Text style={styles.timerLabel}>SEC</Text>
            </View>
            <Text style={styles.timerCaption}>TIME LEFT</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.letterCard}>
          <View style={styles.letterHalo} />
          <Text style={styles.letterEyebrow}>YOUR LETTER</Text>
          <Text style={styles.letter}>{round.config.letter}</Text>
          <Text style={styles.letterHint}>لا يكفي كتابة الحرف فقط — يجب أن تكون الكلمة صحيحة.</Text>
        </View>

        {round.state === "playing" ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>ANSWER REVIEW</Text>
                <Text style={styles.sectionTitle}>اكتب إجاباتك</Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countText}>{answeredCount}/{categories.length}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              {categories.map((category) => (
                <View key={category} style={styles.answerCard}>
                  <View style={styles.answerHeader}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{icons[category]}</Text>
                    </View>
                    <View style={styles.answerHeaderCopy}>
                      <Text style={styles.categoryLabel}>{labels[category]}</Text>
                      <Text style={styles.categoryMeta}>STARTS WITH {round.config.letter}</Text>
                    </View>
                  </View>

                  <TextInput
                    value={answers[category] ?? ""}
                    onChangeText={(value) => updateAnswer(category, value)}
                    placeholder="اكتب إجابة حقيقية..."
                    placeholderTextColor="#AAA59B"
                    style={styles.input}
                    textAlign="right"
                    editable
                    autoCorrect={false}
                  />
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={completeRound}
            >
              <Text style={styles.primaryText}>إنهاء الجولة وتقييم الإجابات</Text>
              <Text style={styles.primaryArrow}>↗</Text>
            </Pressable>
            <Text style={styles.actionHint}>سيتم فحص الحرف + طول الكلمة + الفئة عند الإنهاء.</Text>
          </>
        ) : (
          <ResultPanel playerScore={playerScore} categories={categories} onRestart={restart} />
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>CLASSIC CATEGORIES · SMART VALIDATION</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function ResultPanel({
  playerScore,
  categories,
  onRestart,
}: {
  playerScore: PlayerScore | null;
  categories: readonly Category[];
  onRestart: () => void;
}) {
  return (
    <View style={styles.resultsSection}>
      <View style={styles.resultHero}>
        <Text style={styles.resultEyebrow}>ROUND COMPLETE</Text>
        <Text style={styles.resultTitle}>تم تقييم إجاباتك</Text>
        <Text style={styles.score}>{playerScore?.points ?? 0}</Text>
        <Text style={styles.scoreLabel}>POINTS</Text>
      </View>

      <View style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View>
            <Text style={styles.reviewEyebrow}>ANSWER BY ANSWER</Text>
            <Text style={styles.reviewTitle}>المراجعة</Text>
          </View>
          <Text style={styles.reviewTotal}>
            {(playerScore?.answers.filter((answer) => answer.valid).length ?? 0)}/{categories.length} صحيحة
          </Text>
        </View>

        {categories.map((category) => {
          const answer = playerScore?.answers.find((entry) => entry.category === category);
          const valid = answer?.valid ?? false;

          return (
            <View key={category} style={[styles.reviewRow, valid ? styles.correctRow : styles.wrongRow]}>
              <View style={[styles.statusBadge, valid ? styles.correctBadge : styles.wrongBadge]}>
                <Text style={styles.statusText}>{valid ? "✓" : "×"}</Text>
              </View>
              <View style={styles.reviewCopy}>
                <View style={styles.reviewTopLine}>
                  <Text style={styles.reviewCategory}>{labels[category]}</Text>
                  <Text style={valid ? styles.correctLabel : styles.wrongLabel}>
                    {valid ? "صحيحة" : "خطأ"}
                  </Text>
                </View>
                <Text style={styles.reviewAnswer}>{answer?.value || "بدون إجابة"}</Text>
                <Text style={styles.reviewReason}>
                  {answer ? reasonLabels[answer.reason] : "لم تتم مراجعتها"}
                </Text>
              </View>
              <Text style={styles.reviewPoints}>{valid ? "+10" : "+0"}</Text>
            </View>
          );
        })}
      </View>

      <Pressable style={styles.primaryButton} onPress={onRestart}>
        <Text style={styles.primaryText}>جولة جديدة</Text>
        <Text style={styles.primaryArrow}>↗</Text>
      </Pressable>
    </View>
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
  ambientOne: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    top: -200,
    right: -150,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.13)",
  },
  ambientTwo: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    bottom: -160,
    left: -160,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.09)",
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
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(21,21,21,0.08)",
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  backIcon: {
    color: INK,
    fontSize: 28,
    marginTop: -3,
  },
  brand: {
    alignItems: "center",
  },
  brandKicker: {
    color: "#A89562",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  brandTitle: {
    marginTop: 4,
    color: INK,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  roundPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.22)",
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  roundText: {
    color: "#7E6C38",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  hero: {
    marginTop: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    color: "#A18B4A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.2,
  },
  title: {
    marginTop: 8,
    color: INK,
    fontSize: 35,
    lineHeight: 44,
    fontWeight: "900",
  },
  description: {
    maxWidth: 620,
    marginTop: 8,
    color: MUTED,
    fontSize: 14,
    lineHeight: 23,
  },
  timerCard: {
    width: 124,
    height: 124,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.22)",
    backgroundColor: "rgba(255,255,255,0.86)",
    shadowColor: "#A78A2A",
    shadowOffset: { width: 0, height: 14 },
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
  timerNumber: {
    color: INK,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: "900",
  },
  danger: {
    color: "#B33A2B",
  },
  timerLabel: {
    marginTop: 2,
    color: "#96885F",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.3,
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
    marginTop: 22,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#EEECE7",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  letterCard: {
    width: "100%",
    minHeight: 255,
    marginTop: 18,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.18)",
    backgroundColor: "rgba(255,255,255,0.78)",
    shadowColor: "#B08D2B",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 38,
    elevation: 7,
  },
  letterHalo: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.12)",
  },
  letterEyebrow: {
    color: "#A18B4A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.2,
  },
  letter: {
    marginTop: 3,
    color: GOLD,
    fontSize: 96,
    lineHeight: 112,
    fontWeight: "900",
  },
  letterHint: {
    color: MUTED,
    fontSize: 12,
    textAlign: "center",
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionEyebrow: {
    color: "#A18B4A",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
  },
  sectionTitle: {
    marginTop: 4,
    color: INK,
    fontSize: 24,
    fontWeight: "900",
  },
  countPill: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: "#FAF8F2",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.18)",
  },
  countText: {
    color: "#806E37",
    fontSize: 10,
    fontWeight: "900",
  },
  grid: {
    gap: 12,
  },
  answerCard: {
    width: "100%",
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(21,21,21,0.07)",
    backgroundColor: "rgba(255,255,255,0.86)",
    shadowColor: "#6A5720",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  answerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 12,
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAF8F2",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.2)",
  },
  badgeText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
  },
  answerHeaderCopy: {
    flex: 1,
  },
  categoryLabel: {
    color: INK,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
  },
  categoryMeta: {
    marginTop: 2,
    color: "#AAA28F",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.1,
    textAlign: "right",
  },
  input: {
    minHeight: 50,
    paddingHorizontal: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E7E3DB",
    backgroundColor: "#FCFBF8",
    color: INK,
    fontSize: 16,
    fontWeight: "700",
  },
  primaryButton: {
    width: "100%",
    minHeight: 56,
    marginTop: 18,
    borderRadius: 17,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 5,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  primaryArrow: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  actionHint: {
    marginTop: 9,
    textAlign: "center",
    color: "#A6A092",
    fontSize: 10,
  },
  resultsSection: {
    marginTop: 26,
  },
  resultHero: {
    alignItems: "center",
    paddingVertical: 12,
  },
  resultEyebrow: {
    color: "#A18B4A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },
  resultTitle: {
    marginTop: 5,
    color: INK,
    fontSize: 26,
    fontWeight: "900",
  },
  score: {
    marginTop: 10,
    color: GOLD,
    fontSize: 64,
    lineHeight: 70,
    fontWeight: "900",
  },
  scoreLabel: {
    color: "#A49A7F",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
  },
  reviewCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(21,21,21,0.07)",
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  reviewEyebrow: {
    color: "#A18B4A",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  reviewTitle: {
    marginTop: 4,
    color: INK,
    fontSize: 22,
    fontWeight: "900",
  },
  reviewTotal: {
    color: "#7C6A38",
    fontSize: 10,
    fontWeight: "900",
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginTop: 8,
  },
  correctRow: {
    backgroundColor: "#F5FBF5",
    borderWidth: 1,
    borderColor: "#D9EEDB",
  },
  wrongRow: {
    backgroundColor: "#FFF7F5",
    borderWidth: 1,
    borderColor: "#F2D8D2",
  },
  statusBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  correctBadge: {
    backgroundColor: "#DFF2E1",
  },
  wrongBadge: {
    backgroundColor: "#F8DDD8",
  },
  statusText: {
    fontSize: 16,
    fontWeight: "900",
    color: INK,
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  reviewTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewCategory: {
    color: INK,
    fontSize: 13,
    fontWeight: "900",
  },
  correctLabel: {
    color: "#3A8245",
    fontSize: 9,
    fontWeight: "900",
  },
  wrongLabel: {
    color: "#B64B3E",
    fontSize: 9,
    fontWeight: "900",
  },
  reviewAnswer: {
    marginTop: 4,
    color: "#353535",
    fontSize: 13,
    fontWeight: "700",
  },
  reviewReason: {
    marginTop: 2,
    color: "#8E8A80",
    fontSize: 9,
  },
  reviewPoints: {
    color: INK,
    fontSize: 11,
    fontWeight: "900",
  },
  footer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  footerText: {
    color: "#B0A98E",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
});
