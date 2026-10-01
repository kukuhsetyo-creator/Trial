"""Kebijakan istilah: istilah teknis Rasch tampil dalam bahasa Inggris aslinya.

Penjelasan, analogi, dan saran tetap berbahasa Indonesia, tetapi nama statistik,
judul tabel, judul lampu, label kolom, judul glosarium, dan seluruh teks pada grafik
memakai istilah baku (Item, Person, Separation, Wright Map, Andrich Threshold, ...).
"""

import re

import pytest
from matplotlib.text import Text

from raschlite.core import messages
from raschlite.core.analysis import run_analysis
from raschlite.core.data import prepare_data, read_table
from raschlite.gui import strings as S
from raschlite.interpret import GLOSSARY, interpret, to_markdown
from raschlite.plots import CHARTS, available_charts, item_choices, render
from raschlite.resources import SAMPLES, sample_path

#: Terjemahan Indonesia untuk istilah teknis yang diganti istilah Inggris aslinya.
TRANSLATED_TERMS = [
    "reliabilitas", "separasi", "kecocokan", "dimensionalitas", "unidimensionalitas", "dependensi lokal",
    "kesesuaian target", "fungsi kategori", "peta wright", "kurva karakteristik", "kurva peluang",
    "kurva skor harapan", "fungsi informasi", "galat baku", "kontras pertama", "kontras dif", "skor ekstrem",
    "berskor ekstrem", "threshold tidak berurutan", "threshold tak berurutan", "rerata teramati",
    "korelasi point-measure", "dikotomus", "politomus",
]
#: Kata Indonesia yang tidak boleh muncul pada label (nama istilah) dan teks grafik.
INDONESIAN_WORDS = re.compile(
    r"\b(butir|responden|kategori|kelompok|peluang|jumlah|rerata|rata-rata|selisih|satuan|dan|pada|dari|"
    r"tidak|dengan|untuk)\b", re.IGNORECASE)


def _analyse(kind, model):
    cfg = SAMPLES[kind]
    df = read_table(sample_path(kind))
    cols = [c for c in df.columns if c not in (cfg["id"], cfg["group"])]
    return run_analysis(prepare_data(df, cols, id_col=cfg["id"], group_col=cfg["group"]), model)


@pytest.fixture(scope="module", params=[("dichotomous", "dichotomous"), ("polytomous", "rsm"),
                                        ("polytomous", "pcm")], ids=["dichotomous", "rsm", "pcm"])
def res(request):
    return _analyse(*request.param)


def _no_translated_terms(text, where):
    lower = text.lower()
    found = [t for t in TRANSLATED_TERMS if t in lower]
    assert not found, (where, found, text[:200])


def _english_label(text, where):
    assert not INDONESIAN_WORDS.search(text), (where, text)
    _no_translated_terms(text, where)


def test_column_tab_table_and_sheet_labels_are_english_terms():
    for key, label in S.COLUMNS.items():
        _english_label(label, f"kolom {key}")
    for name in ("TAB_ITEMS", "TAB_PERSONS", "TAB_CATEGORIES", "TAB_DIMENSION", "TAB_LOCAL", "TAB_DIF"):
        _english_label(getattr(S, name), name)
    for key, title in S.TABLE_TITLES.items():
        _english_label(title, f"judul tabel {key}")
    for key in ("items", "persons", "categories", "dif", "loadings", "q3", "q3_pairs", "iterations"):
        _english_label(S.SHEETS[key], f"sheet {key}")
    for key, label in S.MODEL_LABELS.items():
        _english_label(label, f"model {key}")


def test_glossary_terms_are_english_with_indonesian_explanations():
    for key, term in GLOSSARY.items():
        _english_label(term.term, f"glosarium {key}")
        _no_translated_terms(term.short + " " + term.long, f"glosarium {key}")
        assert INDONESIAN_WORDS.search(term.long), key  # penjelasannya tetap berbahasa Indonesia


def test_engine_messages_use_english_terms():
    for name, text in vars(messages).items():
        if name.isupper() and isinstance(text, str):
            _no_translated_terms(text, name)


def test_interpretation_titles_and_technical_labels_are_english(res):
    interp = interpret(res)
    assert interp.model_name == S.MODEL_LABELS[res.model]
    for light in interp.lights:
        _english_label(light.title, f"lampu {light.key}")
    for sec in interp.sections:
        _english_label(sec.title, f"bagian {sec.key}")
        for row in sec.technical:
            _english_label(row.label, f"detail teknis {sec.key}")
    text = to_markdown(interp)
    _no_translated_terms(text, "narasi")
    for term in ("person reliability", "separation", "measure", "Infit", "Outfit", "first contrast eigenvalue",
                 "Targeting", "DIF contrast"):
        assert term.lower() in text.lower(), term
    assert "mengindikasikan" in text  # penjelasan tetap berbahasa Indonesia


def test_status_labels_in_tables_are_english(res):
    statuses = set(res.persons["status"]) | set(res.items["status"])
    for status in statuses - {""}:
        _english_label(status, "status")


def test_all_chart_text_is_english(res):
    items = item_choices(res)[:1]
    for spec in available_charts(res):
        fig = render(res, spec.key, items[0]) if spec.per_item else render(res, spec.key)
        texts = [t.get_text() for t in fig.findobj(Text) if t.get_text().strip()]
        assert texts, spec.key
        for text in texts:
            _english_label(text, f"grafik {spec.key}")
        _no_translated_terms(spec.how_to_read(res), f"cara membaca {spec.key}")
        fig.clear()


def test_chart_titles_are_english_terms():
    for spec in CHARTS:
        _english_label(spec.title, spec.key)
