"""Differential Item Functioning (DIF) untuk dua grup.

Prosedur (setara Tabel 30 Winsteps): measure person dan struktur threshold
dikunci pada hasil estimasi gabungan; lokasi setiap item diestimasi ulang
secara terpisah dalam tiap grup. Kontras DIF = measure grup A - measure grup B
(positif berarti item lebih sulit bagi grup A). Statistik t mengikuti Draba
(1977); derajat bebas Welch-Satterthwaite dipakai untuk nilai p yang dilaporkan:

    t  = kontras / sqrt(SE_A^2 + SE_B^2)
    df = (SE_A^2 + SE_B^2)^2 / (SE_A^4 / (n_A - 1) + SE_B^4 / (n_B - 1))

Butir ditandai bila |kontras| >= ``contrast_min`` DAN |t| > ``t_min``
(Draba, 1977). Kolom ``ets_category`` memuat klasifikasi ETS A/B/C (Zwick, Thayer & Lewis,
1999) seperti yang dilaporkan Winsteps.

Skor grup yang ekstrem (0 atau maksimum) diberi estimasi dengan penyesuaian
0,3 poin dan ditandai.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from .jmle import EXTREME_SCORE_ADJUSTMENT, solve_item_locations


def dif_analysis(X: np.ndarray, theta: np.ndarray, tau: np.ndarray, m: np.ndarray, groups: np.ndarray,
                 names: list[str], scale: float, contrast_min: float, t_min: float,
                 ets_b: float, ets_c: float) -> tuple[pd.DataFrame, list[str]]:
    """Hitung tabel DIF.

    ``X``, ``theta``, ``groups`` hanya berisi person non-ekstrem; ``tau`` (L, M)
    threshold relatif tiap item; ``scale`` faktor koreksi bias yang juga
    diterapkan pada measure item di tabel utama sehingga kedua tabel sebanding.
    """
    valid_g = np.array([g is not None for g in groups])
    levels = sorted({g for g in groups[valid_g]})
    notes: list[str] = []
    per_group = {}
    for g in levels:
        sel = valid_g & (groups == g)
        if sel.sum() < 2:
            notes.append(g)
            continue
        Xg = X[sel]
        obs = ~np.isnan(Xg)
        score = np.where(obs, Xg, 0.0).sum(axis=0)
        n = obs.sum(axis=0)
        maxs = n * m
        extreme = (score <= 0) | (score >= maxs)
        target = np.where(score <= 0, EXTREME_SCORE_ADJUSTMENT,
                          np.where(score >= maxs, maxs - EXTREME_SCORE_ADJUSTMENT, score))
        has = n > 0
        b = np.full(len(names), np.nan)
        se = np.full(len(names), np.nan)
        if has.any():
            bb, ss = solve_item_locations(theta[sel], obs[:, has], tau[has], m[has], target[has])
            b[has] = bb
            se[has] = ss
        per_group[g] = {"measure": b * scale, "se": se * scale, "n": n, "score": score,
                        "extreme": extreme & has}
    if len(per_group) != 2:
        return pd.DataFrame(), notes
    ga, gb = levels
    A, B = per_group[ga], per_group[gb]
    contrast = A["measure"] - B["measure"]
    joint = np.sqrt(A["se"] ** 2 + B["se"] ** 2)
    t = contrast / joint
    with np.errstate(divide="ignore", invalid="ignore"):
        df = joint ** 4 / (A["se"] ** 4 / (A["n"] - 1) + B["se"] ** 4 / (B["n"] - 1))
    p = 2.0 * stats.t.sf(np.abs(t), df)
    flag = (np.abs(contrast) >= contrast_min) & (np.abs(t) > t_min)
    # Kategori ETS (Zwick, Thayer & Lewis, 1999; manual Winsteps):
    # C: |DIF| >= ets_c dan p(|DIF| <= ets_b) < .05 (uji satu sisi);
    # B: |DIF| >= ets_b dan p(|DIF| = 0) < .05; selain itu A.
    p_beyond_b = stats.t.sf((np.abs(contrast) - ets_b) / joint, df)
    ets = np.where((np.abs(contrast) >= ets_c) & (p_beyond_b < 0.05), "C",
                   np.where((np.abs(contrast) >= ets_b) & (p < 0.05), "B", "A"))
    table = pd.DataFrame({
        "item": names,
        "group_a": ga,
        "group_b": gb,
        "measure_a": A["measure"],
        "se_a": A["se"],
        "n_a": A["n"].astype(int),
        "measure_b": B["measure"],
        "se_b": B["se"],
        "n_b": B["n"].astype(int),
        "contrast": contrast,
        "joint_se": joint,
        "t": t,
        "df": df,
        "p": p,
        "extreme_a": A["extreme"],
        "extreme_b": B["extreme"],
        "flag_dif": flag,
        "ets_category": ets,
    })
    return table, notes
