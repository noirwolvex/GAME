import { useEffect, useMemo, useState } from "react";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  DEFAULT_CATEGORIES,
  createRound,
  startRound,
  submitAnswers,
  type AnswerReason,
  type Category,
  type GameRound,
  type PlayerScore,
  type ValidatedAnswer,
} from "@game/game-engine";
import { validateWord } from "@game/validation";

const GOLD = "#C9A227";
const INK = "#151515";
const MUTED = "#77736A";
const GAME_SERVER_URL = process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

const labels: Record<Category, string> = {
  human: "إنسان",
  animal: "حيوان",
  plant: "نبات",
  object: "جماد",
  country: "بلاد",
};

const reasonLabels: Record<ValidatedAnswer["reason"], string> = {
  empty: "لم تتم الإجابة",
  too_short: "الإجابة قصيرة جدًا",
  wrong_letter: "لا تبدأ بالحرف المطلوب",
  wrong_category: "الكلمة ليست من هذه الفئة",
  accepted: "إجابة صحيحة",
  review: "كلمة غير موجودة في القاموس — تحتاج مراجعة",
};

function makeRound(): GameRound {
  return startRound(
    createRound({
      durationSeconds: 60,
      categories: DEFAULT_CATEGORIES,
    }),
  );
}

function mapValidationReason(
  reason: "empty" | "too_short" | "wrong_letter" | "category_mismatch" | "unknown_word" | "known_word" | "known_alias",
): AnswerReason {
  switch (reason) {
    case "empty":
      return "empty";
    case "too_short":
      return "too_short";
    case "wrong_letter":
      return "wrong_letter";
    case "category_mismatch":
      return "wrong_category";
    case "known_word":
    case "known_alias":
      return "accepted";
    case "unknown_word":
    default:
      return "review";
  }
}

function localFallback(category: Category, answer: string | undefined, letter: string): ValidatedAnswer {
  const value = answer?.trim() ?? "";
  const result = validateWord(answer, category, letter);
  return {
    category,
    value,
    valid: result.decision === "accept",
    reason: mapValidationReason(result.reason),
  };
}

