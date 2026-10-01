"""Target performa: estimasi + seluruh statistik (termasuk PCA, Q3, DIF)."""

import time

import numpy as np

from raschlite.core.simulate import simulate_dichotomous, simulate_responses


def test_dichotomous_2000x50_under_5_seconds(analyze, record):
    rng = np.random.default_rng(31)
    N, L = 2000, 50
    X = simulate_dichotomous(rng.normal(0, 1, N), rng.uniform(-2, 2, L), rng)
    groups = np.where(rng.random(N) < 0.5, "A", "B").astype(object)
    t0 = time.perf_counter()
    res = analyze(X, "dichotomous", groups=groups)
    elapsed = time.perf_counter() - t0
    record(test="performa dikotomus 2000x50", detik=elapsed, iterasi=res.summary["iterations"])
    assert res.converged
    assert elapsed < 5.0


def test_pcm_1000x30_5_categories_under_10_seconds(analyze, record):
    rng = np.random.default_rng(32)
    N, L = 1000, 30
    b = rng.uniform(-1.5, 1.5, L)
    tau = np.sort(rng.normal(0, 1, (L, 4)), axis=1)
    tau -= tau.mean(axis=1, keepdims=True)
    X = simulate_responses(rng.normal(0, 1, N), b[:, None] + tau, rng)
    groups = np.where(rng.random(N) < 0.5, "A", "B").astype(object)
    t0 = time.perf_counter()
    res = analyze(X, "pcm", groups=groups)
    elapsed = time.perf_counter() - t0
    record(test="performa PCM 1000x30 5 kat", detik=elapsed, iterasi=res.summary["iterations"])
    assert res.converged
    assert elapsed < 10.0
