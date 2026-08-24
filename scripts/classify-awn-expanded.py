from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "arabic-wordnet" / "index.json"
OUTPUT = ROOT / "data" / "arabic-wordnet" / "expanded-game-index.json"

CATEGORIES = ("human", "animal", "plant", "object", "country")

# Broader semantic signals than the first conservative classifier. The classifier
# still requires noun-like POS evidence and a margin between the best and second
# category. Borderline entries go to the review pool instead of live GAME.
SIGNALS = {
    "human": [
        "انسان", "شخص", "بشر", "شخص من", "فرد", "رجل", "امرأة", "امراه", "ولد", "بنت",
        "ذكر", "انثى", "شخصية", "شخص معروف", "اسم شخص", "اسم علم", "ملك", "ملكة", "امير", "أمير",
        "اميرة", "أميرة", "رئيس", "زعيم", "قائد", "كاتب", "مؤلف", "شاعر", "روائي", "فنان",
        "رسام", "ممثل", "ممثلة", "مغني", "مغنية", "لاعب", "رياضي", "عالم", "عالم في", "باحث",
        "طبيب", "مهندس", "معلم", "مخترع", "سياسي", "وزير", "سفير", "فيلسوف", "مؤرخ", "رحالة",
    ],
    "animal": [
        "حيوان", "طائر", "حشرة", "سمكة", "سمك", "ثديي", "ثدييات", "زاحف", "برمائي", "قارض",
        "مفترس", "دابة", "دواب", "طير", "دود", "لافقاري", "فقاري", "حيوان مائي", "حيوان بري",
        "حيوان بحري", "جنس من الحيوانات", "نوع من الحيوانات", "فصيلة من الحيوانات", "رتبة من الثدييات",
        "فصيلة من الطيور", "نوع من الطيور", "نوع من الأسماك", "نوع من الحشرات", "رخوي", "قشري",
        "عنكبوت", "عقرب", "دودة", "حيوان أليف", "حيوان بري",
    ],
    "plant": [
        "نبات", "شجرة", "نبات عشبي", "عشب", "زهرة", "ورد", "فاكهة", "ثمار", "خضار", "شجيرة",
        "كرمة", "نخلة", "حبوب", "بقول", "فطر", "نبات زراعي", "نبات طبي", "نبات بري", "نبات مائي",
        "نوع من النباتات", "جنس نباتي", "فصيلة نباتية", "شجرة مثمرة", "شجرة دائمة الخضرة", "شجرة معمرة",
        "محصول", "زراعة", "بذور", "ثمرة نباتية", "ورقة نبات", "زهرة نباتية",
    ],
    "object": [
        "شيء", "جسم مادي", "جسم مادي مصنوع", "جسم مادي صلب", "مادة", "أداة", "اداة", "آلة", "اله",
        "جهاز", "قطعة", "أثاث", "مركبة", "سيارة", "شاحنة", "دراجة", "سفينة", "طائرة", "قطار",
        "سلاح", "ملابس", "ثوب", "وعاء", "حاوية", "أداة يدوية", "أداة منزلية", "آلة موسيقية",
        "معدات", "منتج", "جسم", "مبنى", "منشأة", "مادة كيميائية", "مادة معدنية", "معدن", "صخر",
        "حجر", "عملة", "ورقة نقدية", "كتاب", "مستند", "وثيقة", "لوحة", "تمثال", "لعبة", "طعام",
        "شراب", "طبق", "أداة طبية", "دواء", "مركب", "مستحضر", "برنامج حاسوب", "جهاز إلكتروني",
    ],
    "country": [
        "دولة", "دولة ذات سيادة", "دولة مستقلة", "بلد", "بلاد", "جمهورية", "مملكة", "سلطنة", "إمارة",
        "اتحاد دول", "دولة اتحادية", "دولة جزيرية", "دولة أوروبية", "دولة آسيوية", "دولة أفريقية",
        "دولة عربية", "دولة في الشرق الأوسط", "دولة في أوروبا", "دولة في آسيا", "دولة في أفريقيا",
        "دولة في أمريكا", "دولة في الكاريبي", "دولة في أوقيانوسيا", "بلد مستقل", "كيان سياسي مستقل",
    ],
}

