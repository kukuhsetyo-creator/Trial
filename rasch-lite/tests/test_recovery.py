"""Tes penerimaan recovery parameter (dikotomus, missing 10%, RSM, PCM).

Setiap kriteria diuji pada tiga seed agar kelulusan tidak bergantung pada satu
realisasi acak.
"""

import numpy as np
import pytest

from raschlite.core.simulate import rsm_delta, simulate_dichotomous, simulate_responses

SEEDS = [101, 202, 303]


def _r(a, b):
    return float(np.corrcoef(a, b)[0, 1])


def _rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))


@pytest.mark.parametrize("seed", SEEDS)
def test_dichotomous_recovery(seed, analyze, record):
    rng = np.random.default_rng(seed)
    N, L = 1000, 30
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-2.0, 2.0, L)
    res = analyze(simulate_dichotomous(theta, b, rng), "dichotomous", run_dif=False)
    assert res.converged
    est = res.items["measure"].to_numpy()
    true = b - b.mean()
    r, rmse = _r(est, true), _rmse(est, true)
    s = res.summary
    record(test="dikotomus N=1000 L=30", seed=seed, r_b=r, rmse_b=rmse,
           item_infit=s["item_mean_infit"], item_outfit=s["item_mean_outfit"],
           person_infit=s["person_mean_infit"], person_outfit=s["person_mean_outfit"],
           iterasi=s["iterations"])
    assert r >= 0.98
    assert rmse <= 0.15
    for key in ("item_mean_infit", "item_mean_outfit", "person_mean_infit", "person_mean_outfit"):
        assert 0.9 <= s[key] <= 1.1, key


@pytest.mark.parametrize("seed", SEEDS)
def test_missing_10_percent_recovery(seed, analyze, record):
    rng = np.random.default_rng(seed + 1)
    N, L = 1000, 30
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-2.0, 2.0, L)
    X = simulate_dichotomous(theta, b, rng)
    X[rng.random(X.shape) < 0.10] = np.nan
    res = analyze(X, "dichotomous", run_dif=False)
    assert res.converged
    est = res.items["measure"].to_numpy()
    true = b - b.mean()
    r = _r(est, true)
    record(test="dikotomus missing 10%", seed=seed, missing_pct=res.summary["missing_pct"], r_b=r,
           rmse_b=_rmse(est, true), iterasi=res.summary["iterations"])
    assert r >= 0.95


@pytest.mark.parametrize("seed", SEEDS)
def test_rsm_recovery(seed, analyze, record):
    rng = np.random.default_rng(seed + 2)
    N, L = 1000, 20
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-1.5, 1.5, L)
    tau = np.array([-1.3, 0.2, 1.1])  # 4 kategori
    res = analyze(simulate_responses(theta, rsm_delta(b, tau), rng), "rsm", run_dif=False)
    assert res.converged
    tau_est = res.jmle.threshold[0, :3]
    delta_true = rsm_delta(b - b.mean(), tau)
    delta_est = res.jmle.threshold_location[:, :3]
    r_tau = _r(tau_est, tau)
    record(test="RSM N=1000 L=20 4 kat", seed=seed, r_tau=r_tau, rmse_tau=_rmse(tau_est, tau),
           r_delta=_r(delta_est.ravel(), delta_true.ravel()),
           r_b=_r(res.items["measure"], b - b.mean()), iterasi=res.summary["iterations"])
    assert r_tau >= 0.95


@pytest.mark.parametrize("seed", SEEDS)
def test_pcm_recovery(seed, analyze, record):
    rng = np.random.default_rng(seed + 3)
    N, L = 1000, 20
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-1.5, 1.5, L)
    tau = np.array([-1.5, 0.0, 1.5])[None, :] + rng.uniform(-0.5, 0.5, (L, 3))
    tau = np.sort(tau, axis=1)
    tau -= tau.mean(axis=1, keepdims=True)
    delta = b[:, None] + tau
    res = analyze(simulate_responses(theta, delta, rng), "pcm", run_dif=False)
    assert res.converged
    delta_true = delta - b.mean()
    delta_est = res.jmle.threshold_location[:, :3]
    r_delta = _r(delta_est.ravel(), delta_true.ravel())
    record(test="PCM N=1000 L=20 4 kat", seed=seed, r_delta=r_delta,
           rmse_delta=_rmse(delta_est.ravel(), delta_true.ravel()),
           r_tau_relatif=_r(res.jmle.threshold[:, :3].ravel(), tau.ravel()),
           rmse_tau_relatif=_rmse(res.jmle.threshold[:, :3].ravel(), tau.ravel()),
           r_b=_r(res.items["measure"], b - b.mean()), iterasi=res.summary["iterations"])
    assert r_delta >= 0.95
