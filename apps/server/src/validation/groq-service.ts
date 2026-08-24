export interface GroqNameResult {
  valid: boolean;
  confidence: number;
  reason: string;
  source: "groq-ai";
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
const GROQ_TIMEOUT_MS = 4000;
const LOCAL_DAILY_CAP = 900;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; result: GroqNameResult }>();
let usageDay = "";
let usageCount = 0;

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, "")
    .replace(/\s+/g, " ");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function canUseGroq(): boolean {
  const key = process.env.GROQ_API_KEY;
  if (!key) return false;

  const today = todayKey();
  if (usageDay !== today) {
    usageDay = today;
    usageCount = 0;
  }

  return usageCount < LOCAL_DAILY_CAP;
}

function getCached(word: string): GroqNameResult | null {
  const key = normalize(word);
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

function setCached(word: string, result: GroqNameResult): void {
  cache.set(normalize(word), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    result,
  });
}

export async function validateArabicHumanNameWithGroq(word: string): Promise<GroqNameResult | null> {
  const normalized = normalize(word);
  if (!normalized) return null;

  const cached = getCached(normalized);
  if (cached) return cached;

  if (!canUseGroq()) return null;

  usageCount += 1;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You validate Arabic GAME answers. Decide whether the supplied Arabic word is plausibly a human given name/name of a person. Do not invent facts. Return strict JSON only.",
          },
          {
            role: "user",
            content: `Word: ${word}\nQuestion: Can this Arabic word reasonably be accepted as a human given name in a word game?`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "arabic_name_validation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                valid: { type: "boolean" },
                confidence: { type: "number" },
                reason: { type: "string" },
              },
              required: ["valid", "confidence", "reason"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      valid?: boolean;
      confidence?: number;
      reason?: string;
    };

    if (typeof parsed.valid !== "boolean" || typeof parsed.confidence !== "number") {
      return null;
    }

    const confidence = Math.max(0, Math.min(1, parsed.confidence));
    const result: GroqNameResult = {
      valid: parsed.valid,
      confidence,
      reason: parsed.reason?.trim() || "ai_validation",
      source: "groq-ai",
    };

    setCached(normalized, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