EXCLUDE = [
    "فعل", "صفة", "ظرف", "حرف", "ضمير", "أداة ربط", "حرف جر", "حرف عطف", "أداة استفهام",
    "أداة نفي", "أداة شرط", "أداة تعريف", "مصدر", "فعل مضارع", "فعل ماض", "فعل أمر", "اسم مصدر",
    "صيغة مبالغة", "اسم فاعل", "اسم مفعول", "حرف من حروف", "وحدة لغوية وظيفية",
]

NOUN_POS = {"n", "noun", "اسم", "proper-noun", "proper_noun", "prop"}
BAD_POS = {"v", "verb", "a", "adj", "s", "adv", "r", "preposition", "conjunction", "pronoun"}


def normalize_text(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value).strip()


def score_category(text: str, category: str) -> int:
    return sum(1 for signal in SIGNALS[category] if normalize_text(signal) in text)


def classify_entry(lemma: str, entry: dict[str, object]) -> tuple[str | None, float, str]:
    definitions = " ".join(str(item) for item in entry.get("definitions", []))
    pos_values = [normalize_text(str(item)) for item in entry.get("pos", [])]
    text = normalize_text(f"{definitions} {lemma}")

    if any(normalize_text(item) in text for item in EXCLUDE):
        return None, 0.0, "excluded_pos_or_definition"

    if any(pos in BAD_POS for pos in pos_values) and not any(pos in NOUN_POS for pos in pos_values):
        return None, 0.0, "non_noun_pos"

    noun_evidence = any(pos in NOUN_POS for pos in pos_values)
    scores = {category: score_category(text, category) for category in CATEGORIES}
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_category, best_score = ranked[0]
    second_score = ranked[1][1]

    # Candidate tier: one clear semantic signal plus noun-like evidence.
    if best_score <= 0 or best_score == second_score:
        return None, 0.0, "ambiguous"

    confidence = 0.60 + (0.07 * best_score) + (0.05 * max(0, best_score - second_score))
    if noun_evidence:
        confidence += 0.05

    confidence = min(0.96, round(confidence, 3))
    if confidence < 0.72:
        return None, confidence, "weak_signal"

    return best_category, confidence, "semantic_signal"


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE}. Run: npm run validation:awn")

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    entries = payload.get("entries", {})
    classified: dict[str, dict[str, object]] = {}
    review: dict[str, dict[str, object]] = {}
    counts = {category: 0 for category in CATEGORIES}

    for lemma, entry in entries.items():
        category, confidence, reason = classify_entry(lemma, entry)
        if category:
            classified[lemma] = {
                "word": lemma,
                "category": category,
                "confidence": confidence,
                "synsets": entry.get("synsets", []),
                "pos": entry.get("pos", []),
                "tier": "verified-candidate",
                "reason": reason,
            }
            counts[category] += 1
        elif reason in {"ambiguous", "weak_signal"}:
            review[lemma] = {
                "word": lemma,
                "pos": entry.get("pos", []),
                "synsets": entry.get("synsets", []),
                "reason": reason,
            }

    OUTPUT.write_text(
        json.dumps(
            {
                "source": payload.get("source"),
                "license": payload.get("license"),
                "categories": list(CATEGORIES),
                "entries": classified,
                "review": review,
                "counts": counts,
                "classified_total": len(classified),
                "review_total": len(review),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Expanded classifier candidates: {len(classified):,} from {len(entries):,} Arabic lemmas")
    for category, count in counts.items():
        print(f"  {category:8s}: {count:,}")
    print(f"Review candidates: {len(review):,}")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
