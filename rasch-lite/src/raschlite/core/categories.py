"""Diagnostik fungsi kategori untuk model politomus (Linacre, 2002).

Untuk tiap kategori: frekuensi dan persentase, rata-rata measure teramati
(rerata theta_n - b_i atas observasi di kategori itu, seperti "OBSERVED
AVERAGE" Winsteps), outfit MNSQ kategori (rerata residual terstandar kuadrat
atas observasi di kategori itu), Andrich threshold beserta SE, dan penanda:
kategori dengan observasi < batas minimum, threshold tidak berurutan, dan
rata-rata measure yang tidak naik.

Catatan outfit kategori: definisi mengikuti manual Winsteps (Tabel 3.2),
"rata-rata outfit mean-square dari respons di setiap kategori". Manual
menyebut nilai harapannya 1,0, tetapi secara analitis ekspektasi model untuk
statistik ini adalah sum_n P_nk z_nk^2 / sum_n P_nk, yang dapat jauh dari 1
pada kategori ujung yang jarang (mis. 1,78 pada data contoh yang cocok model).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

ALL_ITEMS = "(semua item)"


def _category_rows(item: str, labels: list[str], x: np.ndarray, diff: np.ndarray, z2: np.ndarray,
                   tau: np.ndarray, tau_se: np.ndarray, delta: np.ndarray | None,
                   min_count: int) -> list[dict]:
    m = len(labels) - 1
    total = x.size
    rows = []
    prev_avg = None
    for k in range(m + 1):
        sel = x == k
        cnt = int(sel.sum())
        avg = float(diff[sel].mean()) if cnt else np.nan
        row = {
            "item": item,
            "category": k,
            "label": labels[k],
            "count": cnt,
            "percent": 100.0 * cnt / total if total else np.nan,
            "avg_measure": avg,
            # TODO: verifikasi rumus - definisi outfit kategori Winsteps (lihat docstring modul).
            "outfit_mnsq": float(z2[sel].mean()) if cnt else np.nan,
            "threshold": float(tau[k - 1]) if k >= 1 else np.nan,
            "threshold_se": float(tau_se[k - 1]) if k >= 1 else np.nan,
            "threshold_location": float(delta[k - 1]) if (k >= 1 and delta is not None) else np.nan,
            "flag_low_count": cnt < min_count,
            "flag_disordered_threshold": bool(k >= 2 and tau[k - 1] < tau[k - 2]),
            "flag_disordered_avg": bool(prev_avg is not None and np.isfinite(avg) and avg < prev_avg),
        }
        if np.isfinite(avg):
            prev_avg = avg
        rows.append(row)
    return rows


def category_table(model: str, X0: np.ndarray, obs: np.ndarray, theta: np.ndarray, b: np.ndarray,
                   E: np.ndarray, W: np.ndarray, tau: np.ndarray, tau_se: np.ndarray,
                   delta: np.ndarray, m: np.ndarray, labels: list[list[str]], names: list[str],
                   min_count: int) -> pd.DataFrame:
    """Tabel kategori: satu blok untuk RSM, satu blok per item untuk PCM."""
    diff = theta[:, None] - b[None, :]
    z2 = (X0 - E) ** 2 / np.maximum(W, 1e-12)
    rows: list[dict] = []
    if model == "rsm":
        rows = _category_rows(ALL_ITEMS, labels[0], X0[obs], diff[obs], z2[obs], tau[0], tau_se[0],
                              None, min_count)
    else:
        for i, name in enumerate(names):
            o = obs[:, i]
            mi = int(m[i])
            rows.extend(_category_rows(name, labels[i], X0[o, i], diff[o, i], z2[o, i], tau[i, :mi],
                                       tau_se[i, :mi], delta[i, :mi], min_count))
    return pd.DataFrame(rows)
