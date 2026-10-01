"""Mesin interpretasi: status lampu, isi narasi, bahasa berhati-hati, glosarium."""

import numpy as np
import pytest

from raschlite.core.simulate import rsm_delta, simulate_dichotomous, simulate_responses
from raschlite.interpret import GLOSSARY, interpret, to_markdown, tooltip
from raschlite.interpret import rules

KEYS = ["reliability", "item_fit", "dimensionality", "targeting", "categories", "dif"]


def _lights(res):
    return {light.key: light for light in interpret(res).lights}


def _section(res, key):
    return next(s for s in interpret(res).sections if s.key == key)


@pytest.fixture
def clean_dichotomous(analyze):
    rng = np.random.default_rng(41)
    X = simulate_dichotomous(rng.normal(0, 1, 800), rng.uniform(-2, 2, 25), rng)
    return analyze(X, "dichotomous")


def test_six_lights_in_fixed_order_with_one_sentence(clean_dichotomous):
    interp = interpret(clean_dichotomous)
    assert [light.key for light in interp.lights] == KEYS
    for light in interp.lights:
        assert light.status in (rules.GREEN, rules.YELLOW, rules.RED, rules.GRAY)
        assert light.sentence.endswith(".") and light.sentence.count(". ") == 0


def test_clean_data_mostly_green_and_not_applicable_is_gray(clean_dichotomous):
    lights = _lights(clean_dichotomous)
    assert lights["item_fit"].status == rules.GREEN
    assert lights["dimensionality"].status == rules.GREEN
    assert lights["targeting"].status == rules.GREEN
    assert lights["categories"].status == rules.GRAY
    assert lights["dif"].status == rules.GRAY


def test_random_items_flagged_in_strict_mode_but_not_by_default(analyze):
    """Butir berespons acak memiliki outfit sekitar 1,4: di dalam rentang produktif
    0,5-1,5 (lampu hijau) tetapi di luar rentang ketat 0,8-1,2 (lampu kuning)."""
    rng = np.random.default_rng(42)
    X = simulate_dichotomous(rng.normal(0, 1, 1000), rng.uniform(-2, 2, 30), rng)
    for j in (4, 15, 26):
        X[:, j] = (rng.random(1000) < 0.5).astype(float)
    default = analyze(X, "dichotomous", run_dif=False)
    assert _lights(default)["item_fit"].status == rules.GREEN
    strict = analyze(X, "dichotomous", run_dif=False, strict_fit=True)
    light = _lights(strict)["item_fit"]
    assert light.status == rules.YELLOW
    for name in ("I05", "I16", "I27"):
        assert name in light.sentence


def test_negative_point_measure_is_red_with_reverse_coding_advice(analyze):
    rng = np.random.default_rng(43)
    X = simulate_dichotomous(rng.normal(0, 1, 600), rng.uniform(-2, 2, 20), rng)
    X[:, 3] = 1.0 - X[:, 3]  # butir I04 berkunci terbalik
    res = analyze(X, "dichotomous", run_dif=False)
    assert _lights(res)["item_fit"].status == rules.RED
    sec = _section(res, "item_fit")
    assert any("I04" in a and "balik" in a for a in sec.actions)
    assert any("reverse-coded" in p for p in sec.paragraphs)


def test_dif_large_is_red_and_direction_stated(analyze):
    rng = np.random.default_rng(44)
    N, L = 1000, 20
    theta = rng.normal(0, 1, N)
    b = np.tile(rng.uniform(-2, 2, L), (N, 1))
    b[N // 2:, 5] += 1.2
    X = (rng.random((N, L)) < 1 / (1 + np.exp(-(theta[:, None] - b)))).astype(float)
    groups = np.array(["A"] * (N // 2) + ["B"] * (N // 2), dtype=object)
    res = analyze(X, "dichotomous", groups=groups)
    assert _lights(res)["dif"].status == rules.RED
    text = " ".join(_section(res, "dif").paragraphs)
    assert "I06 lebih sulit bagi kelompok B" in text


def test_two_dimensional_data_flags_dimensionality(analyze):
    rng = np.random.default_rng(45)
    th = rng.multivariate_normal([0, 0], [[1, 0.3], [0.3, 1]], 1000)
    b = rng.uniform(-2, 2, 30)
    dim = np.repeat([0, 1], 15)
    X = (rng.random((1000, 30)) < 1 / (1 + np.exp(-(th[:, dim] - b)))).astype(float)
    res = analyze(X, "dichotomous", run_dif=False)
    eig = res.dimensionality["first_contrast_eigenvalue"]
    expected = rules.RED if eig >= rules.CONTRAST_EIGENVALUE_RED else rules.YELLOW
    assert _lights(res)["dimensionality"].status == expected
    assert _section(res, "dimensionality").actions


def test_mistargeted_test_is_red_with_direction(analyze):
    rng = np.random.default_rng(46)
    X = simulate_dichotomous(rng.normal(2.6, 1, 800), rng.uniform(-1.5, 1.5, 20), rng)
    res = analyze(X, "dichotomous", run_dif=False)
    light = _lights(res)["targeting"]
    assert light.status == rules.RED and "di atas" in light.sentence
    assert any("lebih sulit" in a for a in _section(res, "targeting").actions)


def test_disordered_pcm_item_red_with_merge_advice(analyze):
    rng = np.random.default_rng(47)
    L = 15
    tau = np.tile([-1.5, -0.5, 0.5, 1.5], (L, 1))
    tau[2] = [-1.0, 0.8, -0.8, 1.0]
    b = rng.uniform(-1, 1, L)
    res = analyze(simulate_responses(rng.normal(0, 1, 1000), b[:, None] + tau, rng), "pcm", run_dif=False)
    assert _lights(res)["categories"].status == rules.RED
    assert any("I03" in a and "menggabungkan kategori" in a for a in _section(res, "categories").actions)


def test_rsm_clean_categories_green(analyze):
    rng = np.random.default_rng(48)
    X = simulate_responses(rng.normal(0, 1, 800), rsm_delta(rng.uniform(-1, 1, 12), [-1.5, -0.5, 0.5, 1.5]), rng)
    res = analyze(X, "rsm", run_dif=False)
    assert _lights(res)["categories"].status == rules.GREEN


def test_language_is_cautious(clean_dichotomous, analyze):
    rng = np.random.default_rng(49)
    X = simulate_dichotomous(rng.normal(0, 1, 500), rng.uniform(-2, 2, 15), rng)
    X[:, 0] = 1.0 - X[:, 0]
    texts = [to_markdown(interpret(clean_dichotomous)), to_markdown(interpret(analyze(X, "dichotomous")))]
    for text in texts:
        lower = text.lower()
        for banned in ("terbukti", "dipastikan", "pasti ", "tidak diragukan", "menyebabkan"):
            assert banned not in lower
    assert "mengindikasikan" in texts[1]


def test_technical_layer_has_thresholds_and_references(clean_dichotomous):
    for sec in interpret(clean_dichotomous).sections:
        if sec.status == rules.GRAY:
            continue
        assert sec.technical and sec.references
        assert any(row.criterion for row in sec.technical)


def test_glossary_covers_required_terms():
    required = ["logit", "infit", "outfit", "mnsq", "zstd", "separation", "reliability", "threshold", "dif",
                "unidimensionality"]
    for key in required:
        assert key in GLOSSARY and GLOSSARY[key].short and GLOSSARY[key].long
        assert tooltip(key).startswith(GLOSSARY[key].term)
