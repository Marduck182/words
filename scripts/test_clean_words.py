import unittest

from clean_words import clean, book_of

KEYS = {"id", "word", "translation", "ipa", "example_en", "example_es", "book"}


def raw(palabra, trad="Algo", pos=None, **extra):
    audio = f"01_{pos:04d}.mp3" if pos else "pronunc123.mp3"
    base = {
        "id": 1000 + (pos or 0),
        "palabra": palabra,
        "imagen": f'<img src="01_{pos or 0:04d}.jpg" />',
        "audio_pron": audio,
        "audio_ejemplo": audio.replace(".mp3", "_example.mp3"),
        "traduccion": trad,
        "ejemplo_en": "An example.",
        "ejemplo_es": "Un ejemplo.",
        "fonetica": "ig-ˈzam-pəl",
        "ejemplo_fonetica": "An ejémpol.",
    }
    base.update(extra)
    return base


class CleanWords(unittest.TestCase):
    def test_output_has_only_the_study_fields(self):
        out, _ = clean([raw("agree", pos=1)])
        self.assertEqual(set(out[0]), KEYS)

    def test_drops_rows_without_translation_as_junk(self):
        out, report = clean([raw("agree", "Aceptar", pos=1), raw("ghost", "", pos=2)])
        self.assertEqual([w["word"] for w in out], ["agree"])
        self.assertEqual(report["junk"], 1)

    def test_spreadsheet_FALSE_is_the_word_false_and_beats_its_empty_twin(self):
        # En el origen, Excel convirtió "false" en FALSE; la fila en minúscula está vacía.
        rows = [raw("false", "", pos=528), raw("FALSE", "Falso", pos=528)]
        out, report = clean(rows)
        self.assertEqual([(w["word"], w["translation"]) for w in out], [("false", "Falso")])
        self.assertEqual((report["junk"], report["duplicates"]), (1, 0))

    def test_keeps_real_uppercase_words_like_DNA(self):
        out, _ = clean([raw("DNA", "ADN", pos=1)])
        self.assertEqual(out[0]["word"], "DNA")

    def test_dedupes_case_insensitively_keeping_the_first_in_position_order(self):
        rows = [raw("update", "Actualizar", pos=300), raw("Update", "Renovar", pos=100)]
        out, report = clean(rows)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["translation"], "Renovar")
        self.assertEqual(report["duplicates"], 1)

    def test_orders_by_audio_position_and_numbers_ids_from_one(self):
        rows = [raw("b", pos=2), raw("a", pos=1), raw("c", pos=3)]
        out, _ = clean(rows)
        self.assertEqual([(w["id"], w["word"]) for w in out], [(1, "a"), (2, "b"), (3, "c")])

    def test_row_without_a_position_goes_last_with_no_book(self):
        out, _ = clean([raw("answer", pos=None), raw("agree", pos=1)])
        self.assertEqual([w["word"] for w in out], ["agree", "answer"])
        self.assertIsNone(out[1]["book"])

    def test_book_is_six_hundred_words_each(self):
        self.assertEqual(book_of(1), 1)
        self.assertEqual(book_of(600), 1)
        self.assertEqual(book_of(601), 2)
        self.assertEqual(book_of(3600), 6)
        self.assertIsNone(book_of(None))

    def test_translation_sentence_case_only_for_multiword_variants(self):
        rows = [
            raw("bit", "Un Poco", pos=1),
            raw("agree", "Aceptar, Acordar", pos=2),
            raw("august", "Agosto", pos=3),
        ]
        out, _ = clean(rows)
        self.assertEqual([w["translation"] for w in out], ["Un poco", "Aceptar, Acordar", "Agosto"])

    def test_collapses_whitespace_and_nulls_empty_optional_fields(self):
        rows = [raw("agree", "  Aceptar   ", pos=1, fonetica="", ejemplo_es="  ")]
        out, _ = clean(rows)
        self.assertEqual(out[0]["translation"], "Aceptar")
        self.assertIsNone(out[0]["ipa"])
        self.assertIsNone(out[0]["example_es"])


if __name__ == "__main__":
    unittest.main()
