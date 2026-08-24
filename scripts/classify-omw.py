from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "omw" / "arabic.json"
OUTPUT = ROOT / "data" / "omw" / "game-index.json"

SIGNALS = {
    "human": [
        "انسان", "شخص", "بشر", "رجل", "امرأة", "امراه", "ولد", "بنت",
        "ذكر", "انثى", "شخصية", "فرد", "شاعر", "ملك", "رئيس", "عالم",
        "طبيب", "مهندس", "كاتب", "رسام", "ممثل", "مؤلف",
    ],
    "animal": [
        "حيوان", "طائر", "حشرة", "سمكة", "سمك", "ثديي", "زاحف", "برمائي",
        "قارض", "مفترس", "دابة", "دواب", "طير", "حيوان مائي",
    ],
    "plant": [
        "نبات", "شجرة", "نبات عشبي", "عشب", "زهرة", "ورد", "فاكهة", "ثمار",
        "خضار", "شجيرة", "كرمة", "نخلة", "حبوب", "بقول", "فطر",
    ],
    "object": [
        "أداة", "اداة", "آلة", "اله", "جهاز", "شيء", "مادة", "قطعة", "أثاث",
        "مركبة", "سيارة", "سلاح", "ملابس", "وعاء", "حاوية", "جسم", "منتج",
        "معدات", "آلة موسيقية", "مبنى", "منزل", "جسر", "طائرة", "سفينة",
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


def normalize(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value).strip()


def score(text: str, category: str) -> int:
    return sum(1 for signal in SIGNALS[category] if normalize(signal) in text)


def classify(word: str, item: dict[str, object]) -> tuple[str | None, float]:
    definitions = " ".join(str(v) for v in item.get("definitions", []))
    pos = " ".join(str(v) for v in item.get("pos", []))
    text = normalize(f"{word} {definitions} {pos}")

    if any(normalize(term) in text for term in EXCLUDE):
        return None, 0.0

    scores = {category: score(text, category) for category in SIGNALS}
    ranked = sorted(scores.items(), key=lambda pair: pair[1], reverse=True)
    best_category, best_score = ranked[0]
    second_score = ranked[1][1]

    if best_score < 1 or best_score == second_score:
        return None, 0.0

    confidence = min(0.96, 0.78 + 0.07 * best_score + 0.04 * (best_score - second_score))
    if confidence < 0.82:
        return None, 0.0
    return best_category, round(confidence, 3)


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit("Missing OMW index. Run: npm run validation:omw")

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    entries = payload.get("entries", {})

    classified: dict[str, dict[str, object]] = {}
    counts = {category: 0 for category in SIGNALS}

    for word, item in entries.items():
        category, confidence = classify(word, item)
        if not category:
            continue
        classified[word] = {
            "category": category,
            "confidence": confidence,
            "synsets": item.get("synsets", []),
            "pos": item.get("pos", []),
        }
        counts[category] += 1

    OUTPUT.write_text(
        json.dumps(
            {
                "source": payload.get("source"),
                "categories": list(SIGNALS),
                "entries": classified,
                "counts": counts,
                "classified_total": len(classified),
                "review_total": len(entries) - len(classified),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Classified {len(classified):,} OMW GAME entries from {len(entries):,} Arabic lemmas")
    for category, count in counts.items():
        print(f"  {category:8s}: {count:,}")
    print(f"Review/uncategorized: {len(entries) - len(classified):,}")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
