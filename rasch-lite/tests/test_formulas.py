"""Pemeriksaan rumus terhadap implementasi brute-force yang ditulis ulang secara independen."""

import numpy as np
import pandas as pd

from raschlite.core.data import code_responses, prepare_data
from raschlite.core.dimensionality import residual_pca, yen_q3
from raschlite.core.fit import fit_statistics, point_measure, wilson_hilferty
from raschlite.core.jmle import EXTREME_SCORE_ADJUSTMENT
from raschlite.core.model import category_probabilities, kurtosis_term, moments
from raschlite.core.reliability import cronbach_alpha, separation_statistics
from raschlite.core.simulate import rsm_delta, simulate_dichotomous, simulate_responses


def test_dichotomous_probability_is_logistic():
    theta = np.array([-1.0, 0.0, 2.0])
    b = np.array([0.5, -0.3])
    P = category_probabilities(theta, b[:, None])
    expected = 1.0 / (1.0 + np.exp(-(theta[:, None] - b[None, :])))
    assert np.allclose(P[:, :, 1], expected)


def test_polytomous_probability_matches_definition_and_padding():
    theta = np.array([0.4])
    delta = np.array([[-1.0, 0.2, 0.9], [0.3, np.inf, np.inf]])
    P = category_probabilities(theta, delta)[0]
    num = np.exp([0.0, 0.4 + 1.0, 0.8 + 1.0 - 0.2, 1.2 + 1.0 - 0.2 - 0.9])
    assert np.allclose(P[0], num / num.sum())
    assert np.allclose(P[1, :2], [1 / (1 + np.exp(0.1)), np.exp(0.1) / (1 + np.exp(0.1))])
    assert np.all(P[1, 2:] == 0.0)


def _brute_fit(X, theta, delta, axis):
    N, L = X.shape
    out = {"infit": [], "outfit": [], "q_in": [], "q_out": []}
    rng_outer = range(L) if axis == 0 else range(N)
    for a in rng_outer:
        y2s, ws, z2s, cs, cw2 = [], [], [], [], []
        for c in (range(N) if axis == 0 else range(L)):
            n, i = (c, a) if axis == 0 else (a, c)
            if np.isnan(X[n, i]):
                continue
            d = delta[i][np.isfinite(delta[i])]
            num = np.exp(np.concatenate([[0.0], np.cumsum(theta[n] - d)]))
            p = num / num.sum()
            k = np.arange(len(p))
            e = (k * p).sum()
            w = ((k - e) ** 2 * p).sum()
            cc = ((k - e) ** 4 * p).sum()
            y2 = (X[n, i] - e) ** 2
            y2s.append(y2); ws.append(w); z2s.append(y2 / w); cs.append(cc / w ** 2); cw2.append(cc - w ** 2)
        n_obs = len(ws)
        out["outfit"].append(np.mean(z2s))
        out["infit"].append(np.sum(y2s) / np.sum(ws))
        out["q_out"].append(np.sqrt(np.sum(cs) / n_obs ** 2 - 1 / n_obs))
        out["q_in"].append(np.sqrt(np.sum(cw2) / np.sum(ws) ** 2))
    return {k: np.array(v) for k, v in out.items()}


def test_fit_statistics_match_brute_force():
    rng = np.random.default_rng(4)
    N, L = 40, 5
    theta = rng.normal(0, 1, N)
    delta = np.array([[-1.0, 0.0, 1.0], [-0.5, 0.5, np.inf], [0.2, np.inf, np.inf],
                      [-1.2, -0.1, 0.8], [0.0, 0.4, np.inf]])
    X = simulate_responses(theta, delta, rng)
    X[rng.random(X.shape) < 0.1] = np.nan
    obs = ~np.isnan(X)
    X0 = np.where(obs, X, 0.0)
    mom = moments(theta, delta)
    C = kurtosis_term(mom.P, mom.E)
    for axis in (0, 1):
        got = fit_statistics(X0, obs, mom.E, mom.W, C, axis=axis)
        ref = _brute_fit(X, theta, delta, axis)
        assert np.allclose(got["outfit_mnsq"], ref["outfit"])
        assert np.allclose(got["infit_mnsq"], ref["infit"])
        assert np.allclose(got["outfit_zstd"], (np.cbrt(ref["outfit"]) - 1) * 3 / ref["q_out"] + ref["q_out"] / 3)
        assert np.allclose(got["infit_zstd"], (np.cbrt(ref["infit"]) - 1) * 3 / ref["q_in"] + ref["q_in"] / 3)


def test_wilson_hilferty_values():
    assert np.isclose(wilson_hilferty(np.array(1.0), np.array(0.3)), 0.1)
    assert np.isclose(wilson_hilferty(np.array(1.331), np.array(0.3)), (1.1 - 1) * 10 + 0.1)


def test_point_measure_correlations_match_formula():
    rng = np.random.default_rng(8)
    theta = rng.normal(0, 1, 200)
    b = np.array([-1.0, 0.0, 1.0])
    X = simulate_dichotomous(theta, b, rng)
    obs = np.ones_like(X, dtype=bool)
    mom = moments(theta, b[:, None])
    r_obs, r_exp = point_measure(X, obs, theta, mom.E, mom.W)
    for i in range(3):
        assert np.isclose(r_obs[i], np.corrcoef(X[:, i], theta)[0, 1])
        e, t = mom.E[:, i] - mom.E[:, i].mean(), theta - theta.mean()
        ref = (e * t).sum() / np.sqrt((t ** 2).sum() * ((e ** 2).sum() + mom.W[:, i].sum()))
        assert np.isclose(r_exp[i], ref)


