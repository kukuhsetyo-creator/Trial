"""Validasi impor data, deteksi model, dan pengodean kategori."""

import numpy as np
import pandas as pd
import pytest

from raschlite.core.data import (
    DataValidationError,
    category_issues,
    code_responses,
    prepare_data,
    read_table,
)


def _codes(prep_or_coded):
    return {i.code for i in prep_or_coded.issues}


def test_non_integer_values_rejected_with_clear_message():
    df = pd.DataFrame({"ID": ["a", "b", "c"], "Q1": [1, 2.5, 0], "Q2": [1, "x", 0]})
    with pytest.raises(DataValidationError) as err:
        prepare_data(df, ["Q1", "Q2"], id_col="ID")
    text = str(err.value)
    assert "2 nilai yang bukan bilangan bulat" in text
    assert "baris 3 kolom 'Q1' berisi '2.5'" in text
    assert "baris 3 kolom 'Q2' berisi 'x'" in text


def test_missing_codes_and_blank_cells_become_missing():
    df = pd.DataFrame({"ID": ["a", "b", "c", "d"], "Q1": [1, 9, 0, ""], "Q2": [0, 1, "NA", 1]})
    prep = prepare_data(df, ["Q1", "Q2"], id_col="ID", missing_codes=[9])
    assert np.isnan(prep.raw[1, 0]) and np.isnan(prep.raw[3, 0]) and np.isnan(prep.raw[2, 1])
    assert prep.raw[0, 0] == 1


def test_item_without_variance_excluded_with_warning():
    df = pd.DataFrame({"Q1": [1, 0, 1, 0], "Q2": [1, 1, 1, 1], "Q3": [0, 1, 1, 0]})
    prep = prepare_data(df, ["Q1", "Q2", "Q3"])
    assert prep.item_names == ["Q1", "Q3"]
    assert prep.excluded_items == ["Q2"]
    assert "item_no_variance" in _codes(prep)


def test_person_missing_over_half_warned_and_empty_person_excluded():
    df = pd.DataFrame({"ID": ["a", "b", "c", "d"],
                       "Q1": [1, None, None, 0], "Q2": [0, None, 1, 1], "Q3": [1, None, None, 0]})
    prep = prepare_data(df, ["Q1", "Q2", "Q3"], id_col="ID")
    assert list(prep.person_ids) == ["a", "c", "d"]
    issues = {i.code: i for i in prep.issues}
    assert issues["person_no_response"].details["persons"] == ["b"]
    assert issues["person_heavy_missing"].details["persons"] == ["c"]


def test_dichotomous_detection_and_recode_from_1_2():
    df = pd.DataFrame({"Q1": [1, 2, 2, 1], "Q2": [2, 1, 2, 1]})
    prep = prepare_data(df, ["Q1", "Q2"])
    assert prep.response_type == "dichotomous" and prep.recommended_model == "dichotomous"
    coded = code_responses(prep, "dichotomous")
    assert set(np.unique(coded.X)) == {0.0, 1.0}
    assert "dichotomous_recode" in _codes(prep)


def test_model_recommendation_rsm_vs_pcm():
    same = pd.DataFrame({"Q1": [1, 2, 3, 4, 5], "Q2": [5, 4, 3, 2, 1]})
    assert prepare_data(same, ["Q1", "Q2"]).recommended_model == "rsm"
    mixed = pd.DataFrame({"Q1": [0, 1, 2, 1, 0], "Q2": [0, 1, 2, 3, 4]})
    prep = prepare_data(mixed, ["Q1", "Q2"])
    assert prep.recommended_model == "pcm"
    assert "Partial Credit" in prep.recommendation_reason


def test_unused_category_detected_and_recoded_contiguously():
    rng = np.random.default_rng(0)
    vals = rng.choice([1, 2, 4, 5], size=(60, 4))  # kategori 3 tidak pernah dipakai
    df = pd.DataFrame(vals, columns=["Q1", "Q2", "Q3", "Q4"])
    prep = prepare_data(df, list(df.columns))
    issues = category_issues(prep, "rsm")
    assert issues[0].code == "unused_category_global" and issues[0].details["categories"] == [3]
    coded = code_responses(prep, "rsm")
    assert int(coded.m[0]) == 3
    assert coded.category_labels[0] == ["1", "2", "4", "5"]


def test_pcm_items_may_have_different_category_counts():
    rng = np.random.default_rng(1)
    df = pd.DataFrame({"Q1": rng.integers(0, 2, 80), "Q2": rng.integers(0, 3, 80),
                       "Q3": rng.integers(0, 5, 80)})
    prep = prepare_data(df, list(df.columns))
    coded = code_responses(prep, "pcm")
    assert list(coded.m) == [1, 2, 4]
    assert "unused_category_item" in {i.code for i in coded.issues}


def test_extreme_persons_flagged():
    rng = np.random.default_rng(2)
    X = (rng.random((50, 6)) < 0.5).astype(int)
    X[0] = 0
    X[1] = 1
    df = pd.DataFrame(X, columns=[f"Q{i}" for i in range(6)])
    coded = code_responses(prepare_data(df, list(df.columns)), "dichotomous")
    assert coded.person_extreme[0] == -1 and coded.person_extreme[1] == 1


def test_top_category_used_only_by_extreme_persons_is_collapsed():
    rng = np.random.default_rng(3)
    X = rng.integers(0, 3, size=(40, 4))  # kategori 0..2
    X[:, 0] = np.minimum(X[:, 0], 1)
    X[0] = [2, 2, 2, 2]  # skor sempurna: satu-satunya pengguna kategori 2 pada Q0
    df = pd.DataFrame(X, columns=["Q0", "Q1", "Q2", "Q3"])
    coded = code_responses(prepare_data(df, list(df.columns)), "pcm")
    assert coded.person_extreme[0] == 1
    assert int(coded.m[0]) == 1
    assert coded.category_labels[0] == ["0", "1+2"]
    assert "collapse_category" in {i.code for i in coded.issues}


def test_group_column_requires_two_levels():
    df = pd.DataFrame({"Q1": [1, 0, 1, 0, 1, 0], "Q2": [0, 1, 1, 0, 1, 1], "G": ["a", "b", "c", "a", "b", "c"]})
    prep = prepare_data(df, ["Q1", "Q2"], group_col="G")
    assert prep.groups is None
    assert "dif_group_levels" in _codes(prep)


def test_read_table_csv_semicolon_and_xlsx(tmp_path):
    df = pd.DataFrame({"ID": ["a", "b"], "Q1": [1, 0], "Q2": [0, 1]})
    csv_path = tmp_path / "d.csv"
    csv_path.write_text("ID;Q1;Q2\na;1;0\nb;0;1\n", encoding="utf-8")
    got = read_table(csv_path)
    assert list(got.columns) == ["ID", "Q1", "Q2"] and got.shape == (2, 3)
    xlsx_path = tmp_path / "d.xlsx"
    df.to_excel(xlsx_path, index=False, engine="openpyxl")
    got = read_table(xlsx_path)
    prep = prepare_data(got, ["Q1", "Q2"], id_col="ID")
    assert prep.raw.tolist() == [[1.0, 0.0], [0.0, 1.0]]
