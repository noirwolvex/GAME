export const DEFAULT_CATEGORIES = [
  "human",
  "animal",
  "plant",
  "object",
  "country",
] as const;

export type Category = (typeof DEFAULT_CATEGORIES)[number];
export type RoundState = "waiting" | "playing" | "review" | "finished";

export interface RoundConfig {
  letter: string;
  durationSeconds: number;
  categories: readonly Category[];
}

export interface AnswerSet {
  playerId: string;
  answers: Partial<Record<Category, string>>;
  submittedAt: number;
}

export type AnswerReason =
  | "empty"
  | "too_short"
  | "wrong_letter"
  | "wrong_category"
  | "accepted"
  | "review";

export interface ValidatedAnswer {
  category: Category;
  value: string;
  valid: boolean;
  reason: AnswerReason;
}

export interface PlayerScore {
  playerId: string;
  points: number;
  answers: ValidatedAnswer[];
}

export interface RoundResult {
  letter: string;
  scores: PlayerScore[];
  finishedAt: number;
}

export interface GameRound {
  id: string;
  state: RoundState;
  config: RoundConfig;
  startedAt: number | null;
  endsAt: number | null;
  submissions: AnswerSet[];
}

export type AnswerValidator = (
  category: Category,
  answer: string | undefined,
  letter: string,
) => { valid: boolean; reason: AnswerReason } | null | undefined;

export const ARABIC_LETTERS = [
  "ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز",
  "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك",
  "ل", "م", "ن", "ه", "و", "ي",
] as const;

const ANSWER_BANK: Record<Category, readonly string[]> = {
  human: [
    "محمد", "مريم", "ماجد", "منى", "محمود", "مصطفى", "منصور", "مروان", "مهدي", "مراد",
    "سارة", "سعيد", "سلمان", "سامي", "سميرة", "شيماء", "شيرين", "صالح", "صفاء",
    "علي", "عمر", "عائشة", "عادل", "عمار", "فهد", "فاطمة", "فارس", "كريم", "ليان",
    "ليلى", "مازن", "نورة", "نور", "هاني", "هند", "وليد", "ياسر", "يوسف", "ياسمين",
  ],
  animal: [
    "ماعز", "مهر", "مها", "نمر", "نحلة", "نعامة", "نسر", "ناموسة",
    "أسد", "أرنب", "بقرة", "بطة", "بطريق", "جمل", "جرو", "حمار", "حصان", "خروف",
    "دلفين", "ذئب", "راكون", "زرافة", "سمكة", "سنجاب", "صقر", "ضبع", "عقرب", "غزال",
    "فيل", "قرد", "كلب", "لقلق", "هدهد", "وحيد القرن", "يمامة", "يربوع", "يعسوب",
  ],
  plant: [
    "موز", "مانجو", "مشمش", "ملوخية", "مريمية", "نخلة", "نعناع", "نرجس", "نبات",
    "أرز", "أقحوان", "بقدونس", "بامية", "بنفسج", "تفاح", "تين", "جرجير", "جزر", "حبق",
    "خس", "خزامى", "رمان", "ريحان", "زعتر", "زيتون", "سدر", "سمسم", "صبار", "عنب",
    "فلفل", "قرنفل", "كزبرة", "ليمون", "ورد", "ياسمين", "يقطين", "بابونج", "بطاطا", "برسيم",
  ],
  object: [
    "مفتاح", "مكتب", "ملعقة", "مرآة", "مقص", "مصباح", "منضدة", "مروحة", "مغسلة", "مجلد",
    "باب", "بطانية", "بطارية", "تلفاز", "ثلاجة", "جهاز", "حقيبة", "خزانة", "دراجة", "ساعة",
    "سيارة", "صندوق", "طبق", "طاولة", "علبة", "غسالة", "فرشاة", "قلم", "كتاب", "كرسي",
    "لوحة", "ممحاة", "نافذة", "هاتف", "ورقة", "يافطة", "إبريق", "أجراس", "إسفنجة", "مسمار",
  ],
  country: [
    "مصر", "ماليزيا", "مالطا", "مغرب", "موريتانيا", "مدغشقر", "موزمبيق", "مقدونيا", "منغوليا", "مكسيكا",
    "البحرين", "الإمارات", "الأردن", "ألمانيا", "إسبانيا", "إيطاليا", "أستراليا", "إندونيسيا", "البرازيل", "بلجيكا",
    "تونس", "تركيا", "الجزائر", "السعودية", "السودان", "الصين", "العراق", "عمان", "فرنسا",
    "فلسطين", "قطر", "كندا", "كرواتيا", "لبنان", "ليبيا", "نيبال", "نيجيريا", "هولندا", "اليابان",
  ],
};

