"""Bangkitkan golden file dari engine Python sebagai acuan uji versi HTML.

Setiap kasus berupa berkas CSV + pengaturan; keluaran berisi seluruh tabel, ringkasan,
dimensionalitas, Q3, DIF, pesan, solusi JMLE, dan narasi Markdown lengkap.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from raschlite.core.analysis import run_analysis  # noqa: E402
from raschlite.core.data import prepare_data, read_table  # noqa: E402
from raschlite.core.simulate import simulate_dichotomous, simulate_responses  # noqa: E402
from raschlite.interpret import interpret, to_markdown  # noqa: E402
from raschlite.resources import sample_path  # noqa: E402

DATA = ROOT / "web" / "test" / "data"


def clean(v):
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        v = float(v)
        if math.isnan(v):
            return None
        if math.isinf(v):
            return "inf" if v > 0 else "-inf"
        return v
    if isinstance(v, dict):
        return {str(k): clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, np.ndarray)):
        return [clean(x) for x in v]
    return v


def frame(df):
    return [] if df is None else [clean(r) for r in df.to_dict(orient="records")]


def make_datasets():
    DATA.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(2026)
    # 1. Dikotomus dengan missing 10%, skor sempurna/nol, kode missing 9, grup, DIF
    N, L = 400, 15
    theta = rng.normal(0.3, 1.1, N)
    b = rng.uniform(-2, 2, L)
    bb = np.tile(b, (N, 1))
    g = np.where(rng.random(N) < 0.5, "L", "P")
    bb[g == "P", 4] += 1.0
    X = (rng.random((N, L)) < 1 / (1 + np.exp(-(theta[:, None] - bb)))).astype(int).astype(object)
    X[rng.random((N, L)) < 0.10] = 9
    X[0, :] = 1
    X[1, :] = 0
    df = pd.DataFrame(X, columns=[f"Q{j + 1}" for j in range(L)])
    df.insert(0, "Kode", [f"S{n:03d}" for n in range(N)])
    df["Grup"] = g
    df.loc[5, "Grup"] = ""
    df.to_csv(DATA / "sim_dich.csv", index=False)
    # 2. PCM: item 3 disordered, item 7 tidak memakai kategori 0, missing 5%
    N, L = 500, 10
    theta = rng.normal(0, 1, N)
    tau = np.tile([-1.5, -0.5, 0.5, 1.5], (L, 1))
    tau[2] = [-1.0, 0.8, -0.8, 1.0]
    bi = rng.uniform(-1, 1, L)
    X = simulate_responses(theta, bi[:, None] + tau, rng)
    X[:, 6] = np.maximum(X[:, 6], 1)
    X[rng.random((N, L)) < 0.05] = np.nan
    df = pd.DataFrame(X + 1, columns=[f"P{j + 1}" for j in range(L)])
    df = df.astype(object).where(df.notna(), "")
    df.insert(0, "ID", range(1, N + 1))
    df["Kelas"] = np.where(rng.random(N) < 0.5, "A", "B")
    df.to_csv(DATA / "sim_pcm.csv", index=False, sep=";")
    # 3. RSM dengan kategori yang tidak dipakai (nilai 1,2,4,5) dan satu item ekstrem
    N, L = 300, 8
    theta = rng.normal(0, 1, N)
    from raschlite.core.simulate import rsm_delta
    X = simulate_responses(theta, rsm_delta(rng.uniform(-1, 1, L), [-1.2, 0.0, 1.2]), rng)
    lut = np.array([1, 2, 4, 5])
    R = lut[X.astype(int)]
    df = pd.DataFrame(R, columns=[f"R{j + 1}" for j in range(L)])
    df.to_csv(DATA / "sim_rsm.csv", index=False)


CASES = [
    {"name": "sample_dich", "file": "SAMPLE:dichotomous", "id": "ID", "group": "Jenis_Kelamin", "model": "dichotomous"},
    {"name": "sample_dich_strict", "file": "SAMPLE:dichotomous", "id": "ID", "group": "Jenis_Kelamin",
     "model": "dichotomous", "strict": True},
    {"name": "sample_rsm", "file": "SAMPLE:polytomous", "id": "ID", "group": "Jenis_Kelamin", "model": "rsm"},
    {"name": "sample_pcm", "file": "SAMPLE:polytomous", "id": "ID", "group": "Jenis_Kelamin", "model": "pcm"},
    {"name": "sim_dich", "file": "sim_dich.csv", "id": "Kode", "group": "Grup", "model": "dichotomous", "missing": ["9"]},
    {"name": "sim_pcm", "file": "sim_pcm.csv", "id": "ID", "group": "Kelas", "model": "pcm"},
    {"name": "sim_pcm_as_rsm", "file": "sim_pcm.csv", "id": "ID", "group": None, "model": "rsm", "drop": ["Kelas"]},
    {"name": "sim_rsm", "file": "sim_rsm.csv", "id": None, "group": None, "model": "rsm"},
]


def run_case(case):
    path = sample_path(case["file"].split(":")[1]) if case["file"].startswith("SAMPLE:") else DATA / case["file"]
    df = read_table(path)
    items = [c for c in df.columns if c not in (case["id"], case["group"], *case.get("drop", []))]
    prep = prepare_data(df, items, id_col=case["id"], group_col=case["group"], missing_codes=case.get("missing", ()))
    res = run_analysis(prep, case["model"], strict_fit=case.get("strict", False))
    jm = res.jmle
    d = res.dimensionality
    q3 = res.q3
    return {
        "case": case,
        "prep": {"responseType": prep.response_type, "recommended": prep.recommended_model,
                 "reason": prep.recommendation_reason, "nPersons": prep.n_persons, "nItems": prep.n_items},
        "items": frame(res.items), "persons": frame(res.persons), "categories": frame(res.categories),
        "summary": clean({k: v for k, v in res.summary.items()}),
        "dimensionality": clean({"eigenvalues": d["eigenvalues"], "first_contrast_eigenvalue": d["first_contrast_eigenvalue"],
                                 "loadings": list(d["loadings"].items()),
                                 "variance_explained_pct": d["variance_explained_pct"],
                                 "first_contrast_pct_total": d["first_contrast_pct_total"]}),
        "q3": clean({"matrix": q3["matrix"].to_numpy(), "mean": q3["mean"], "max": q3["max"], "cutoff": q3["cutoff"],
                     "flagged_pairs": frame(q3["flagged_pairs"])}),
        "dif": frame(res.dif),
        "issues": [[i.level, i.code, i.message] for i in res.issues],
        "jmle": clean({"nIter": jm.n_iter, "converged": jm.converged, "theta": jm.theta, "b": jm.b,
                       "delta": jm.delta, "bias": jm.bias_factor}),
        "settings": clean(res.settings),
        "markdown": to_markdown(interpret(res)),
    }


if __name__ == "__main__":
    make_datasets()
    out = DATA.parent / "golden.json"
    golden = [run_case(c) for c in CASES]
    out.write_text(json.dumps(golden, ensure_ascii=False), encoding="utf-8")
    for g in golden:
        print(g["case"]["name"], g["jmle"]["nIter"], g["jmle"]["converged"], len(g["issues"]))
