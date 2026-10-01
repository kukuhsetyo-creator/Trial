"""Tes penerimaan deteksi: respons acak, threshold tidak berurutan, DIF, multidimensi, Q3."""

import numpy as np
import pytest

from raschlite.core.simulate import rsm_delta, simulate_dichotomous, simulate_responses

SEEDS = [11, 22, 33]


@pytest.mark.parametrize("seed", SEEDS)
def test_random_response_items_have_high_outfit(seed, analyze, record):
    rng = np.random.default_rng(seed)
    N, L = 1000, 30
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-2.0, 2.0, L)
    X = simulate_dichotomous(theta, b, rng)
    random_items = [4, 15, 26]
    for j in random_items:
        X[:, j] = (rng.random(N) < 0.5).astype(float)
    res = analyze(X, "dichotomous", run_dif=False)
    outfit = res.items["outfit_mnsq"].to_numpy()
    others = np.delete(outfit, random_items)
    record(test="3 item acak", seed=seed,
           outfit_acak=", ".join(f"{v:.3f}" for v in outfit[random_items]),
           outfit_maks_item_lain=float(others.max()))
    assert np.all(outfit[random_items] > 1.3)
    assert np.all(others <= 1.3), "item non-acak ikut melewati 1.3"


def test_disordered_thresholds_rsm_flagged(analyze, record):
    rng = np.random.default_rng(5)
    N, L = 1000, 20
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-1.0, 1.0, L)
    tau = np.array([-1.5, 0.75, -0.75, 1.5])  # tau_3 < tau_2
    res = analyze(simulate_responses(theta, rsm_delta(b, tau), rng), "rsm", run_dif=False)
    cat = res.categories
    flagged = cat.loc[cat["flag_disordered_threshold"], "category"].tolist()
    record(test="RSM threshold tak berurutan", threshold_est=", ".join(f"{v:.2f}" for v in res.jmle.tau[0]),
           kategori_ditandai=str(flagged))
    assert flagged == [3]


def test_disordered_thresholds_pcm_flagged(analyze, record):
    rng = np.random.default_rng(6)
    N, L = 1000, 20
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-1.0, 1.0, L)
    tau = np.tile([-1.5, -0.5, 0.5, 1.5], (L, 1))
    tau[4] = [-1.0, 0.8, -0.8, 1.0]  # item I05 tidak berurutan
    res = analyze(simulate_responses(theta, b[:, None] + tau, rng), "pcm", run_dif=False)
    cat = res.categories
    flagged_items = sorted(set(cat.loc[cat["flag_disordered_threshold"], "item"]))
    record(test="PCM threshold tak berurutan", item_ditandai=str(flagged_items),
           threshold_I05=", ".join(f"{v:.2f}" for v in res.jmle.tau[4, :4]))
    assert flagged_items == ["I05"]


@pytest.mark.parametrize("seed", SEEDS)
def test_dif_detected(seed, analyze, record):
    rng = np.random.default_rng(seed + 100)
    N, L = 1000, 20
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-2.0, 2.0, L)
    groups = np.array(["A"] * (N // 2) + ["B"] * (N // 2), dtype=object)
    dif_items = [2, 10]
    b_person = np.tile(b, (N, 1))
    b_person[N // 2:, dif_items] += 1.0  # lebih sulit 1 logit bagi grup B
    P = 1.0 / (1.0 + np.exp(-(theta[:, None] - b_person)))
    X = (rng.random((N, L)) < P).astype(float)
    res = analyze(X, "dichotomous", groups=groups)
    dif = res.dif
    flagged = dif.loc[dif["flag_dif"], "item"].tolist()
    rows = dif.set_index("item")
    record(test="DIF 2 item +1 logit grup B", seed=seed, ditandai=str(flagged),
           kontras_I03=float(rows.loc["I03", "contrast"]), p_I03=float(rows.loc["I03", "p"]),
           kontras_I11=float(rows.loc["I11", "contrast"]), p_I11=float(rows.loc["I11", "p"]))
    assert {"I03", "I11"} <= set(flagged)
    assert set(flagged) == {"I03", "I11"}, "item tanpa DIF ikut ditandai"
    assert rows.loc["I03", "contrast"] < 0 and rows.loc["I11", "contrast"] < 0
    assert set(rows.loc[["I03", "I11"], "ets_category"]) <= {"B", "C"}


@pytest.mark.parametrize("seed", SEEDS)
def test_two_dimensional_data_first_contrast_above_2(seed, analyze, record):
    rng = np.random.default_rng(seed + 200)
    N, L = 1000, 30
    cov = np.array([[1.0, 0.3], [0.3, 1.0]])
    th = rng.multivariate_normal([0.0, 0.0], cov, N)
    b = rng.uniform(-2.0, 2.0, L)
    dim = np.repeat([0, 1], L // 2)
    P = 1.0 / (1.0 + np.exp(-(th[:, dim] - b[None, :])))
    X = (rng.random((N, L)) < P).astype(float)
    res = analyze(X, "dichotomous", run_dif=False)
    eig = res.dimensionality["first_contrast_eigenvalue"]
    load = res.dimensionality["loadings"].to_numpy()
    record(test="2 dimensi r=0.3", seed=seed, eigen_kontras1=eig,
           rerata_loading_dim1=float(load[dim == 0].mean()), rerata_loading_dim2=float(load[dim == 1].mean()))
    assert eig > 2.0
    assert np.sign(load[dim == 0].mean()) != np.sign(load[dim == 1].mean())


def test_unidimensional_control_first_contrast_below_2(analyze, record):
    rng = np.random.default_rng(909)
    N, L = 1000, 30
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-2.0, 2.0, L)
    res = analyze(simulate_dichotomous(theta, b, rng), "dichotomous", run_dif=False)
    eig = res.dimensionality["first_contrast_eigenvalue"]
    record(test="kontrol unidimensi", eigen_kontras1=eig,
           varians_dijelaskan_pct=res.dimensionality["variance_explained_pct"])
    assert eig < 2.0


def test_local_dependence_pair_flagged(analyze, record):
    rng = np.random.default_rng(77)
    N, L = 1000, 20
    theta = rng.normal(0.0, 1.0, N)
    b = rng.uniform(-1.5, 1.5, L)
    X = simulate_dichotomous(theta, b, rng)
    copy = rng.random(N) < 0.5
    X[copy, 7] = X[copy, 6]  # item I08 menyalin I07 pada separuh responden
    res = analyze(X, "dichotomous", run_dif=False)
    pairs = res.q3["flagged_pairs"]
    found = {tuple(sorted(p)) for p in zip(pairs["item_a"], pairs["item_b"])}
    record(test="dependensi lokal I07-I08", q3_rerata=res.q3["mean"],
           pasangan_ditandai=str(sorted(found)))
    assert found == {("I07", "I08")}