export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

export function startsWithLetter(answer: string, letter: string): boolean {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedLetter = normalizeAnswer(letter);
  return normalizedAnswer.length > 0 && normalizedAnswer.startsWith(normalizedLetter);
}

export function isKnownCategoryAnswer(category: Category, answer: string): boolean {
  const normalized = normalizeAnswer(answer);
  return ANSWER_BANK[category].some((candidate) => normalizeAnswer(candidate) === normalized);
}

export function pickRandomLetter(letters: readonly string[] = ARABIC_LETTERS): string {
  if (letters.length === 0) {
    throw new Error("At least one letter is required");
  }
  return letters[Math.floor(Math.random() * letters.length)];
}

export function createRound(
  config: Omit<RoundConfig, "letter"> & { letter?: string },
): GameRound {
  const letter = config.letter ?? pickRandomLetter();
  const now = Date.now();

  if (config.durationSeconds <= 0) {
    throw new Error("durationSeconds must be greater than zero");
  }

  if (config.categories.length === 0) {
    throw new Error("At least one category is required");
  }

  return {
    id: `round_${now}_${Math.random().toString(36).slice(2, 8)}`,
    state: "waiting",
    config: {
      ...config,
      letter,
    },
    startedAt: null,
    endsAt: null,
    submissions: [],
  };
}

export function startRound(round: GameRound, now = Date.now()): GameRound {
  if (round.state !== "waiting") {
    throw new Error("Only waiting rounds can be started");
  }

  return {
    ...round,
    state: "playing",
    startedAt: now,
    endsAt: now + round.config.durationSeconds * 1000,
  };
}

const SUBMISSION_GRACE_MS = 1500;

export function canSubmit(round: GameRound, now = Date.now()): boolean {
  return (
    round.state === "playing" &&
    round.endsAt !== null &&
    now <= round.endsAt + SUBMISSION_GRACE_MS
  );
}

export function submitAnswers(
  round: GameRound,
  submission: AnswerSet,
  now = Date.now(),
): GameRound {
  if (!canSubmit(round, now)) {
    throw new Error("The round is no longer accepting answers");
  }

  const withoutExisting = round.submissions.filter(
    (entry) => entry.playerId !== submission.playerId,
  );

  return {
    ...round,
    submissions: [...withoutExisting, submission],
  };
}

export function validateAnswer(
  category: Category,
  answer: string | undefined,
  letter: string,
): ValidatedAnswer {
  const value = answer?.trim() ?? "";
  const normalized = normalizeAnswer(value);

  if (!normalized) {
    return { category, value, valid: false, reason: "empty" };
  }

  if (normalized.length < 2) {
    return { category, value, valid: false, reason: "too_short" };
  }

  if (!startsWithLetter(value, letter)) {
    return { category, value, valid: false, reason: "wrong_letter" };
  }

  if (!isKnownCategoryAnswer(category, value)) {
    return { category, value, valid: false, reason: "wrong_category" };
  }

  return { category, value, valid: true, reason: "accepted" };
}

export function finishRound(
  round: GameRound,
  now = Date.now(),
  validator?: AnswerValidator,
): { round: GameRound; result: RoundResult } {
  if (round.state !== "playing") {
    throw new Error("Only playing rounds can be finished");
  }

  const validated = new Map<string, ValidatedAnswer[]>();

  for (const submission of round.submissions) {
    const answers = round.config.categories.map((category) => {
      const override = validator?.(category, submission.answers[category], round.config.letter);
      if (override) {
        return {
          category,
          value: submission.answers[category]?.trim() ?? "",
          valid: override.valid,
          reason: override.reason,
        };
      }
      return validateAnswer(category, submission.answers[category], round.config.letter);
    });
    validated.set(submission.playerId, answers);
  }

  const scores: PlayerScore[] = round.submissions.map((submission) => {
    const answers = validated.get(submission.playerId) ?? [];
    let points = 0;

    for (const answer of answers) {
      if (!answer.valid) continue;

      const same = round.submissions
        .filter((other) => other.playerId !== submission.playerId)
        .some(
          (other) =>
            normalizeAnswer(other.answers[answer.category] ?? "") ===
            normalizeAnswer(answer.value),
        );

      points += same ? 5 : 10;
    }

    return {
      playerId: submission.playerId,
      points,
      answers,
    };
  });

  const nextRound: GameRound = {
    ...round,
    state: "finished",
  };

  return {
    round: nextRound,
    result: {
      letter: round.config.letter,
      scores: scores.sort((a, b) => b.points - a.points),
      finishedAt: now,
    },
  };
}
