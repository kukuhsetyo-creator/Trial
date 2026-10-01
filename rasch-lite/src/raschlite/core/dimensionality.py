"""Dimensionalitas (PCA residual terstandar) dan dependensi lokal (Yen's Q3)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _pairwise_corr(R: np.ndarray, names: list[str]) -> pd.DataFrame:
    """Korelasi antar-kolom dengan pasangan lengkap (pairwise complete)."""
    return pd.DataFrame(R, columns=names).corr(method="pearson", min_periods=3)


def residual_pca(X0: np.ndarray, obs: np.ndarray, E: np.ndarray, W: np.ndarray,
                 names: list[str]) -> dict:
    """PCA atas korelasi residual terstandar z = (x - E) / sqrt(W).

    Eigenvalue dinyatakan dalam satuan item (jumlah eigenvalue = jumlah item),
    sebagaimana tabel kontras Winsteps (PRCOMP=S). Loading = vektor eigen x
    sqrt(eigenvalue), diorientasikan sehingga loading terbesar positif.
    """
    Wc = np.maximum(W, 1e-12)
    Z = np.where(obs, (X0 - E) / np.sqrt(Wc), np.nan)
    corr = _pairwise_corr(Z, names)
    C = corr.to_numpy()
    C = np.where(np.isfinite(C), C, 0.0)
    np.fill_diagonal(C, 1.0)
    vals, vecs = np.linalg.eigh(C)
    order = np.argsort(vals)[::-1]
    vals = vals[order]
    vecs = vecs[:, order]
    v1 = vecs[:, 0]
    if v1[np.argmax(np.abs(v1))] < 0:
        v1 = -v1
    loadings = v1 * np.sqrt(max(vals[0], 0.0))

    # Varians mentah yang dijelaskan measure (Linacre, 2006, RMT 20:1, 1045;
    # tabel 23.0 Winsteps): explained = sum (E - rerata X)^2, unexplained =
    # sum (X - E)^2 dengan residual mentah, total = explained + unexplained,
    # person/item ekstrem tidak diikutkan. Pada solusi JMLE jumlah residual
    # bernilai nol sehingga rerata X = rerata E, dan pilihan rerata tidak
    # memengaruhi hasil. Satuan eigenvalue: unexplained = jumlah item.
    x_mean = X0[obs].mean()
    explained = float(((E - x_mean) ** 2)[obs].sum())
    unexplained = float(((X0 - E) ** 2)[obs].sum())
    total = explained + unexplained
    L = len(names)
    explained_eig = L * explained / unexplained if unexplained > 0 else np.nan
    total_eig = L + explained_eig
    return {
        "eigenvalues": vals,
        "first_contrast_eigenvalue": float(vals[0]),
        "loadings": pd.Series(loadings, index=names, name="loading"),
        "variance_explained_pct": 100.0 * explained / total if total > 0 else np.nan,
        "variance_unexplained_pct": 100.0 * unexplained / total if total > 0 else np.nan,
        "explained_eigen_units": float(explained_eig),
        "total_eigen_units": float(total_eig),
        "first_contrast_pct_total": 100.0 * float(vals[0]) / total_eig if total_eig > 0 else np.nan,
        "residual_correlation": corr,
    }


def yen_q3(X0: np.ndarray, obs: np.ndarray, E: np.ndarray, names: list[str],
           relative_cutoff: float) -> dict:
    """Matriks Yen's Q3 (korelasi residual mentah x - E) dan pasangan yang ditandai.

    Pasangan ditandai bila Q3 > rata-rata Q3 (di luar diagonal) + ``relative_cutoff``
    (Christensen, Makransky & Horton, 2017).
    """
    D = np.where(obs, X0 - E, np.nan)
    q3 = _pairwise_corr(D, names)
    Q = q3.to_numpy()
    L = len(names)
    iu = np.triu_indices(L, k=1)
    off = Q[iu]
    mean_q3 = float(np.nanmean(off)) if off.size else np.nan
    limit = mean_q3 + relative_cutoff
    rows = []
    for a, b in zip(*iu):
        v = Q[a, b]
        if np.isfinite(v) and v > limit:
            rows.append({"item_a": names[a], "item_b": names[b], "q3": float(v),
                         "q3_relative": float(v - mean_q3)})
    pairs = pd.DataFrame(rows, columns=["item_a", "item_b", "q3", "q3_relative"])
    pairs = pairs.sort_values("q3", ascending=False, ignore_index=True)
    return {
        "matrix": q3,
        "mean": mean_q3,
        "max": float(np.nanmax(off)) if off.size else np.nan,
        "cutoff": float(limit),
        "flagged_pairs": pairs,
    }
