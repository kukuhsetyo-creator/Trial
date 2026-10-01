"""Statistik kecocokan (fit) dan korelasi point-measure.

Rumus mengikuti Wright & Masters (1982, bab 5):

* residual y_ni = x_ni - E_ni, varians model W_ni, momen keempat C_ni;
* outfit u = sum(y^2 / W) / n, dengan varians q_u^2 = sum(C / W^2) / n^2 - 1 / n;
* infit v = sum(y^2) / sum(W), dengan varians q_v^2 = sum(C - W^2) / (sum W)^2;
* ZSTD (Wilson & Hilferty, 1931): t = (MNSQ^(1/3) - 1)(3 / q) + q / 3.
"""

from __future__ import annotations

import numpy as np

_TINY = 1e-12


def wilson_hilferty(mnsq: np.ndarray, q: np.ndarray) -> np.ndarray:
    """Transformasi kubik Wilson-Hilferty menjadi statistik ~N(0,1)."""
    q = np.maximum(q, _TINY)
    return (np.cbrt(mnsq) - 1.0) * (3.0 / q) + q / 3.0


def fit_statistics(X0: np.ndarray, obs: np.ndarray, E: np.ndarray, W: np.ndarray,
                   C: np.ndarray, axis: int) -> dict[str, np.ndarray]:
    """Infit/outfit MNSQ dan ZSTD.

    ``axis=0`` menjumlahkan atas person (statistik item); ``axis=1`` atas item
    (statistik person). Sel yang tidak teramati diabaikan.
    """
    obs_f = obs.astype(float)
    Wc = np.maximum(W, _TINY)
    y2 = ((X0 - E) ** 2) * obs_f
    n = obs_f.sum(axis=axis)
    sumW = (Wc * obs_f).sum(axis=axis)
    with np.errstate(invalid="ignore", divide="ignore"):
        outfit = (y2 / Wc).sum(axis=axis) / n
        infit = y2.sum(axis=axis) / sumW
        q_out2 = ((C / Wc ** 2) * obs_f).sum(axis=axis) / n ** 2 - 1.0 / n
        q_in2 = ((C - Wc ** 2) * obs_f).sum(axis=axis) / sumW ** 2
    q_out = np.sqrt(np.maximum(q_out2, 0.0))
    q_in = np.sqrt(np.maximum(q_in2, 0.0))
    return {
        "infit_mnsq": infit,
        "outfit_mnsq": outfit,
        "infit_zstd": wilson_hilferty(infit, q_in),
        "outfit_zstd": wilson_hilferty(outfit, q_out),
        "count": n,
    }


def point_measure(X0: np.ndarray, obs: np.ndarray, theta: np.ndarray, E: np.ndarray,
                  W: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Korelasi point-measure teramati dan harapannya untuk setiap item.

    Teramati: korelasi Pearson antara respons dan measure person.
    Harapan (Linacre, manual Winsteps, bagian "Correlations"):
    sum (E - mean E)(B - mean B) / sqrt(sum (B - mean B)^2 * [sum (E - mean E)^2 + sum W]).
    """
    L = X0.shape[1]
    obs_r = np.full(L, np.nan)
    exp_r = np.full(L, np.nan)
    for i in range(L):
        o = obs[:, i]
        if o.sum() < 3:
            continue
        x = X0[o, i]
        t = theta[o]
        e = E[o, i]
        w = W[o, i]
        tc = t - t.mean()
        xc = x - x.mean()
        ec = e - e.mean()
        sxx = (xc ** 2).sum()
        stt = (tc ** 2).sum()
        if sxx > 0 and stt > 0:
            obs_r[i] = (xc * tc).sum() / np.sqrt(sxx * stt)
        denom = stt * ((ec ** 2).sum() + w.sum())
        if denom > 0:
            exp_r[i] = (ec * tc).sum() / np.sqrt(denom)
    return obs_r, exp_r
