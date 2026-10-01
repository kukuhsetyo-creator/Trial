"""Reliabilitas, separasi, strata, dan Cronbach's alpha / KR-20."""

from __future__ import annotations

import numpy as np


def separation_statistics(measures: np.ndarray, se: np.ndarray, infit: np.ndarray | None = None) -> dict:
    """Statistik separasi gaya Winsteps untuk sekumpulan measure.

    Varians teramati = SD^2 measure; varians error = rata-rata SE^2 (RMSE^2);
    varians "benar" = selisih keduanya (dibatasi >= 0).
    Reliabilitas = varians benar / varians teramati.
    Separasi G = SD benar / RMSE. Strata = (4G + 1) / 3 (Wright & Masters, 2002).
    SE "REAL" = SE model x sqrt(max(1, infit MNSQ)) (Linacre, manual Winsteps).
    """
    ok = np.isfinite(measures) & np.isfinite(se)
    x = measures[ok]
    s = se[ok]
    out = {"n": int(ok.sum()), "mean": float(np.mean(x)) if x.size else np.nan}
    # TODO: verifikasi rumus - Winsteps memakai SD populasi (pembagi N) atau
    # sampel (N-1) untuk varians teramati dalam reliabilitas; di sini dipakai
    # SD populasi.
    sd = float(np.std(x)) if x.size else np.nan
    out["sd"] = sd
    variants = {"model": s}
    if infit is not None:
        inf = infit[ok]
        variants["real"] = s * np.sqrt(np.maximum(1.0, np.where(np.isfinite(inf), inf, 1.0)))
    for name, err in variants.items():
        rmse = float(np.sqrt(np.mean(err ** 2))) if err.size else np.nan
        true_var = max(sd ** 2 - rmse ** 2, 0.0)
        true_sd = np.sqrt(true_var)
        rel = true_var / sd ** 2 if sd > 0 else np.nan
        sep = true_sd / rmse if rmse > 0 else np.nan
        out[f"{name}_rmse"] = rmse
        out[f"{name}_true_sd"] = float(true_sd)
        out[f"{name}_reliability"] = float(rel)
        out[f"{name}_separation"] = float(sep)
        out[f"{name}_strata"] = float((4.0 * sep + 1.0) / 3.0)
    return out


def cronbach_alpha(raw: np.ndarray) -> tuple[float, int]:
    """Cronbach's alpha (= KR-20 untuk data dikotomus) atas kasus lengkap.

    alpha = L/(L-1) * (1 - sum var_i / var_total). Mengembalikan (alpha, n).
    """
    complete = ~np.isnan(raw).any(axis=1)
    data = raw[complete]
    n, L = data.shape
    if n < 2 or L < 2:
        return float("nan"), int(n)
    item_var = data.var(axis=0, ddof=1).sum()
    total_var = data.sum(axis=1).var(ddof=1)
    if total_var <= 0:
        return float("nan"), int(n)
    return float(L / (L - 1.0) * (1.0 - item_var / total_var)), int(n)
