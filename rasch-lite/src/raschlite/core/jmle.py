"""Estimasi Joint Maximum Likelihood (JMLE) untuk model Rasch.

Prosedur mengikuti algoritme unconditional (UCON) Wright & Masters (1982,
bab 4-5) dan Wright & Stone (1979):

1. Nilai awal PROX (Wright & Stone, 1979) untuk person dan item; nilai awal
   threshold ln(N_{k-1}/N_k) yang dipusatkan (Andrich).
2. Iterasi Gauss-Seidel: Newton-Raphson untuk tiap person, lalu untuk item
   (dan threshold), dengan langkah dibatasi maksimal 1 logit per iterasi.
3. Identifikasi skala: rata-rata kesulitan item non-ekstrem = 0 logit.
4. Konvergensi: perubahan estimasi maksimum < ``conv_change`` DAN residual
   skor maksimum (person dan item) < ``conv_resid``.
5. Person/item berskor ekstrem diberi estimasi dengan penyesuaian skor 0,3
   poin (konvensi EXTRSCORE=0.3 Winsteps) memakai parameter yang sudah
   konvergen.

Data hilang ditangani dengan menjumlahkan likelihood hanya atas sel teramati.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from .data import CodedData
from .model import build_delta, moments

EXTREME_SCORE_ADJUSTMENT = 0.3
PROX_EXPANSION = 2.89  # 1.7^2, Wright & Stone (1979)


class EstimationCancelled(Exception):
    """Dilempar bila ``should_cancel()`` mengembalikan True."""


@dataclass
class IterationRecord:
    iteration: int
    max_change: float
    max_residual: float


@dataclass
class JMLEResult:
    model: str
    theta: np.ndarray  # (N,) measure person, NaN bila tidak dapat diestimasi
    person_se: np.ndarray  # (N,) SE model
    b: np.ndarray  # (L,) lokasi item hasil JMLE (belum dikoreksi bias)
    item_se: np.ndarray  # (L,) SE model (belum dikoreksi bias)
    delta: np.ndarray  # (L, M) threshold delta_ik = b_i + tau_ik, +inf di atas m_i
    tau: np.ndarray  # (L, M) Andrich threshold relatif terhadap b_i, NaN di atas m_i
    tau_se: np.ndarray  # (L, M) SE threshold (Wright & Masters, 1982), NaN di atas m_i
    converged: bool
    n_iter: int
    max_change: float
    max_residual: float
    log: list[IterationRecord] = field(default_factory=list)
    bias_factor: float = 1.0

    @property
    def item_measure(self) -> np.ndarray:
        """Measure item yang dilaporkan (sudah dikoreksi bias bila berlaku)."""
        return self.b * self.bias_factor

    @property
    def item_measure_se(self) -> np.ndarray:
        return self.item_se * self.bias_factor

    @property
    def threshold(self) -> np.ndarray:
        """Andrich threshold relatif (tau) yang dilaporkan, sudah dikoreksi bias."""
        return self.tau * self.bias_factor

    @property
    def threshold_se(self) -> np.ndarray:
        return self.tau_se * self.bias_factor

    @property
    def threshold_location(self) -> np.ndarray:
        """Lokasi threshold delta_ik pada skala logit yang dilaporkan (+inf di atas m_i)."""
        return self.delta * self.bias_factor


def prox(X0: np.ndarray, obs: np.ndarray, m: np.ndarray, max_iter: int = 10,
         tol: float = 0.01) -> tuple[np.ndarray, np.ndarray]:
    """Estimasi awal PROX dengan faktor ekspansi sqrt(1 + var/2.89).

    Rata-rata dan varians dihitung hanya atas item (atau person) yang benar-benar
    direspons, sehingga data hilang tertangani.
    """
    obs_f = obs.astype(float)
    r_p = X0.sum(axis=1)
    max_p = obs_f @ m.astype(float)
    r_i = X0.sum(axis=0)
    max_i = obs_f.sum(axis=0) * m
    x = np.log(r_p / (max_p - r_p))
    y = np.log((max_i - r_i) / r_i)
    cnt_p = obs_f.sum(axis=1)
    cnt_i = obs_f.sum(axis=0)
    d = y - y.mean()
    theta = x.copy()
    for _ in range(max_iter):
        mu_p = (obs_f @ d) / cnt_p
        var_p = np.maximum((obs_f @ (d * d)) / cnt_p - mu_p ** 2, 0.0)
        theta = mu_p + np.sqrt(1.0 + var_p / PROX_EXPANSION) * x
        mu_i = (theta @ obs_f) / cnt_i
        var_i = np.maximum(((theta * theta) @ obs_f) / cnt_i - mu_i ** 2, 0.0)
        d_new = mu_i + np.sqrt(1.0 + var_i / PROX_EXPANSION) * y
        d_new -= d_new.mean()
        done = np.max(np.abs(d_new - d)) < tol
        d = d_new
        if done:
            break
    if not (np.all(np.isfinite(theta)) and np.all(np.isfinite(d))):
        theta, d = x, y - y.mean()
    return theta, d


def _initial_tau(Xe: np.ndarray, m: np.ndarray, model: str) -> np.ndarray:
    L = Xe.shape[1]
    M = int(m.max())
    tau = np.zeros((L, M))
    if model == "dichotomous":
        return tau
    if model == "rsm":
        counts = np.array([(Xe == k).sum() for k in range(M + 1)], dtype=float)
        t = np.log(counts[:-1] / counts[1:])
        tau[:] = t - t.mean()
        return tau
    for i in range(L):
        col = Xe[:, i]
        counts = np.array([(col == k).sum() for k in range(m[i] + 1)], dtype=float)
        t = np.log(counts[:-1] / counts[1:])
        tau[i, : m[i]] = t - t.mean()
    return tau


def _cumulative_counts(X0: np.ndarray, obs: np.ndarray, M: int) -> np.ndarray:
    """S_ik = jumlah respons teramati dengan X >= k, bentuk (L, M)."""
    k = np.arange(1, M + 1)
    return ((X0[:, :, None] >= k[None, None, :]) & obs[:, :, None]).sum(axis=0).astype(float)


def _block_information(G: np.ndarray, obs_f: np.ndarray) -> np.ndarray:
    """Matriks informasi threshold per item: sum_n [G_max(j,k) - G_j G_k], bentuk (L, M, M)."""
    M = G.shape[2]
    Gw = G * obs_f[:, :, None]
    Gs = Gw.sum(axis=0)
    idx = np.maximum.outer(np.arange(M), np.arange(M))
    return Gs[:, idx] - np.einsum("nlj,nlk->ljk", Gw, G)


def _damp(step: np.ndarray, axis=None) -> np.ndarray:
    """Batasi langkah Newton sehingga komponen terbesar tidak melebihi 1 logit."""
    big = np.max(np.abs(step), axis=axis, keepdims=axis is not None)
    factor = np.where(big > 1.0, 1.0 / np.maximum(big, 1e-300), 1.0)
    return step * factor


def estimate(
    coded: CodedData,
    max_iter: int = 500,
    conv_change: float = 0.001,
    conv_resid: float = 0.01,
    progress: Callable[[int, float, float], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> JMLEResult:
    """Jalankan JMLE untuk data yang sudah dikodekan."""
    model = coded.model
    X = coded.X
    N, L = X.shape
    m_all = coded.m
    M_all = int(m_all.max())
    ep = coded.person_extreme == 0
    ei = coded.item_extreme == 0
    Xe = X[np.ix_(ep, ei)]
    m = m_all[ei]
    M = int(m.max())
    obs = ~np.isnan(Xe)
    obs_f = obs.astype(float)
    X0 = np.where(obs, Xe, 0.0)
    Le = Xe.shape[1]
    valid = np.arange(1, M + 1)[None, :] <= m[:, None]

    S = _cumulative_counts(X0, obs, M)
    theta, b = prox(X0, obs, m)
    tau = _initial_tau(Xe, m, model)
    if model == "rsm":
        tau_shared = tau[0].copy()
    delta = build_delta(b, tau, m)

    log: list[IterationRecord] = []
    converged = False
    max_change = np.inf
    max_resid = np.inf
    mom = moments(theta, delta)
    it = 0
    for it in range(1, max_iter + 1):
        if should_cancel is not None and should_cancel():
            raise EstimationCancelled()
        theta_old = theta.copy()
        delta_old = np.where(valid, delta, 0.0)

        # Langkah person: theta += (r - sum E) / sum W
        resid_p = ((X0 - mom.E) * obs_f).sum(axis=1)
        info_p = (mom.W * obs_f).sum(axis=1)
        theta = theta + np.clip(resid_p / np.maximum(info_p, 1e-12), -1.0, 1.0)
        mom = moments(theta, delta)

        if model == "rsm":
            resid_i = ((X0 - mom.E) * obs_f).sum(axis=0)
            info_i = (mom.W * obs_f).sum(axis=0)
            b = b - np.clip(resid_i / np.maximum(info_i, 1e-12), -1.0, 1.0)
            delta = build_delta(b, tau_shared, m)
            mom = moments(theta, delta)
            g = (mom.G * obs_f[:, :, None]).sum(axis=(0, 1)) - S.sum(axis=0)
            J = _block_information(mom.G, obs_f).sum(axis=0)
            try:
                step = np.linalg.solve(J, g)
            except np.linalg.LinAlgError:
                step = g / np.maximum(np.diag(J), 1e-12)
            tau_shared = tau_shared + _damp(step)
            tau_shared -= tau_shared.mean()
            b -= b.mean()
            delta = build_delta(b, tau_shared, m)
        else:
            g = (mom.G * obs_f[:, :, None]).sum(axis=0) - S
            J = _block_information(mom.G, obs_f)
            g = np.where(valid, g, 0.0)
            eye = np.eye(M)[None, :, :]
            vv = valid[:, :, None] & valid[:, None, :]
            J = np.where(vv, J, eye)
            try:
                step = np.linalg.solve(J, g[:, :, None])[:, :, 0]
            except np.linalg.LinAlgError:
                step = g / np.maximum(np.diagonal(J, axis1=1, axis2=2), 1e-12)
            step = _damp(np.where(valid, step, 0.0), axis=1)
            d = np.where(valid, delta, 0.0) + step
            b = d.sum(axis=1) / m
            shift = b.mean()
            d -= shift
            b -= shift
            delta = np.where(valid, d, np.inf)

        mom = moments(theta, delta)
        res = (X0 - mom.E) * obs_f
        max_resid = float(max(np.abs(res.sum(axis=1)).max(), np.abs(res.sum(axis=0)).max()))
        change_d = np.abs(np.where(valid, delta, 0.0) - delta_old).max()
        max_change = float(max(np.abs(theta - theta_old).max(), change_d))
        log.append(IterationRecord(it, max_change, max_resid))
        if progress is not None:
            progress(it, max_change, max_resid)
        if max_change < conv_change and max_resid < conv_resid:
            converged = True
            break

    # --- Standard error model -------------------------------------------
    person_se_e = 1.0 / np.sqrt((mom.W * obs_f).sum(axis=1))
    item_se_e = 1.0 / np.sqrt((mom.W * obs_f).sum(axis=0))
    if model == "pcm":
        # Pada PCM, measure item b_i = rerata delta_ik ikut menanggung
        # ketidakpastian threshold, sehingga SE-nya diambil dengan delta method
        # atas matriks informasi blok item (teori kemungkinan maksimum):
        # Var(b_i) = 1' J_i^{-1} 1 / m_i^2, J_i = informasi delta_i1..delta_im.
        # Untuk m_i = 1 rumus ini identik dengan 1/sqrt(sum W). SE kondisional
        # 1/sqrt(sum W) meremehkan SD sampling sekitar 30% pada simulasi Monte
        # Carlo (0,066 vs 0,093); delta method memberi 0,087. Sisa selisih berasal
        # dari ketidakpastian theta yang melekat pada JMLE.
        J = _block_information(mom.G, obs_f)
        vv = valid[:, :, None] & valid[:, None, :]
        Jinv = np.linalg.inv(np.where(vv, J, np.eye(M)[None, :, :]))
        item_se_e = np.sqrt(np.where(vv, Jinv, 0.0).sum(axis=(1, 2))) / m
    GG = mom.G * (1.0 - mom.G) * obs_f[:, :, None]
    if model == "rsm":
        tse = 1.0 / np.sqrt(GG.sum(axis=(0, 1)))
        tau_se_e = np.where(valid, tse[None, :], np.nan)
    else:
        with np.errstate(divide="ignore"):
            tau_se_e = np.where(valid, 1.0 / np.sqrt(GG.sum(axis=0)), np.nan)

    # --- Susun ke ukuran penuh ------------------------------------------
    full_delta = np.full((L, M_all), np.inf)
    full_delta[np.ix_(ei, np.arange(M))] = delta
    full_b = np.full(L, np.nan)
    full_b[ei] = b
    full_item_se = np.full(L, np.nan)
    full_item_se[ei] = item_se_e
    full_tau_se = np.full((L, M_all), np.nan)
    full_tau_se[np.ix_(ei, np.arange(M))] = tau_se_e
    theta_full = np.full(N, np.nan)
    theta_full[ep] = theta
    pse_full = np.full(N, np.nan)
    pse_full[ep] = person_se_e

    # --- Item ekstrem (hanya dikotomus/RSM; PCM sudah dikeluarkan) --------
    ext_items = np.flatnonzero(np.isin(coded.item_extreme, (-1, 1)))
    if ext_items.size:
        tau_row = np.zeros(M_all) if model == "dichotomous" else tau_shared
        Xi = X[np.ix_(ep, ext_items)]
        oi = ~np.isnan(Xi)
        mi = m_all[ext_items]
        target = np.where(coded.item_extreme[ext_items] < 0, EXTREME_SCORE_ADJUSTMENT,
                          oi.sum(axis=0) * mi - EXTREME_SCORE_ADJUSTMENT)
        tau_x = np.broadcast_to(tau_row, (len(ext_items), M_all))
        bx, sex = solve_item_locations(theta, oi, tau_x, mi, target)
        full_b[ext_items] = bx
        full_item_se[ext_items] = sex
        full_delta[ext_items] = build_delta(bx, np.broadcast_to(tau_row, (len(ext_items), M_all)), mi)

    # --- Person ekstrem ----------------------------------------------------
    usable_items = np.isin(coded.item_extreme, (-1, 0, 1))
    ext_p = np.flatnonzero(np.isin(coded.person_extreme, (-1, 1)))
    if ext_p.size:
        Xp = X[np.ix_(ext_p, usable_items)]
        op = ~np.isnan(Xp)
        mp = m_all[usable_items]
        maxs = (op * mp[None, :]).sum(axis=1)
        target = np.where(coded.person_extreme[ext_p] < 0, EXTREME_SCORE_ADJUSTMENT,
                          maxs - EXTREME_SCORE_ADJUSTMENT)
        tx, sex = _solve_persons(full_delta[usable_items], op, target)
        theta_full[ext_p] = tx
        pse_full[ext_p] = sex

    full_tau = np.where(np.isfinite(full_delta), full_delta - full_b[:, None], np.nan)
    # Koreksi bias JMLE (L-1)/L (Wright & Douglas, 1977; STBIAS= Winsteps) untuk
    # parameter item. Pada RSM/PCM faktor yang sama diterapkan pada lokasi item
    # dan threshold (keputusan peneliti, didukung simulasi: tanpa koreksi, skala
    # threshold PCM mengembang 5-9% pada L = 20, sesuai L/(L-1) = 1,053).
    # Statistik fit, PCA, Q3, dan kategori dihitung dari solusi JMLE tanpa
    # koreksi, sebagaimana praktik Winsteps ("fit statistics are computed
    # without this estimation-bias correction").
    bias = (Le - 1.0) / Le
    return JMLEResult(
        model=model,
        theta=theta_full,
        person_se=pse_full,
        b=full_b,
        item_se=full_item_se,
        delta=full_delta,
        tau=full_tau,
        tau_se=full_tau_se,
        converged=converged,
        n_iter=it,
        max_change=max_change,
        max_residual=max_resid,
        log=log,
        bias_factor=bias,
    )


def _solve_persons(delta: np.ndarray, obs: np.ndarray, target: np.ndarray,
                   max_iter: int = 200, tol: float = 1e-7) -> tuple[np.ndarray, np.ndarray]:
    """Cari theta sehingga skor harapan = target, item tetap (anchored)."""
    obs_f = obs.astype(float)
    theta = np.zeros(target.shape[0])
    for _ in range(max_iter):
        mom = moments(theta, delta)
        E = (mom.E * obs_f).sum(axis=1)
        W = (mom.W * obs_f).sum(axis=1)
        step = np.clip((target - E) / np.maximum(W, 1e-12), -1.0, 1.0)
        theta += step
        if np.max(np.abs(step)) < tol:
            break
    mom = moments(theta, delta)
    return theta, 1.0 / np.sqrt((mom.W * obs_f).sum(axis=1))


def solve_item_locations(theta: np.ndarray, obs: np.ndarray, tau: np.ndarray, m: np.ndarray,
                         target: np.ndarray, max_iter: int = 200,
                         tol: float = 1e-7) -> tuple[np.ndarray, np.ndarray]:
    """Cari lokasi item sehingga skor harapan = target, person dan threshold tetap.

    ``tau`` berbentuk (k, M): threshold relatif tiap item (padding diabaikan
    melalui ``m``). Dipakai untuk item ekstrem dan untuk DIF.
    """
    obs_f = obs.astype(float)
    k = target.shape[0]
    b = np.zeros(k)
    tau = np.where(np.isfinite(tau), tau, 0.0)
    for _ in range(max_iter):
        mom = moments(theta, build_delta(b, tau, m))
        E = (mom.E * obs_f).sum(axis=0)
        W = (mom.W * obs_f).sum(axis=0)
        step = np.clip((E - target) / np.maximum(W, 1e-12), -1.0, 1.0)
        b += step
        if np.max(np.abs(step)) < tol:
            break
    mom = moments(theta, build_delta(b, tau, m))
    return b, 1.0 / np.sqrt((mom.W * obs_f).sum(axis=0))
