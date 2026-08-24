from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "arabic-wordlist"
RAW = DATA_DIR / "arabic-words.txt"
INDEX = DATA_DIR / "index.json"
URL = "https://raw.githubusercontent.com/MustafaLinux/arabic-words-list/main/arabic-words.txt"


def normalize(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def download() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if RAW.exists():
        return
    print(f"Downloading Arabic word list from {URL}")
    request = urllib.request.Request(URL, headers={"User-Agent": "GAME-validation/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response, RAW.open("wb") as out:
        out.write(response.read())


def main() -> int:
    download()
    words: set[str] = set()
    with RAW.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            # Keep only Arabic-looking single lexical forms for the broad candidate layer.
            word = normalize(line)
            if len(word) < 2:
                continue
            if not all(("\u0600" <= ch <= "\u06FF") or ch == " " for ch in word):
                continue
            if " " in word:
                continue
            words.add(word)

    sorted_words = sorted(words)
    INDEX.write_text(
        json.dumps(
            {
                "source": "MustafaLinux/arabic-words-list",
                "source_url": "https://github.com/MustafaLinux/arabic-words-list",
                "license": "MIT",
                "language": "ar",
                "words": len(sorted_words),
                "status": "broad-candidate-only",
                "entries": sorted_words,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"Indexed {len(sorted_words):,} broad Arabic word candidates")
    print("This layer is candidate-only and is NOT auto-approved for GAME categories.")
    print(f"Done: {INDEX}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
