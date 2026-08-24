from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "arabic-wordnet" / "expanded-game-index.json"
AWN = ROOT / "data" / "arabic-wordnet" / "index.json"
OUTPUT = ROOT / "data" / "arabic-wordnet" / "review-game-index.json"

CATEGORIES = ("human", "animal", "plant", "object", "country")
NOUN_POS = {"n", "noun", "اسم", "proper-noun", "proper_noun", "prop"}

SIGNALS = {
    "human": ["اسم شخص", "شخص", "انسان", "بشر", "رجل", "امرأة", "ملك", "ملكة", "أمير", "أميرة", "زعيم", "رئيس", "شاعر", "كاتب", "فنان", "عالم", "باحث", "طبيب", "مهندس", "لاعب", "رياضي", "سياسي"],
    "animal": ["حيوان", "طائر", "حشرة", "سمكة", "ثديي", "زاحف", "برمائي", "قارض", "مفترس", "لافقاري", "فقاري", "رخوي", "قشري", "دابة"],
    "plant": ["نبات", "شجرة", "عشب", "زهرة", "فاكهة", "ثمرة", "خضار", "شجيرة", "كرمة", "نخلة", "محصول", "بذور", "فطر"],
    "object": ["أداة", "جهاز", "آلة", "مركبة", "سيارة", "سفينة", "طائرة", "قطار", "وعاء", "حاوية", "أثاث", "ملابس", "مادة", "معدن", "صخر", "حجر", "كتاب", "وثيقة", "لوحة", "تمثال", "طعام", "شراب", "دواء", "مركب", "برنامج حاسوب"],
    "country": ["دولة", "بلد", "بلاد", "جمهورية", "مملكة", "سلطنة", "إمارة", "دولة عربية", "دولة أوروبية", "دولة آسيوية", "دولة أفريقية", "دولة في الشرق الأوسط"],
}

EXCLUDE = ["فعل", "صفة", "ظرف", "حرف", "ضمير", "حرف جر", "حرف عطف", "أداة استفهام", "أداة نفي", "أداة شرط", "اسم فاعل", "اسم مفعول"]


def norm(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value).replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def score(text: str, category: str) -> int:
    return sum(1 for s in SIGNALS[category] if norm(s) in text)


def main() -> int:
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    awn = json.loads(AWN.read_text(encoding="utf-8")).get("entries", {})
    review = payload.get("review", {})
    out: dict[str, dict[str, object]] = {}
    counts = {c: 0 for c in CATEGORIES}
    for word, item in review.items():
        base = awn.get(word, {})
        definitions = " ".join(str(x) for x in base.get("definitions", []))
        pos = [norm(str(x)) for x in base.get("pos", [])]
        text = norm(f"{word} {definitions}")
        if any(norm(x) in text for x in EXCLUDE):
            continue
        noun = any(x in NOUN_POS for x in pos)
        scores = {c: score(text, c) for c in CATEGORIES}
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        best, best_score = ranked[0]
        second = ranked[1][1]
        if best_score < 1 or best_score == second:
            continue
        # Second-pass threshold: require either noun POS + signal, or a strong two-signal margin.
        confidence = 0.62 + 0.06 * best_score + 0.06 * (best_score - second) + (0.06 if noun else 0)
        confidence = min(0.93, round(confidence, 3))
        if confidence < 0.74:
            continue
        out[word] = {
            "word": word,
            "category": best,
            "confidence": confidence,
            "tier": "review-verified-candidate",
            "sources": ["arabic-wordnet"],
            "synsets": base.get("synsets", []),
            "pos": base.get("pos", []),
        }
        counts[best] += 1
    OUTPUT.write_text(json.dumps({"source": "Arabic WordNet 4.1.0", "entries": out, "counts": counts, "classified_total": len(out)}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Second-pass AWN candidates: {len(out):,} from {len(review):,} review entries")
    for c in CATEGORIES:
        print(f"  {c:8s}: {counts[c]:,}")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
