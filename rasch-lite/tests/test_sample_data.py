"""Dataset contoh bawaan: dapat direproduksi dan menunjukkan pola yang disisipkan."""

from pathlib import Path

import pandas as pd

from raschlite.core.analysis import run_analysis
from raschlite.core.data import prepare_data, read_table
from raschlite.core.simulate import make_sample_datasets

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "src" / "raschlite" / "resources" / "sample_data"


def _load(name):
    df = read_table(SAMPLE_DIR / name)
    items = [c for c in df.columns if c not in ("ID", "Jenis_Kelamin")]
    return prepare_data(df, items, id_col="ID", group_col="Jenis_Kelamin")


def test_sample_files_are_reproducible(tmp_path):
    paths = make_sample_datasets(tmp_path)
    for p in paths.values():
        shipped = pd.read_csv(SAMPLE_DIR / p.name, dtype=str, keep_default_na=False)
        fresh = pd.read_csv(p, dtype=str, keep_default_na=False)
        pd.testing.assert_frame_equal(shipped, fresh)


def test_dichotomous_sample_shows_planted_misfit_and_dif():
    prep = _load("contoh_dikotomus.csv")
    assert prep.recommended_model == "dichotomous"
    res = run_analysis(prep, "dichotomous")
    items = res.items.set_index("item")
    assert res.converged
    assert items.loc["S07", "flag_misfit"]
    assert res.dif.loc[res.dif["flag_dif"], "item"].tolist() == ["S12"]


def test_polytomous_sample_runs_both_models_and_flags_disorder_in_pcm():
    prep = _load("contoh_politomus.csv")
    assert prep.recommended_model == "rsm"
    rsm = run_analysis(prep, "rsm")
    pcm = run_analysis(prep, "pcm")
    assert rsm.converged and pcm.converged
    cat = pcm.categories
    assert set(cat.loc[cat["flag_disordered_threshold"], "item"]) == {"A09"}
