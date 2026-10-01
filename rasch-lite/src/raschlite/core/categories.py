"""Diagnostik fungsi kategori untuk model politomus (Linacre, 2002).

Untuk tiap kategori dilaporkan: frekuensi dan persentase, rata-rata measure
teramati (rerata theta_n - b_i atas observasi di kategori itu, seperti
"OBSERVED AVERAGE" Winsteps), outfit MNSQ kategori, Andrich threshold beserta
SE dan lokasinya pada skala logit, serta penanda masalah.

Outfit kategori mengikuti definisi manual Winsteps (Tabel 3.2): rata-rata
outfit mean-square (z^2) dari respons di kategori itu. Manual menyebut nilai
harapannya 1,0, tetapi secara analitis nilai harapan model untuk statistik ini
adalah

    E_k = sum_n P_nk z_nk^2 / sum_n P_nk,   z_nk = (k - E_n) / sqrt(W_n),

yang dapat jauh di atas 1 pada kategori ujung yang jarang. Pengujian pada data
simulasi yang cocok model (rerata theta 0; 1,5; 3) dan data nyata psych::bfi
(N = 2.800) menunjukkan nilai teramati mengikuti E_k pada data yang cocok model
(mis. 6,52 vs 6,31) dan melampauinya pada data nyata yang misfit (3,62 vs 2,67).
Karena itu E_k dilaporkan sebagai ``outfit_expected``. Galat baku outfit
kategori di bawah model diperoleh dengan delta method atas estimator rasio
sum_n I_nk z_nk^2 / sum_n I_nk, dengan I_nk ~ Bernoulli(P_nk):

    SE_k = sqrt(sum_n P_nk (1 - P_nk) (z_nk^2 - E_k)^2) / sum_n P_nk,

dan ``outfit_z`` = (outfit - E_k) / SE_k. Kategori ditandai bila outfit >=
batas Linacre (2002) DAN outfit melampaui harapannya secara bermakna
(z > 1,645; uji satu sisi alpha = 0,05).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.special import ndtri

ALL_ITEMS = "(all items)"
_Z_ONE_SIDED_05 = float(ndtri(0.95))  # kuantil normal baku 0,95


def _category_rows(item: str, labels: list[str], x: np.ndarray, diff: np.ndarray, z2_obs: np.ndarray,
                   P: np.ndarray, z2_all: np.ndarray, tau: np.ndarray, tau_se: np.ndarray,
                   location: np.ndarray | None, min_count: int, outfit_max: float) -> list[dict]:
    """Baris kategori untuk satu blok observasi.

    ``x``/``diff``/``z2_obs``: per observasi (kategori teramati, theta - b, z^2).
    ``P``/``z2_all``: per observasi x kategori (peluang model, z^2 jika kategori k).
    """
    m = len(labels) - 1
    total = x.size
    rows = []
    prev_avg = None
    for k in range(m + 1):
        sel = x == k
        cnt = int(sel.sum())
        avg = float(diff[sel].mean()) if cnt else np.nan
        outfit = float(z2_obs[sel].mean()) if cnt else np.nan
        pk = P[:, k]
        sp = pk.sum()
        expected = float((pk * z2_all[:, k]).sum() / sp) if sp > 0 else np.nan
        se = float(np.sqrt((pk * (1 - pk) * (z2_all[:, k] - expected) ** 2).sum()) / sp) if sp > 0 else np.nan
        z = (outfit - expected) / se if (cnt and se > 0) else np.nan
        rows.append({
            "item": item,
            "category": k,
            "label": labels[k],
            "count": cnt,
            "percent": 100.0 * cnt / total if total else np.nan,
            "avg_measure": avg,
            "outfit_mnsq": outfit,
            "outfit_expected": expected,
            "outfit_z": z,
            "threshold": float(tau[k - 1]) if k >= 1 else np.nan,
            "threshold_se": float(tau_se[k - 1]) if k >= 1 else np.nan,
            "threshold_location": float(location[k - 1]) if (k >= 1 and location is not None) else np.nan,
            "flag_low_count": cnt < min_count,
            "flag_disordered_threshold": bool(k >= 2 and tau[k - 1] < tau[k - 2]),
            "flag_disordered_avg": bool(prev_avg is not None and np.isfinite(avg) and avg < prev_avg),
            "flag_outfit_high": bool(np.isfinite(z) and outfit >= outfit_max and z > _Z_ONE_SIDED_05),
        })
        if np.isfinite(avg):
            prev_avg = avg
    return rows


def category_table(model: str, X0: np.ndarray, obs: np.ndarray, theta: np.ndarray, b: np.ndarray,
                   P: np.ndarray, E: np.ndarray, W: np.ndarray, tau: np.ndarray, tau_se: np.ndarray,
                   location: np.ndarray, m: np.ndarray, labels: list[list[str]], names: list[str],
                   min_count: int, outfit_max: float) -> pd.DataFrame:
    """Tabel kategori: satu blok untuk RSM, satu blok per item untuk PCM.

    ``theta``, ``b``, ``P``, ``E``, ``W`` berasal dari solusi JMLE (tanpa koreksi
    bias) agar konsisten dengan statistik fit; ``tau``, ``tau_se``, ``location``
    adalah nilai yang dilaporkan (sudah dikoreksi bias).
    """
    Wc = np.maximum(W, 1e-12)
    diff = theta[:, None] - b[None, :]
    z2 = (X0 - E) ** 2 / Wc
    k = np.arange(P.shape[2], dtype=float)
    z2_all = (k[None, None, :] - E[:, :, None]) ** 2 / Wc[:, :, None]
    rows: list[dict] = []
    if model == "rsm":
        rows = _category_rows(ALL_ITEMS, labels[0], X0[obs], diff[obs], z2[obs], P[obs], z2_all[obs],
                              tau[0], tau_se[0], None, min_count, outfit_max)
    else:
        for i, name in enumerate(names):
            o = obs[:, i]
            mi = int(m[i])
            rows.extend(_category_rows(name, labels[i], X0[o, i], diff[o, i], z2[o, i], P[o, i],
                                       z2_all[o, i], tau[i, :mi], tau_se[i, :mi], location[i, :mi],
                                       min_count, outfit_max))
    return pd.DataFrame(rows)
