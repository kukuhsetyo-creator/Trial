"""Orkestrasi analisis Rasch lengkap: estimasi, fit, kategori, global, PCA, Q3, DIF."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from ..interpret import rules
from . import messages as msg
from .categories import category_table
from .data import CodedData, DataIssue, PreparedData, code_responses
from .dif import dif_analysis
from .dimensionality import residual_pca, yen_q3
from .fit import fit_statistics, point_measure
from .jmle import JMLEResult, estimate
from .model import kurtosis_term, moments
from .reliability import cronbach_alpha, separation_statistics

STATUS_LABELS = {0: "", -1: "ekstrem minimum", 1: "ekstrem maksimum", 2: "tidak diestimasi"}


@dataclass
class RaschResults:
    model: str
    coded: CodedData
    jmle: JMLEResult
    items: pd.DataFrame
    persons: pd.DataFrame
    categories: pd.DataFrame | None
    summary: dict
    dimensionality: dict
    q3: dict
    dif: pd.DataFrame | None
    issues: list[DataIssue] = field(default_factory=list)
    settings: dict = field(default_factory=dict)
    elapsed_seconds: float = 0.0

    @property
    def converged(self) -> bool:
        return self.jmle.converged


def run_analysis(
    prep: PreparedData,
    model: str,
    *,
    strict_fit: bool = False,
    run_dif: bool = True,
    max_iter: int = 500,
    conv_change: float = 0.001,
    conv_resid: float = 0.01,
    progress: Callable[[int, float, float], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> RaschResults:
    t0 = time.perf_counter()
    coded = code_responses(prep, model)
    jm = estimate(coded, max_iter=max_iter, conv_change=conv_change, conv_resid=conv_resid,
                  progress=progress, should_cancel=should_cancel)
    issues = list(prep.issues) + list(coded.issues)
    if jm.converged:
        issues.append(DataIssue("info", "converged", msg.CONVERGED.format(n=jm.n_iter)))
    else:
        issues.append(DataIssue("warning", "not_converged",
                                msg.NOT_CONVERGED.format(n=jm.n_iter, change=jm.max_change, resid=jm.max_residual)))
    if model != "dichotomous":
        issues.append(DataIssue("info", "no_bias_correction_poly", msg.NO_BIAS_CORRECTION_POLY))

    lo, hi = rules.mnsq_range(strict_fit)
    names = coded.item_names
    ep = coded.person_extreme == 0
    ei = coded.item_extreme == 0
    Xe = coded.X[np.ix_(ep, ei)]
    obs = ~np.isnan(Xe)
    X0 = np.where(obs, Xe, 0.0)
    theta_e = jm.theta[ep]
    delta_e = jm.delta[ei][:, : int(coded.m[ei].max())]
    mom = moments(theta_e, delta_e)
    C = kurtosis_term(mom.P, mom.E)
    names_e = [n for n, keep in zip(names, ei) if keep]

    item_fit = fit_statistics(X0, obs, mom.E, mom.W, C, axis=0)
    person_fit = fit_statistics(X0, obs, mom.E, mom.W, C, axis=1)
    pt_obs, pt_exp = point_measure(X0, obs, theta_e, mom.E, mom.W)

    items = _item_table(coded, jm, ei, item_fit, pt_obs, pt_exp, lo, hi)
    persons = _person_table(coded, jm, ep, ei, person_fit, lo, hi)

    categories = None
    if model != "dichotomous":
        categories = category_table(model, X0, obs, theta_e, jm.b[ei], mom.E, mom.W, jm.tau[ei],
                                    jm.tau_se[ei], jm.delta[ei], coded.m[ei],
                                    [lab for lab, keep in zip(coded.category_labels, ei) if keep],
                                    names_e, rules.CATEGORY_MIN_COUNT)

    summary = _summary(prep, coded, jm, items, persons, ep, ei)
    dimensionality = residual_pca(X0, obs, mom.E, mom.W, names_e)
    q3 = yen_q3(X0, obs, mom.E, names_e, rules.Q3_RELATIVE_CUTOFF)

    dif = None
    if run_dif and coded.groups is not None:
        tau_e = jm.tau[ei]
        dif, too_small = dif_analysis(Xe, theta_e, tau_e, coded.m[ei], coded.groups[ep], names_e,
                                      jm.bias_factor, rules.DIF_CONTRAST_MIN, rules.DIF_P_MAX)
        for g in too_small:
            issues.append(DataIssue("warning", "dif_too_few", msg.DIF_TOO_FEW.format(group=g)))
        if dif.empty:
            dif = None

    settings = {
        "model": model,
        "strict_fit": strict_fit,
        "mnsq_range": (lo, hi),
        "max_iter": max_iter,
        "conv_change": conv_change,
        "conv_resid": conv_resid,
        "bias_factor": jm.bias_factor,
        "q3_relative_cutoff": rules.Q3_RELATIVE_CUTOFF,
        "dif_contrast_min": rules.DIF_CONTRAST_MIN,
        "dif_p_max": rules.DIF_P_MAX,
        "category_min_count": rules.CATEGORY_MIN_COUNT,
    }
    return RaschResults(
        model=model, coded=coded, jmle=jm, items=items, persons=persons, categories=categories,
        summary=summary, dimensionality=dimensionality, q3=q3, dif=dif, issues=issues,
        settings=settings, elapsed_seconds=time.perf_counter() - t0,
    )


def _misfit(infit: np.ndarray, outfit: np.ndarray, lo: float, hi: float) -> np.ndarray:
    with np.errstate(invalid="ignore"):
        return (infit < lo) | (infit > hi) | (outfit < lo) | (outfit > hi)


def _item_table(coded: CodedData, jm: JMLEResult, ei: np.ndarray, fit: dict, pt_obs, pt_exp,
                lo: float, hi: float) -> pd.DataFrame:
    L = len(coded.item_names)
    usable_p = np.isin(coded.person_extreme, (-1, 0, 1))
    Xu = coded.X[usable_p]
    obs_u = ~np.isnan(Xu)
    df = pd.DataFrame({
        "item": coded.item_names,
        "score": np.where(obs_u, Xu, 0.0).sum(axis=0),
        "count": obs_u.sum(axis=0),
        "max_score": obs_u.sum(axis=0) * coded.m,
        "n_categories": coded.m + 1,
        "measure": jm.item_measure,
        "se": jm.item_measure_se,
    })

    def spread(values):
        out = np.full(L, np.nan)
        out[ei] = values
        return out

    for key in ("infit_mnsq", "infit_zstd", "outfit_mnsq", "outfit_zstd"):
        df[key] = spread(fit[key])
    df["ptmea_obs"] = spread(pt_obs)
    df["ptmea_exp"] = spread(pt_exp)
    df["status"] = [STATUS_LABELS[int(s)] for s in coded.item_extreme]
    df["extreme"] = coded.item_extreme != 0
    df["flag_misfit"] = _misfit(df["infit_mnsq"].to_numpy(), df["outfit_mnsq"].to_numpy(), lo, hi)
    df["flag_negative_ptmea"] = df["ptmea_obs"].to_numpy() < rules.PTMEASURE_MIN
    return df


def _person_table(coded: CodedData, jm: JMLEResult, ep: np.ndarray, ei: np.ndarray, fit: dict,
                  lo: float, hi: float) -> pd.DataFrame:
    N = len(coded.person_ids)
    usable_i = np.isin(coded.item_extreme, (-1, 0, 1))
    Xu = coded.X[:, usable_i]
    obs_u = ~np.isnan(Xu)
    df = pd.DataFrame({
        "person": coded.person_ids,
        "score": np.where(obs_u, Xu, 0.0).sum(axis=1),
        "count": obs_u.sum(axis=1),
        "max_score": (obs_u * coded.m[usable_i][None, :]).sum(axis=1),
        "measure": jm.theta,
        "se": jm.person_se,
    })
    if coded.groups is not None:
        df.insert(1, "group", coded.groups)

    def spread(values):
        out = np.full(N, np.nan)
        out[ep] = values
        return out

    for key in ("infit_mnsq", "infit_zstd", "outfit_mnsq", "outfit_zstd"):
        df[key] = spread(fit[key])
    df["status"] = [STATUS_LABELS[int(s)] for s in coded.person_extreme]
    df["extreme"] = np.isin(coded.person_extreme, (-1, 1))
    df["flag_misfit"] = _misfit(df["infit_mnsq"].to_numpy(), df["outfit_mnsq"].to_numpy(), lo, hi)
    return df


def _summary(prep: PreparedData, coded: CodedData, jm: JMLEResult, items: pd.DataFrame,
             persons: pd.DataFrame, ep: np.ndarray, ei: np.ndarray) -> dict:
    p_sep = separation_statistics(persons["measure"].to_numpy()[ep], persons["se"].to_numpy()[ep],
                                  persons["infit_mnsq"].to_numpy()[ep])
    i_sep = separation_statistics(items["measure"].to_numpy()[ei], items["se"].to_numpy()[ei],
                                  items["infit_mnsq"].to_numpy()[ei])
    usable_i = np.isin(coded.item_extreme, (-1, 0, 1))
    alpha, n_alpha = cronbach_alpha(prep.raw[:, usable_i])
    return {
        "model": coded.model,
        "n_persons": int(len(coded.person_ids)),
        "n_persons_estimated": int(ep.sum()),
        "n_persons_extreme": int(np.isin(coded.person_extreme, (-1, 1)).sum()),
        "n_items": int(len(coded.item_names)),
        "n_items_estimated": int(ei.sum()),
        "n_items_extreme": int(np.isin(coded.item_extreme, (-1, 1)).sum()),
        "n_items_excluded_input": len(prep.excluded_items),
        "missing_pct": float(100.0 * np.isnan(coded.X).mean()),
        "person": p_sep,
        "item": i_sep,
        "person_reliability": p_sep["real_reliability"],
        "item_reliability": i_sep["real_reliability"],
        "person_separation": p_sep["real_separation"],
        "item_separation": i_sep["real_separation"],
        "person_strata": p_sep["real_strata"],
        "item_strata": i_sep["real_strata"],
        "alpha": alpha,
        "alpha_n": n_alpha,
        "alpha_label": "KR-20" if coded.model == "dichotomous" else "Cronbach's alpha",
        "targeting": float(p_sep["mean"] - i_sep["mean"]),
        "person_mean": p_sep["mean"],
        "item_mean": i_sep["mean"],
        "item_mean_infit": float(np.nanmean(items["infit_mnsq"].to_numpy()[ei])),
        "item_mean_outfit": float(np.nanmean(items["outfit_mnsq"].to_numpy()[ei])),
        "person_mean_infit": float(np.nanmean(persons["infit_mnsq"].to_numpy()[ep])),
        "person_mean_outfit": float(np.nanmean(persons["outfit_mnsq"].to_numpy()[ep])),
        "n_items_misfit": int(items["flag_misfit"].sum()),
        "n_persons_misfit": int(persons["flag_misfit"].sum()),
        "converged": jm.converged,
        "iterations": jm.n_iter,
        "max_change": jm.max_change,
        "max_residual": jm.max_residual,
    }