async function validateWithServer(
  category: Category,
  answer: string | undefined,
  letter: string,
): Promise<ValidatedAnswer> {
  const value = answer?.trim() ?? "";

  if (!value) return localFallback(category, answer, letter);

  try {
    const response = await fetch(`${GAME_SERVER_URL}/validation/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, category, letter }),
    });

    if (!response.ok) throw new Error(`Validation HTTP ${response.status}`);

    const payload = (await response.json()) as {
      ok?: boolean;
      result?: {
        decision?: "accept" | "reject" | "review";
        reason?: "empty" | "too_short" | "wrong_letter" | "category_mismatch" | "unknown_word" | "known_word" | "known_alias";
      };
    };

    const result = payload.result;
    if (!payload.ok || !result?.decision || !result.reason) {
      throw new Error("Invalid validation response");
    }

    return {
      category,
      value,
      valid: result.decision === "accept",
      reason: mapValidationReason(result.reason),
    };
  } catch {
    return localFallback(category, answer, letter);
  }
}

export default function PlayScreen() {
  const [round, setRound] = useState<GameRound>(() => makeRound());
  const [answers, setAnswers] = useState<Partial<Record<Category, string>>>({});
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [playerScore, setPlayerScore] = useState<PlayerScore | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const categories = useMemo(() => round.config.categories, [round]);
  const answeredCount = Object.values(answers).filter((value) => Boolean(value?.trim())).length;
  const progress = Math.max(0, Math.min(1, secondsLeft / 60));
  const danger = secondsLeft <= 10 && round.state === "playing";

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
    if (secondsLeft === 0 && round.state === "playing") void completeRound();
  }, [secondsLeft, round.state]);

  const completeRound = async () => {
    if (round.state !== "playing" || isValidating) return;

    setIsValidating(true);

    const submitted = submitAnswers(round, {
      playerId: "local-player",
      answers,
      submittedAt: Date.now(),
    });

    const validatedAnswers = await Promise.all(
      categories.map((category) => validateWithServer(category, submitted.submissions[submitted.submissions.length - 1]?.answers[category], round.config.letter)),
    );

    const score: PlayerScore = {
      playerId: "local-player",
      points: validatedAnswers.reduce((total, answer) => total + (answer.valid ? 10 : 0), 0),
      answers: validatedAnswers,
    };

    const finishedRound: GameRound = {
      ...submitted,
      state: "finished",
    };

    setRound(finishedRound);
    setPlayerScore(score);
    setSecondsLeft(0);
    setIsValidating(false);
  };

  const restart = () => {
    setRound(makeRound());
    setAnswers({});
    setSecondsLeft(60);
    setPlayerScore(null);
    setIsValidating(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.orbitOne} />
      <View style={styles.orbitTwo} />
      <View style={styles.goldLine} />

      <View style={styles.shell}>
        <View style={styles.topBar}>
          <Link href="/" asChild>
            <Pressable style={styles.backButton}>
              <Text style={styles.backText}>‹</Text>
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

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>SMART VALIDATION</Text>
            <Text style={styles.title}>جاهز للجولة؟</Text>
            <Text style={styles.description}>
              اكتب كلمة حقيقية تبدأ بالحرف المختار وتنتمي إلى الفئة. عند الإنهاء، يتم تقييم كل إجابة بشكل مستقل.
            </Text>
          </View>

          <View style={styles.timerCard}>
            <View style={styles.timerRing}>
              <Text style={[styles.timerNumber, danger && styles.danger]}>{String(secondsLeft).padStart(2, "0")}</Text>
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
          <Text style={styles.letterHint}>مجرد كتابة الحرف لا تكسب نقاطًا.</Text>
        </View>

        {round.state === "playing" ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>FIVE CATEGORIES</Text>
                <Text style={styles.sectionTitle}>اكتب إجاباتك</Text>
              </View>
              <View style={styles.counter}>
                <Text style={styles.counterText}>{answeredCount}/{categories.length}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              {categories.map((category) => (
                <View key={category} style={styles.answerCard}>
                  <View style={styles.answerHead}>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{labels[category].slice(0, 1)}</Text>
                    </View>
                    <View style={styles.categoryCopy}>
                      <Text style={styles.categoryLabel}>{labels[category]}</Text>
                      <Text style={styles.categoryMeta}>STARTS WITH {round.config.letter}</Text>
                    </View>
                  </View>
                  <TextInput
                    value={answers[category] ?? ""}
                    onChangeText={(value) => setAnswers((current) => ({ ...current, [category]: value }))}
                    placeholder="اكتب إجابة..."
                    placeholderTextColor="#A8A39A"
                    style={styles.input}
                    textAlign="right"
                    autoCorrect={false}
                    editable={!isValidating}
                  />
                </View>
              ))}
            </View>

            <Pressable disabled={isValidating} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isValidating && styles.disabledButton]} onPress={() => void completeRound()}>
              <Text style={styles.primaryText}>{isValidating ? "جاري التحقق..." : "إنهاء الجولة وتقييم الإجابات"}</Text>
              <Text style={styles.primaryArrow}>↗</Text>
            </Pressable>
            <Text style={styles.actionHint}>المراجعة تتحقق من الحرف، طول الكلمة، والفئة، ثم تبحث في القاموس.</Text>
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

function ResultPanel({ playerScore, categories, onRestart }: { playerScore: PlayerScore | null; categories: readonly Category[]; onRestart: () => void }) {
  const validCount = playerScore?.answers.filter((answer) => answer.valid).length ?? 0;
  const reviewCount = playerScore?.answers.filter((answer) => answer.reason === "review").length ?? 0;

  return (
    <View style={styles.resultsSection}>
      <View style={styles.resultHero}>
        <Text style={styles.resultEyebrow}>ROUND COMPLETE</Text>
        <Text style={styles.resultTitle}>تم تقييم الجولة</Text>
        <Text style={styles.score}>{playerScore?.points ?? 0}</Text>
        <Text style={styles.scoreLabel}>POINTS</Text>
        <Text style={styles.resultMeta}>{validCount}/{categories.length} صحيحة · {reviewCount} تحتاج مراجعة</Text>
      </View>

      <View style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View>
            <Text style={styles.reviewEyebrow}>ANSWER BY ANSWER</Text>
            <Text style={styles.reviewTitle}>مراجعة الإجابات</Text>
          </View>
          <Text style={styles.reviewTotal}>{validCount}/{categories.length}</Text>
        </View>

        {categories.map((category) => {
          const answer = playerScore?.answers.find((entry) => entry.category === category);
          const valid = answer?.valid ?? false;
          const review = answer?.reason === "review";

          return (
            <View key={category} style={styles.reviewRow}>
              <View style={[styles.statusBadge, valid ? styles.correctBadge : review ? styles.reviewBadge : styles.wrongBadge]}>
                <Text style={styles.statusText}>{valid ? "✓" : review ? "?" : "×"}</Text>
              </View>
              <View style={styles.reviewCopy}>
                <View style={styles.reviewTopLine}>
                  <Text style={styles.reviewCategory}>{labels[category]}</Text>
                  <Text style={valid ? styles.correctLabel : review ? styles.reviewLabel : styles.wrongLabel}>
                    {valid ? "صحيحة" : review ? "مراجعة" : "خطأ"}
                  </Text>
                </View>
                <Text style={styles.reviewAnswer}>{answer?.value || "بدون إجابة"}</Text>
                <Text style={styles.reviewReason}>{answer ? reasonLabels[answer.reason] : "لم تتم الإجابة"}</Text>
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
  container: { flexGrow: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingVertical: 18, overflow: "hidden" },
  orbitOne: { position: "absolute", width: 420, height: 420, borderRadius: 210, top: -210, right: -150, borderWidth: 1, borderColor: "rgba(201,162,39,0.13)" },
  orbitTwo: { position: "absolute", width: 300, height: 300, borderRadius: 150, bottom: -160, left: -160, borderWidth: 1, borderColor: "rgba(201,162,39,0.10)" },
  goldLine: { position: "absolute", top: 92, left: "9%", right: "9%", height: 1, backgroundColor: "rgba(201,162,39,0.13)" },
  shell: { width: "100%", maxWidth: 1040, alignSelf: "center" },
  topBar: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(21,21,21,0.08)", backgroundColor: "rgba(255,255,255,0.85)" },
  backText: { color: INK, fontSize: 28, marginTop: -3 },
  brand: { alignItems: "center" },
  brandKicker: { color: "#A89562", fontSize: 8, fontWeight: "900", letterSpacing: 2.5 },
  brandTitle: { marginTop: 4, color: INK, fontSize: 12, fontWeight: "900", letterSpacing: 1.8 },
  roundPill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: "rgba(201,162,39,0.22)", backgroundColor: "rgba(255,255,255,0.78)" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  roundText: { color: "#7E6C38", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  heroRow: { marginTop: 30, flexDirection: "row", alignItems: "center", gap: 22 },
  heroCopy: { flex: 1 },
  eyebrow: { color: "#A18B4A", fontSize: 9, fontWeight: "900", letterSpacing: 2.2 },
  title: { marginTop: 8, color: INK, fontSize: 35, lineHeight: 44, fontWeight: "900" },
  description: { maxWidth: 620, marginTop: 8, color: MUTED, fontSize: 14, lineHeight: 23 },
  timerCard: { width: 124, height: 124, borderRadius: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(201,162,39,0.22)", backgroundColor: "rgba(255,255,255,0.86)", shadowColor: "#A78A2A", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.10, shadowRadius: 28, elevation: 5 },
  timerRing: { width: 78, height: 78, borderRadius: 39, borderWidth: 2, borderColor: "rgba(201,162,39,0.32)", alignItems: "center", justifyContent: "center" },
  timerNumber: { color: INK, fontSize: 24, fontWeight: "900", lineHeight: 27 },
  danger: { color: "#B33A2B" },
  timerLabel: { marginTop: 2, color: "#96885F", fontSize: 7, fontWeight: "900", letterSpacing: 1.3 },
  timerCaption: { marginTop: 6, color: "#A69A7D", fontSize: 7, fontWeight: "900", letterSpacing: 1.7 },
  progressTrack: { height: 4, borderRadius: 4, backgroundColor: "#EEECE7", marginTop: 22, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: GOLD },
  letterCard: { marginTop: 18, minHeight: 250, borderRadius: 34, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.79)", borderWidth: 1, borderColor: "rgba(201,162,39,0.18)", shadowColor: "#B08D2B", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.08, shadowRadius: 38, elevation: 7 },
  letterHalo: { position: "absolute", width: 260, height: 160, borderRadius: 130, top: -55, right: -45, backgroundColor: "rgba(201,162,39,0.07)" },
  letterEyebrow: { color: "#A18B4A", fontSize: 9, fontWeight: "900", letterSpacing: 2.4 },
  letter: { marginTop: 6, color: INK, fontSize: 90, lineHeight: 100, fontWeight: "900" },
  letterHint: { marginTop: 9, color: MUTED, fontSize: 12 },
  sectionHeader: { marginTop: 28, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionEyebrow: { color: "#A18B4A", fontSize: 8, fontWeight: "900", letterSpacing: 1.8 },
  sectionTitle: { marginTop: 5, color: INK, fontSize: 24, fontWeight: "900" },
  counter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(201,162,39,0.08)", borderWidth: 1, borderColor: "rgba(201,162,39,0.18)" },
  counterText: { color: "#7E6C38", fontWeight: "900", fontSize: 12 },
  grid: { gap: 12 },
  answerCard: { padding: 16, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.84)", borderWidth: 1, borderColor: "rgba(21,21,21,0.07)", shadowColor: "#8D772D", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 3 },
  answerHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  categoryBadge: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,162,39,0.10)", borderWidth: 1, borderColor: "rgba(201,162,39,0.20)" },
  categoryBadgeText: { color: "#90772D", fontSize: 16, fontWeight: "900" },
  categoryCopy: { flex: 1 },
  categoryLabel: { color: INK, fontSize: 16, fontWeight: "900" },
  categoryMeta: { marginTop: 3, color: "#A49B88", fontSize: 7, fontWeight: "900", letterSpacing: 1.4 },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: "rgba(21,21,21,0.07)", backgroundColor: "#FBFAF7", color: INK, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  primaryButton: { marginTop: 18, minHeight: 56, borderRadius: 18, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 16, shadowColor: GOLD, shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.20, shadowRadius: 18, elevation: 5 },
  disabledButton: { opacity: 0.6 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", letterSpacing: 0.5 },
  primaryArrow: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  actionHint: { marginTop: 9, color: "#A09889", fontSize: 10, textAlign: "center" },
  resultsSection: { marginTop: 26 },
  resultHero: { alignItems: "center", paddingVertical: 24, borderRadius: 30, backgroundColor: "rgba(201,162,39,0.06)", borderWidth: 1, borderColor: "rgba(201,162,39,0.15)" },
  resultEyebrow: { color: "#A18B4A", fontSize: 8, fontWeight: "900", letterSpacing: 2 },
  resultTitle: { marginTop: 6, color: INK, fontSize: 25, fontWeight: "900" },
  score: { marginTop: 8, color: INK, fontSize: 58, fontWeight: "900", lineHeight: 64 },
  scoreLabel: { color: "#8F8360", fontSize: 8, fontWeight: "900", letterSpacing: 2 },
  resultMeta: { marginTop: 8, color: MUTED, fontSize: 11 },
  reviewCard: { marginTop: 14, padding: 16, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.87)", borderWidth: 1, borderColor: "rgba(21,21,21,0.07)" },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 },
  reviewEyebrow: { color: "#A18B4A", fontSize: 7, fontWeight: "900", letterSpacing: 1.7 },
  reviewTitle: { marginTop: 4, color: INK, fontSize: 19, fontWeight: "900" },
  reviewTotal: { color: "#8E7A39", fontSize: 11, fontWeight: "900" },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#EEECE7" },
  statusBadge: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  correctBadge: { backgroundColor: "rgba(52,140,84,0.12)" },
  wrongBadge: { backgroundColor: "rgba(179,58,43,0.10)" },
  reviewBadge: { backgroundColor: "rgba(201,162,39,0.14)" },
  statusText: { color: INK, fontSize: 16, fontWeight: "900" },
  reviewCopy: { flex: 1 },
  reviewTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewCategory: { color: INK, fontSize: 13, fontWeight: "900" },
  correctLabel: { color: "#368451", fontSize: 10, fontWeight: "900" },
  wrongLabel: { color: "#B33A2B", fontSize: 10, fontWeight: "900" },
  reviewLabel: { color: "#987E2B", fontSize: 10, fontWeight: "900" },
  reviewAnswer: { marginTop: 3, color: INK, fontSize: 15, fontWeight: "800" },
  reviewReason: { marginTop: 2, color: MUTED, fontSize: 10 },
  reviewPoints: { minWidth: 32, textAlign: "right", color: INK, fontSize: 12, fontWeight: "900" },
  footer: { paddingVertical: 26, alignItems: "center" },
  footerText: { color: "#ADA690", fontSize: 8, fontWeight: "800", letterSpacing: 1.5 },
});
