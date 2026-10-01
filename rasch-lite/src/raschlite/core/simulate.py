"""Simulasi data Rasch untuk pengujian recovery dan dataset contoh bawaan."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .model import category_probabilities


def simulate_responses(theta: np.ndarray, delta: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Bangkitkan respons 0..m_i dari model Rasch umum (delta berpadding +inf)."""
    P = category_probabilities(np.asarray(theta, float), np.asarray(delta, float))
    cum = np.cumsum(P, axis=2)
    u = rng.random(P.shape[:2])
    return (u[:, :, None] > cum).sum(axis=2).astype(float)


def simulate_dichotomous(theta: np.ndarray, b: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    return simulate_responses(theta, np.asarray(b, float)[:, None], rng)


def rsm_delta(b: np.ndarray, tau: np.ndarray) -> np.ndarray:
    return np.asarray(b, float)[:, None] + np.asarray(tau, float)[None, :]


def to_frame(X: np.ndarray, groups=None, group_name: str = "Grup", prefix: str = "I",
             id_prefix: str = "R") -> pd.DataFrame:
    """Bungkus matriks respons menjadi DataFrame dengan kolom ID, item, dan grup."""
    N, L = X.shape
    width = max(2, len(str(L)))
    cols = {f"{prefix}{j + 1:0{width}d}": X[:, j] for j in range(L)}
    df = pd.DataFrame(cols)
    df.insert(0, "ID", [f"{id_prefix}{n + 1:04d}" for n in range(N)])
    if groups is not None:
        df[group_name] = groups
    return df


def make_sample_datasets(out_dir: str | Path, seed: int = 20261001) -> dict[str, Path]:
    """Tulis dua dataset contoh bawaan.

    ``contoh_dikotomus.csv``: 600 responden x 20 soal benar/salah, kolom
    ``Jenis_Kelamin`` (L/P). Disisipkan satu soal dengan pola jawaban acak
    (S07), satu soal yang lebih sulit 1 logit bagi grup P (S12), dan 2% data
    hilang acak, agar fitur diagnostik dapat didemonstrasikan.

    ``contoh_politomus.csv``: 350 responden x 12 butir angket skala 1-5,
    kolom ``Jenis_Kelamin``. Butir A09 diberi threshold tidak berurutan
    (kategori tengah jarang dipilih).
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    N, L = 600, 20
    theta = rng.normal(0.3, 1.1, N)
    b = np.linspace(-2.0, 2.0, L)
    rng.shuffle(b)
    grp = np.where(rng.random(N) < 0.5, "L", "P")
    delta = np.repeat(b[:, None], N, axis=1).T  # (N, L)
    delta = delta + np.where(grp[:, None] == "P", 1.0, 0.0) * (np.arange(L) == 11)[None, :]
    P = 1.0 / (1.0 + np.exp(-(theta[:, None] - delta)))
    X = (rng.random((N, L)) < P).astype(float)
    X[:, 6] = (rng.random(N) < 0.5).astype(float)
    X[rng.random((N, L)) < 0.02] = np.nan
    df = to_frame(X, grp, "Jenis_Kelamin", prefix="S")
    paths = {"dichotomous": out / "contoh_dikotomus.csv"}
    _write_int_csv(df, paths["dichotomous"])

    N, L = 350, 12
    theta = rng.normal(0.5, 1.2, N)
    b = np.linspace(-1.0, 1.0, L)
    rng.shuffle(b)
    tau = np.array([-1.8, -0.6, 0.6, 1.8])
    delta = rsm_delta(b, tau)
    delta[8] = b[8] + np.array([-1.5, 0.8, -0.8, 1.5])
    grp = np.where(rng.random(N) < 0.5, "L", "P")
    X = simulate_responses(theta, delta, rng) + 1.0
    X[rng.random((N, L)) < 0.01] = np.nan
    df = to_frame(X, grp, "Jenis_Kelamin", prefix="A")
    paths["polytomous"] = out / "contoh_politomus.csv"
    _write_int_csv(df, paths["polytomous"])
    return paths


def _write_int_csv(df: pd.DataFrame, path: Path) -> None:
    out = df.copy()
    for c in out.columns:
        if out[c].dtype.kind == "f":
            out[c] = out[c].astype("Int64")
    out.to_csv(path, index=False)
