"""Limpia words.json (del proyecto English-PWA) para la app de vocabulario.

Uso:
    python -X utf8 scripts/clean_words.py _source/words.raw.json src-tauri/data/words.json

Quita imagen/audio/fonética de ejemplo, descarta filas sin traducción, repara "FALSE" -> "false",
deduplica palabras, ordena por la posición original (1..3600) y numera desde 1.
"""
import json
import math
import re
import sys

WORDS_PER_BOOK = 600
POSITION = re.compile(r"^\d+_(\d{4})\.mp3$")


def book_of(position):
    if position is None:
        return None
    return math.ceil(position / WORDS_PER_BOOK)


def _text(value):
    """Texto con espacios colapsados, o None si queda vacío."""
    collapsed = " ".join(str(value or "").split())
    return collapsed or None


def _sentence_case(variant):
    words = variant.split(" ")
    if len(words) > 1 and all(w[:1].isupper() for w in words):
        return " ".join([words[0]] + [w.lower() for w in words[1:]])
    return variant


def _translation(value):
    text = _text(value)
    if text is None:
        return None
    return ", ".join(_sentence_case(v.strip()) for v in text.split(","))


def _position(row):
    match = POSITION.match(str(row.get("audio_pron") or ""))
    return int(match.group(1)) if match else None


def clean(rows):
    """Devuelve (palabras_limpias, reporte)."""
    report = {"input": len(rows), "junk": 0, "duplicates": 0}
    kept = []
    for row in rows:
        word = _text(row.get("palabra"))
        translation = _translation(row.get("traduccion"))
        if word is None or translation is None:
            report["junk"] += 1
            continue
        if word == "FALSE":  # Excel convirtió la palabra "false" en booleano
            word = "false"
        kept.append((_position(row), row, word, translation))

    kept.sort(key=lambda item: math.inf if item[0] is None else item[0])

    seen = set()
    out = []
    for position, row, word, translation in kept:
        key = word.lower()
        if key in seen:
            report["duplicates"] += 1
            continue
        seen.add(key)
        out.append(
            {
                "id": len(out) + 1,
                "word": word,
                "translation": translation,
                "ipa": _text(row.get("fonetica")),
                "example_en": _text(row.get("ejemplo_en")),
                "example_es": _text(row.get("ejemplo_es")),
                "book": book_of(position),
            }
        )
    report["output"] = len(out)
    return out, report


def main(src, dst):
    with open(src, encoding="utf-8") as f:
        rows = json.load(f)
    words, report = clean(rows)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(json.dumps(report, ensure_ascii=False))
    empty = {k: sum(1 for w in words if w[k] is None) for k in ("ipa", "example_en", "example_es", "book")}
    print("campos vacíos:", empty)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
