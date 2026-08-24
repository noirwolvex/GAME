from __future__ import annotations

import gzip
import json
import re
import sys
import urllib.request
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "arabic-wordnet"
RAW_FILE = DATA_DIR / "awn4.xml.gz"
INDEX_FILE = DATA_DIR / "index.json"
URL = "https://github.com/Salah-Sal/arabic-wordnet-v4/releases/download/v4.1.0/awn4.xml.gz"


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def download() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if RAW_FILE.exists():
        return
    print(f"Downloading Arabic WordNet 4.1.0 from {URL}")
    request = urllib.request.Request(
        URL,
        headers={"User-Agent": "GAME-validation/0.1"},
    )
    with urllib.request.urlopen(request, timeout=60) as response, RAW_FILE.open("wb") as out:
        out.write(response.read())


def build_index() -> None:
    print("Building compact Arabic WordNet lookup index...")
    entries: dict[str, dict[str, object]] = {}
    synset_count = 0

    with gzip.open(RAW_FILE, "rb") as handle:
        for event, elem in ET.iterparse(handle, events=("end",)):
            if elem.tag.endswith("synset"):
                synset_count += 1
                pos = elem.attrib.get("partOfSpeech", "")
                synset_id = elem.attrib.get("id", "")
                lemmas: list[str] = []
                for child in elem.iter():
                    if child.tag.endswith("lemma"):
                        lemma = child.attrib.get("writtenForm", "") or (child.text or "")
                        lemma = normalize(lemma)
                        if lemma and lemma not in lemmas:
                            lemmas.append(lemma)
                definition = ""
                for child in elem.iter():
                    if child.tag.endswith("definition") and child.text:
                        definition = normalize(child.text)
                        break

                for lemma in lemmas:
                    bucket = entries.setdefault(
                        lemma,
                        {"synsets": [], "pos": [], "definitions": []},
                    )
                    if synset_id and synset_id not in bucket["synsets"]:
                        bucket["synsets"].append(synset_id)
                    if pos and pos not in bucket["pos"]:
                        bucket["pos"].append(pos)
                    if definition and definition not in bucket["definitions"]:
                        bucket["definitions"].append(definition)

                elem.clear()

    payload = {
        "source": "Arabic WordNet 4.1.0",
        "source_url": "https://github.com/Salah-Sal/arabic-wordnet-v4/releases/tag/v4.1.0",
        "license": "CC BY 4.0",
        "language": "arb",
        "synsets": synset_count,
        "words": len(entries),
        "entries": entries,
    }
    INDEX_FILE.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Indexed {len(entries):,} Arabic lemmas from {synset_count:,} synsets")


def main() -> int:
    try:
        download()
        build_index()
        print(f"Done: {INDEX_FILE}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
