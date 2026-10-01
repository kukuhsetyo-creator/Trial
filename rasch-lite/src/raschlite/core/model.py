"""Fungsi peluang model Rasch dalam satu parameterisasi terpadu.

Ketiga model ditulis sebagai bentuk umum Masters (1982): untuk item i dengan
kategori 0..m_i,

    P(X_ni = h) = exp(sum_{k<=h} (theta_n - delta_ik)) / sum_g exp(...)

dengan jumlah kosong untuk h = 0. Model dikotomus adalah kasus m_i = 1 dan
delta_i1 = b_i; Rating Scale Model (Andrich, 1978) memakai
delta_ik = b_i + tau_k dengan tau dipakai bersama; Partial Credit Model
memakai delta_ik bebas per item.

Matriks ``delta`` berukuran (L, M), M = max m_i. Kategori yang tidak dimiliki
suatu item diisi ``+inf`` sehingga peluangnya tepat nol.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Moments:
    """Peluang kategori beserta momen skor yang diharapkan model."""

    P: np.ndarray  # (N, L, M+1) peluang kategori
    E: np.ndarray  # (N, L) skor harapan
    W: np.ndarray  # (N, L) varians skor (informasi)
    G: np.ndarray  # (N, L, M) peluang kumulatif P(X >= k), k = 1..M


def category_probabilities(theta: np.ndarray, delta: np.ndarray) -> np.ndarray:
    """Peluang setiap kategori, bentuk (N, L, M+1)."""
    theta = np.asarray(theta, dtype=float)
    L, M = delta.shape
    cum = np.zeros((L, M + 1))
    cum[:, 1:] = np.cumsum(delta, axis=1)
    k = np.arange(M + 1, dtype=float)
    psi = theta[:, None, None] * k[None, None, :] - cum[None, :, :]
    psi -= psi.max(axis=2, keepdims=True)
    P = np.exp(psi)
    P /= P.sum(axis=2, keepdims=True)
    return P


def moments(theta: np.ndarray, delta: np.ndarray) -> Moments:
    """Hitung peluang, skor harapan, varians, dan peluang kumulatif."""
    P = category_probabilities(theta, delta)
    k = np.arange(P.shape[2], dtype=float)
    E = P @ k
    W = P @ (k * k) - E * E
    np.maximum(W, 0.0, out=W)
    G = np.cumsum(P[:, :, ::-1], axis=2)[:, :, ::-1][:, :, 1:]
    return Moments(P=P, E=E, W=W, G=G)


def kurtosis_term(P: np.ndarray, E: np.ndarray) -> np.ndarray:
    """Momen pusat keempat C_ni = sum_k (k - E_ni)^4 P_nik (Wright & Masters, 1982)."""
    k = np.arange(P.shape[2], dtype=float)
    dev = k[None, None, :] - E[:, :, None]
    return np.einsum("nlk,nlk->nl", P, dev ** 4)


def expected_score_curve(theta_grid: np.ndarray, delta_row: np.ndarray) -> np.ndarray:
    """Skor harapan satu item pada sekumpulan nilai theta."""
    P = category_probabilities(theta_grid, delta_row[None, :])[:, 0, :]
    return P @ np.arange(P.shape[1], dtype=float)


def information_curve(theta_grid: np.ndarray, delta: np.ndarray) -> np.ndarray:
    """Informasi item (varians skor) pada grid theta, bentuk (G, L)."""
    return moments(theta_grid, delta).W


def build_delta(b: np.ndarray, tau: np.ndarray, m: np.ndarray) -> np.ndarray:
    """Susun delta_ik = b_i + tau_ik dengan padding +inf di atas m_i."""
    L = b.shape[0]
    M = tau.shape[-1]
    tau2 = np.broadcast_to(tau, (L, M))
    delta = b[:, None] + tau2
    valid = np.arange(1, M + 1)[None, :] <= m[:, None]
    return np.where(valid, delta, np.inf)
