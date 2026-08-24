from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "arabic-wordnet" / "index.json"
OUTPUT = ROOT / "data" / "arabic-wordnet" / "game-index.json"

# Conservative keyword signals. Ambiguous entries stay unclassified and can be
# resolved later by Wikidata / OMW or an admin review queue.
SIGNALS = {
    "human": [
        "انسان", "شخص", "بشر", "رجل", "امرأة", "امراه", "ولد", "بنت",
        "ذكر", "انثى", "اسم شخص", "شخصية", "فرد", "مؤلف", "شاعر", "ملك",
        "رئيس", "عالم", "طبيب", "مهندس", "كاتب", "رسام", "ممثل",
    ],
    "animal": [
        "حيوان", "طائر", "حشرة", "سمكة", "سمك", "ثديي", "زاحف", "برمائي",
        "قارض", "مفترس", "دابة", "دواب", "طير", "دود", "حيوان مائي",
    ],
    "plant": [
        "نبات", "شجرة", "نبات عشبي", "عشب", "زهرة", "ورد", "فاكهة", "ثمار",
        "خضار", "شجيرة", "كرمة", "نخلة", "حبوب", "بقول", "فطر",
    ],
    "object": [
        "أداة", "اداة", "آلة", "اله", "جهاز", "شيء", "مادة", "قطعة", "أثاث",
        "مركبة", "سيارة", "سلاح", "ملابس", "وعاء", "حاوية", "أداة يدوية",
        "أداة منزلية", "جسم", "منتج", "معدات", "آلة موسيقية",
    ],
    "country": [
        "دولة", "جمهورية", "مملكة", "سلطنة", "إمارة", "بلد", "دولة ذات سيادة",
        "دولة مستقلة", "بلاد",
    ],
}

EXCLUDE = [
    "فعل", "صفة", "ظرف", "حرف", "ضمير", "أداة ربط", "حرف جر", "مصدر",
    "فعل مضارع", "فعل ماض", "فعل أمر",
]


def normalize_text(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value).strip()


def score_category(text: str, category: str) -> int:
    score = 0
    for signal in SIGNALS[category]:
        if normalize_text(signal) in text:
            score += 1
    return score


def classify_entry(lemma: str, entry: dict[str, object]) -> tuple[str | None, float]:
    definitions = " ".join(str(item) for item in entry.get("definitions", []))
    pos = " ".join(str(item) for item in entry.get("pos", []))
    text = normalize_text(f"{definitions} {pos} {lemma}")

    if any(normalize_text(item) in text for item in EXCLUDE):
        return None, 0.0

    scores = {category: score_category(text, category) for category in SIGNALS}
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_category, best_score = ranked[0]
    second_score = ranked[1][1]

    # Require at least one strong signal and a clear margin over alternatives.
    if best_score <= 0 or best_score == second_score:
        return None, 0.0

    confidence = min(0.98, 0.72 + (0.08 * best_score) + (0.04 * max(0, best_score - second_score)))
    if confidence < 0.80:
        return None, 0.0

    return best_category, round(confidence, 3)


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE}. Run: npm run validation:awn")

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    entries = payload.get("entries", {})
    classified: dict[str, dict[str, object]] = {}
    counts = {category: 0 for category in SIGNALS}

    for lemma, entry in entries.items():
        category, confidence = classify_entry(lemma, entry)
        if not category:
            continue
        classified[lemma] = {
            "category": category,
            "confidence": confidence,
            "synsets": entry.get("synsets", []),
            "pos": entry.get("pos", []),
        }
        counts[category] += 1

    output = {
        "source": payload.get("source"),
        "license": payload.get("license"),
        "categories": list(SIGNALS.keys()),
        "entries": classified,
        "counts": counts,
        "classified_total": len(classified),
    }

    OUTPUT.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(f"Classified {len(classified):,} GAME entries from {len(entries):,} Arabic lemmas")
    for category, count in counts.items():
        print(f"  {category:8s}: {count:,}")
    print(f"Review/uncategorized: {len(entries) - len(classified):,}")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
