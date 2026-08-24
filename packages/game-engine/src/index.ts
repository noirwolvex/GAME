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

export interface ValidatedAnswer {
  category: Category;
  value: string;
  valid: boolean;
  reason: "empty" | "wrong_letter" | "accepted";
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

export const ARABIC_LETTERS = [
  "ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز",
  "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك",
  "ل", "م", "ن", "ه", "و", "ي",
] as const;

export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "");
}

export function startsWithLetter(answer: string, letter: string): boolean {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedLetter = normalizeAnswer(letter);
  return normalizedAnswer.length > 0 && normalizedAnswer.startsWith(normalizedLetter);
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

export function canSubmit(round: GameRound, now = Date.now()): boolean {
  return round.state === "playing" && round.endsAt !== null && now <= round.endsAt;
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

  if (!value) {
    return { category, value, valid: false, reason: "empty" };
  }

  if (!startsWithLetter(value, letter)) {
    return { category, value, valid: false, reason: "wrong_letter" };
  }

  return { category, value, valid: true, reason: "accepted" };
}

export function finishRound(
  round: GameRound,
  now = Date.now(),
): { round: GameRound; result: RoundResult } {
  if (round.state !== "playing") {
    throw new Error("Only playing rounds can be finished");
  }

  const byCategory = new Map<Category, ValidatedAnswer[][]>();

  for (const category of round.config.categories) {
    byCategory.set(category, []);
  }

  const validated = new Map<string, ValidatedAnswer[]>();

  for (const submission of round.submissions) {
    const answers = round.config.categories.map((category) =>
      validateAnswer(category, submission.answers[category], round.config.letter),
    );
    validated.set(submission.playerId, answers);

    for (const answer of answers) {
      const values = byCategory.get(answer.category);
      if (values) values.push([answer]);
    }
  }

  const scores: PlayerScore[] = round.submissions.map((submission) => {
    const answers = validated.get(submission.playerId) ?? [];
    let points = 0;

    for (const answer of answers) {
      if (!answer.valid) continue;

      const competing = round.submissions.filter(
        (other) => other.playerId !== submission.playerId,
      );
      const same = competing.some(
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