def test_separation_reliability_strata_identities():
    rng = np.random.default_rng(9)
    m = rng.normal(0, 1.5, 300)
    se = np.full(300, 0.5)
    s = separation_statistics(m, se)
    G, R = s["model_separation"], s["model_reliability"]
    assert np.isclose(R, G ** 2 / (1 + G ** 2))
    assert np.isclose(s["model_strata"], (4 * G + 1) / 3)
    assert np.isclose(R, (np.var(m) - 0.25) / np.var(m))


def test_cronbach_alpha_matches_definition():
    rng = np.random.default_rng(10)
    X = rng.integers(0, 2, size=(100, 8)).astype(float)
    X[3, 2] = np.nan
    alpha, n = cronbach_alpha(X)
    Y = X[~np.isnan(X).any(axis=1)]
    ref = 8 / 7 * (1 - Y.var(axis=0, ddof=1).sum() / Y.sum(axis=1).var(ddof=1))
    assert n == 99 and np.isclose(alpha, ref)


def test_q3_and_pca_on_complete_data():
    rng = np.random.default_rng(12)
    theta = rng.normal(0, 1, 300)
    b = np.linspace(-1, 1, 6)
    X = simulate_dichotomous(theta, b, rng)
    obs = np.ones_like(X, dtype=bool)
    mom = moments(theta, b[:, None])
    names = [f"I{i}" for i in range(6)]
    q3 = yen_q3(X, obs, mom.E, names, 0.2)
    assert np.allclose(q3["matrix"].to_numpy(), np.corrcoef((X - mom.E).T))
    pca = residual_pca(X, obs, mom.E, mom.W, names)
    assert np.isclose(pca["eigenvalues"].sum(), 6.0)
    z = (X - mom.E) / np.sqrt(mom.W)
    assert np.isclose(pca["first_contrast_eigenvalue"], np.linalg.eigvalsh(np.corrcoef(z.T)).max())


def _coded(X, model):
    df = pd.DataFrame(X, columns=[f"I{j}" for j in range(X.shape[1])])
    prep = prepare_data(df, list(df.columns))
    return prep, code_responses(prep, model)


def test_jmle_solution_satisfies_score_equations(analyze):
    rng = np.random.default_rng(13)
    theta = rng.normal(0, 1, 400)
    b = rng.uniform(-1, 1, 10)
    X = simulate_responses(theta, rsm_delta(b, [-1.0, 0.0, 1.0]), rng)
    for model in ("rsm", "pcm"):
        res = analyze(X, model, run_dif=False)
        c = res.coded
        ep = c.person_extreme == 0
        Xe = c.X[ep]
        mom = moments(res.jmle.theta[ep], res.jmle.delta)
        r = Xe - mom.E
        assert np.abs(r.sum(axis=1)).max() < 0.01
        assert np.abs(r.sum(axis=0)).max() < 0.01


def test_bias_correction_factor(analyze):
    rng = np.random.default_rng(14)
    theta = rng.normal(0, 1, 300)
    b = rng.uniform(-2, 2, 12)
    res = analyze(simulate_dichotomous(theta, b, rng), "dichotomous", run_dif=False)
    assert np.allclose(res.items["measure"], res.jmle.b * 11 / 12)
    X = simulate_responses(theta, rsm_delta(b, [-0.5, 0.5]), rng)
    res = analyze(X, "rsm", run_dif=False)
    assert np.allclose(res.items["measure"], res.jmle.b)


def test_extreme_persons_receive_0_3_adjusted_measures(analyze):
    rng = np.random.default_rng(15)
    theta = rng.normal(0, 1, 200)
    b = rng.uniform(-1, 1, 8)
    X = simulate_dichotomous(theta, b, rng)
    X[0] = 0.0
    X[1] = 1.0
    X[2, :4] = np.nan
    X[2, 4:] = 1.0
    res = analyze(X, "dichotomous", run_dif=False)
    p = res.persons
    assert list(p.loc[[0, 1, 2], "status"]) == ["ekstrem minimum", "ekstrem maksimum", "ekstrem maksimum"]
    mom = moments(res.jmle.theta[:3], res.jmle.delta)
    obs = ~np.isnan(X[:3])
    exp_score = (mom.E * obs).sum(axis=1)
    assert np.allclose(exp_score, [EXTREME_SCORE_ADJUSTMENT, 8 - EXTREME_SCORE_ADJUSTMENT,
                                   4 - EXTREME_SCORE_ADJUSTMENT], atol=1e-6)
    assert np.all(np.isfinite(p.loc[[0, 1, 2], "se"]))
    assert p.loc[[0, 1, 2], "infit_mnsq"].isna().all()
    obs_all = ~np.isnan(X)
    score = np.nansum(X, axis=1)
    n_extreme = int(((score == 0) | (score == obs_all.sum(axis=1))).sum())
    assert n_extreme >= 3
    assert res.summary["n_persons_extreme"] == n_extreme
    assert res.summary["n_persons_estimated"] == 200 - n_extreme
