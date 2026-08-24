from __future__ import annotations

import gzip
import json
import re
import tarfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "omw"
ARCHIVE = DATA_DIR / "omw-arb-2.0.tar.xz"
OUTPUT = DATA_DIR / "arabic.json"
URL = "https://github.com/omwn/omw-data/releases/download/v2.0/omw-arb-2.0.tar.xz"


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def download() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if ARCHIVE.exists():
        return
    print(f"Downloading OMW Arabic 2.0 from {URL}")
    request = urllib.request.Request(URL, headers={"User-Agent": "GAME-validation/0.1"})
    with urllib.request.urlopen(request, timeout=90) as response, ARCHIVE.open("wb") as out:
        out.write(response.read())


def find_xml() -> bytes:
    with tarfile.open(ARCHIVE, "r:xz") as archive:
        xml_members = [m for m in archive.getmembers() if m.name.endswith(".xml")]
        if not xml_members:
            raise RuntimeError("No XML file found in OMW Arabic archive")
        member = max(xml_members, key=lambda m: m.size)
        extracted = archive.extractfile(member)
        if extracted is None:
            raise RuntimeError(f"Unable to extract {member.name}")
        return extracted.read()


def build_index() -> None:
    xml_bytes = find_xml()
    entries: dict[str, dict[str, object]] = {}
    synsets = 0

    root = ET.fromstring(xml_bytes)
    for synset in root.iter():
        if not synset.tag.endswith("Synset"):
            continue
        synsets += 1
        synset_id = synset.attrib.get("id", "")
        for child in synset.iter():
            if not child.tag.endswith("Lemma"):
                continue
            written = child.attrib.get("writtenForm", "") or (child.text or "")
            word = normalize(written)
            if len(word) < 2:
                continue
            item = entries.setdefault(word, {"synsets": [], "source": "omw-arb-2.0", "confidence": 0.84})
            if synset_id and synset_id not in item["synsets"]:
                item["synsets"].append(synset_id)

    OUTPUT.write_text(
        json.dumps(
            {
                "source": "Open Multilingual Wordnet Arabic 2.0",
                "source_url": "https://github.com/omwn/omw-data/releases/tag/v2.0",
                "license": "Consult individual wordnet license; Arabic WordNet is CC BY-SA 3.0",
                "language": "arb",
                "synsets": synsets,
                "words": len(entries),
                "entries": entries,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"Indexed {len(entries):,} Arabic OMW lemmas from {synsets:,} synsets")
    print(f"Done: {OUTPUT}")


def main() -> int:
    download()
    build_index()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
