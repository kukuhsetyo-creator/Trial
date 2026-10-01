"""Sepuluh grafik RaschLite (matplotlib murni, tanpa pyplot dan tanpa Qt).

Setiap fungsi menerima :class:`~raschlite.core.analysis.RaschResults` dan
mengembalikan :class:`matplotlib.figure.Figure` yang dapat di-embed lewat
FigureCanvasQTAgg atau disimpan dengan :func:`raschlite.plots.style.save_figure`.

Parameter yang dipakai:
* Item measure dan threshold location yang ditampilkan memakai nilai yang dilaporkan
  di tabel (sudah dikoreksi bias (L-1)/L), sehingga angka pada grafik sama dengan
  tabel: Wright Map, Category Probability Curves, Expected Score Curve, Test
  Information Function, Item Fit Bubble Chart, PCA first contrast, dan DIF Plot.
* Item Characteristic Curve membandingkan model dengan titik empiris, sehingga
  memakai solusi JMLE sebelum koreksi bias, yaitu solusi tempat statistik fit
  dihitung dan person measure diestimasi.

Semua teks pada grafik (judul, sumbu, legenda) memakai istilah Rasch dalam bahasa
Inggris; penjelasan berbahasa Indonesia ada di panel "Cara membaca grafik ini".
"""

from __future__ import annotations

import numpy as np
from matplotlib.colors import TwoSlopeNorm
from matplotlib.lines import Line2D
from matplotlib.patches import Patch, Rectangle
from scipy.special import stdtrit

from ..interpret import rules
from ..interpret.narrative import num
from ..core.model import category_probabilities, moments
from . import style as st


# ---------------------------------------------------------------------------
# Helper data
# ---------------------------------------------------------------------------
def _item_index(res, item: str) -> int:
    return res.coded.item_names.index(item)


def _row(delta_row: np.ndarray) -> np.ndarray:
    return delta_row[np.isfinite(delta_row)]


def _labels(res, i: int) -> list[str]:
    return res.coded.category_labels[i]


def _estimable_items(res) -> np.ndarray:
    return res.coded.item_extreme == 0


def _count(n: int, noun: str) -> str:
    """'1 item', '12 items': bentuk tunggal/jamak untuk teks grafik berbahasa Inggris."""
    return f"{n} {noun}" + ("" if n == 1 else "s")


def empirical_bins(theta: np.ndarray, x: np.ndarray, dichotomous: bool, n_bins: int | None = None):
    """Kelompokkan person ke 6-10 bin measure (kuantil) dan hitung rerata + IK 95%.

    Dikotomus: interval Wilson untuk proporsi; politomus: rerata +/- t * SD / sqrt(n).
    Mengembalikan array (x_bin, y_mean, lo, hi, n).
    """
    n_obs = theta.size
    if n_bins is None:
        n_bins = int(np.clip(n_obs // 40, 6, 10))
    edges = np.unique(np.quantile(theta, np.linspace(0, 1, n_bins + 1)))
    idx = np.clip(np.searchsorted(edges, theta, side="right") - 1, 0, len(edges) - 2)
    out = []
    for b in range(len(edges) - 1):
        sel = idx == b
        n = int(sel.sum())
        if n == 0:
            continue
        xm = float(theta[sel].mean())
        ym = float(x[sel].mean())
        if dichotomous:
            z = 1.959964
            denom = 1 + z * z / n
            centre = (ym + z * z / (2 * n)) / denom
            half = z * np.sqrt(ym * (1 - ym) / n + z * z / (4 * n * n)) / denom
            lo, hi = centre - half, centre + half
        else:
            sd = float(x[sel].std(ddof=1)) if n > 1 else 0.0
            tcrit = stdtrit(max(n - 1, 1), 0.975)  # kuantil t 0,975
            half = tcrit * sd / np.sqrt(n) if n > 1 else 0.0
            lo, hi = ym - half, ym + half
        out.append((xm, ym, lo, hi, n))
    return np.array(out) if out else np.zeros((0, 5))


def _theta_grid(res, extra: np.ndarray | None = None, pad: float = 1.0, n: int = 400) -> np.ndarray:
    th = res.jmle.theta[np.isfinite(res.jmle.theta)]
    vals = [th.min(), th.max()]
    if extra is not None and extra.size:
        vals += [extra.min(), extra.max()]
    lo, hi = max(min(vals) - pad, -8), min(max(vals) + pad, 8)
    return np.linspace(lo, hi, n)


# ---------------------------------------------------------------------------
# 1. Wright Map
# ---------------------------------------------------------------------------
def wright_map(res):
    poly = res.model != "dichotomous"
    persons = res.persons
    pm = persons["measure"].to_numpy()
    pm = pm[np.isfinite(pm)]
    n_ext = int(persons["extreme"].sum())
    items = res.items[np.isfinite(res.items["measure"])].sort_values("measure")
    loc = res.jmle.threshold_location
    with st.styled():
        fig = st.new_figure(9.0, 6.6)
        ax_p, ax_i = fig.subplots(1, 2, sharey=True, gridspec_kw={"width_ratios": [1.0, 2.0 if poly else 1.6]})
        all_vals = [pm, items["measure"].to_numpy()]
        if poly:
            all_vals.append(loc[np.isfinite(loc)])
        lo = min(v.min() for v in all_vals if v.size) - 0.5
        hi = max(v.max() for v in all_vals if v.size) + 0.5
        width = max((hi - lo) / 36.0, 0.1)
        edges = np.arange(lo, hi + width, width)
        counts, _ = np.histogram(pm, edges)
        centres = (edges[:-1] + edges[1:]) / 2
        ax_p.barh(centres, counts, height=width * 0.82, color=st.PRIMARY, linewidth=0)
        ax_p.invert_xaxis()
        ax_p.set_xlabel("Number of persons")
        ax_p.set_ylabel("Measure (logit)")
        ax_p.axhline(np.mean(pm), color=st.INK_SECONDARY, linewidth=0.9)
        ax_p.text(ax_p.get_xlim()[0], np.mean(pm), " person mean", va="bottom", ha="left",
                  fontsize=8, color=st.INK_SECONDARY,
                  bbox={"facecolor": st.SURFACE, "edgecolor": "none", "alpha": 0.85, "pad": 1.0})
        ax_p.grid(axis="y", visible=False)
        st.titles(ax_p, "Wright Map", f"{_count(len(pm), 'person')} ({_count(n_ext, 'extreme score')}), "
                                      f"{_count(len(items), 'item')}")
        ax_i.axhline(0.0, color=st.INK_SECONDARY, linewidth=0.9)
        ax_i.grid(axis="x", visible=False)
        if not poly:
            ax_i.set_xlim(0, 1)
            ax_i.set_xticks([])
            ax_i.scatter(np.full(len(items), 0.03), items["measure"], marker="_", s=120,
                         color=st.INK, linewidths=1.4)
            # Label disusun per baris: item yang jaraknya lebih kecil dari tinggi satu
            # baris teks digabung ke baris sebelumnya, sehingga label tidak bertumpuk.
            min_gap = (hi - lo) * 11.0 / 400.0
            rows: list[list] = []
            for name, m in zip(items["item"], items["measure"]):
                if rows and m - rows[-1][0][1] < min_gap:
                    rows[-1].append((name, m))
                else:
                    rows.append([(name, m)])
            prev_y = -np.inf
            for members in rows:
                y = max(float(np.mean([m for _, m in members])), prev_y + min_gap)
                prev_y = y
                ax_i.plot([0.045, 0.065], [np.mean([m for _, m in members]), y], color=st.NEUTRAL, linewidth=0.8)
                ax_i.text(0.07, y, "  ".join(n for n, _ in members), va="center", ha="left",
                          fontsize=8, color=st.INK)
            ax_i.text(0.98, 0.0, "item mean = 0", va="bottom", ha="right", fontsize=8,
                      color=st.INK_SECONDARY)
            ax_i.set_xlabel("Items (easier below, harder above)")
        else:
            ei = _estimable_items(res)
            order = items["item"].tolist()
            m_max = int(res.coded.m.max())
            colors = st.category_colors(m_max)
            for x, name in enumerate(order):
                i = _item_index(res, name)
                row = loc[i]
                fin = row[np.isfinite(row)]
                if fin.size and ei[i]:
                    ax_i.vlines(x, fin.min(), fin.max(), color=st.NEUTRAL, linewidth=1.0, zorder=1)
                    for k, v in enumerate(row):
                        if np.isfinite(v):
                            ax_i.scatter(x, v, s=34, color=colors[k], edgecolors=st.SURFACE, linewidths=1.2,
                                         zorder=3)
                ax_i.scatter(x, res.items.loc[res.items["item"] == name, "measure"].iloc[0], marker="D", s=26,
                             color=st.INK, edgecolors=st.SURFACE, linewidths=1.0, zorder=4)
            ax_i.set_xticks(range(len(order)))
            ax_i.set_xticklabels(order, rotation=90 if len(order) > 10 else 0, fontsize=8)
            ax_i.set_xlim(-0.7, len(order) - 0.3)
            ax_i.set_xlabel("Items (ordered from easiest)")
            handles = [Line2D([], [], marker="D", linestyle="", color=st.INK, label="Item measure")]
            handles += [Line2D([], [], marker="o", linestyle="", color=colors[k], label=f"Threshold {k + 1}")
                        for k in range(m_max)]
            ax_i.legend(handles=handles, loc="upper left", ncols=len(handles) if len(handles) <= 6 else 4,
                        fontsize=7.5)
        ax_p.set_ylim(lo, hi)
    return fig


# ---------------------------------------------------------------------------
# 2. Item Characteristic Curve
# ---------------------------------------------------------------------------
def item_characteristic_curve(res, item: str):
    i = _item_index(res, item)
    dich = res.model == "dichotomous"
    delta = _row(res.jmle.delta[i])
    ep = res.coded.person_extreme == 0
    x = res.coded.X[ep, i]
    th = res.jmle.theta[ep]
    o = ~np.isnan(x)
    grid = _theta_grid(res, delta)
    P = category_probabilities(grid, delta[None, :])[:, 0, :]
    curve = P @ np.arange(P.shape[1])
    r = res.items.iloc[i]
    with st.styled():
        fig = st.new_figure(7.6, 4.8)
        ax = fig.subplots()
        ax.plot(grid, curve, color=st.PRIMARY, label="Model curve")
        bins = empirical_bins(th[o], x[o], dich) if o.sum() >= 12 else np.zeros((0, 5))
        if len(bins):
            yerr = np.vstack([bins[:, 1] - bins[:, 2], bins[:, 3] - bins[:, 1]])
            ax.errorbar(bins[:, 0], bins[:, 1], yerr=yerr, fmt="o", color=st.SECONDARY, markersize=6,
                        markeredgecolor=st.SURFACE, markeredgewidth=1.2, elinewidth=1.2, capsize=0,
                        label="Observed average per group (95% CI)", zorder=3)
        m = len(delta)
        if dich:
            ax.set_ylim(-0.03, 1.03)
            ax.set_ylabel("Probability of correct response")
        else:
            ax.set_ylim(-0.1, m + 0.1)
            ax.set_yticks(range(m + 1))
            ax.set_yticklabels(_labels(res, i))
            ax.set_ylabel("Expected score (category)")
        ax.set_xlabel("Person measure (logit)")
        ax.legend(loc="upper left")
        st.titles(ax, f"Item Characteristic Curve: {item}",
                  f"Measure {num(r['measure'])} logit · Infit MNSQ {num(r['infit_mnsq'])} · "
                  f"Outfit MNSQ {num(r['outfit_mnsq'])}")
    return fig


# ---------------------------------------------------------------------------
# 3. Category Probability Curves
# ---------------------------------------------------------------------------
def category_probability_curves(res, item: str):
    i = _item_index(res, item)
    loc = _row(res.jmle.threshold_location[i])
    tau = _row(np.nan_to_num(res.jmle.threshold[i], nan=np.inf))
    labels = _labels(res, i)
    grid = np.linspace(loc.min() - 3.0, loc.max() + 3.0, 400)
    P = category_probabilities(grid, loc[None, :])[:, 0, :]
    colors = st.category_colors(P.shape[1])
    disordered = [k for k in range(1, len(tau)) if tau[k] < tau[k - 1]]
    with st.styled():
        fig = st.new_figure(7.6, 4.8)
        ax = fig.subplots()
        for k in range(len(loc)):
            bad = k in disordered or (k + 1) in disordered
            ax.axvline(loc[k], color=st.PROBLEM if bad else st.INK_MUTED, linewidth=1.6 if bad else 0.8, zorder=1)
        for k in disordered:
            ax.axvspan(min(loc[k], loc[k - 1]), max(loc[k], loc[k - 1]), color=st.PROBLEM, alpha=0.08, zorder=0)
        for k in range(P.shape[1]):
            ax.plot(grid, P[:, k], color=colors[k], label=f"Category {labels[k]}", zorder=2)
            j = int(np.argmax(P[:, k]))
            ax.text(grid[j], P[j, k] + 0.025, labels[k], ha="center", va="bottom", fontsize=8.5, color=st.INK)
        ax.set_ylim(0, 1.08)
        ax.set_xlabel("Person measure (logit)")
        ax.set_ylabel("Category probability")
        handles, names_ = ax.get_legend_handles_labels()
        handles.append(Line2D([], [], color=st.INK_MUTED, linewidth=0.8))
        names_.append("Threshold")
        if disordered:
            handles.append(Line2D([], [], color=st.PROBLEM, linewidth=1.6))
            names_.append("Disordered threshold")
        ax.legend(handles, names_, loc="center left", bbox_to_anchor=(1.01, 0.5))
        sub = ("Disordered thresholds: at least one category is never the most probable response"
               if disordered else "Ordered thresholds")
        st.titles(ax, f"Category Probability Curves: {item}", sub)
    return fig


# ---------------------------------------------------------------------------
# 4. Expected Score Curve
# ---------------------------------------------------------------------------
def expected_score_curve(res, item: str):
    i = _item_index(res, item)
    loc = _row(res.jmle.threshold_location[i])
    labels = _labels(res, i)
    m = len(loc)
    grid = np.linspace(loc.min() - 3.5, loc.max() + 3.5, 800)
    P = category_probabilities(grid, loc[None, :])[:, 0, :]
    E = P @ np.arange(m + 1)
    half = np.interp(np.arange(m) + 0.5, E, grid)  # Rasch half-point thresholds
    bounds = np.concatenate([[grid[0]], half, [grid[-1]]])
    with st.styled():
        fig = st.new_figure(7.6, 4.8)
        ax = fig.subplots()
        for k in range(m + 1):
            if k % 2 == 0:
                ax.axvspan(bounds[k], bounds[k + 1], color=st.GRID, alpha=0.45, zorder=0, linewidth=0)
            ax.text((bounds[k] + bounds[k + 1]) / 2, m + 0.25, labels[k], ha="center", va="bottom",
                    fontsize=8.5, color=st.INK)
        for h in half:
            ax.axvline(h, color=st.INK_MUTED, linewidth=0.8, zorder=1)
        ax.plot(grid, E, color=st.PRIMARY, zorder=2)
        ax.set_ylim(-0.1, m + 0.6)
        ax.set_yticks(range(m + 1))
        ax.set_yticklabels(labels)
        ax.set_xlim(grid[0], grid[-1])
        ax.set_xlabel("Person measure (logit)")
        ax.set_ylabel("Expected score (category)")
        st.titles(ax, f"Expected Score Curve: {item}",
                  "Zones = measure ranges where the expected score is closest to each category")
    return fig


# ---------------------------------------------------------------------------
# 5. Test Information Function and SEM
# ---------------------------------------------------------------------------
def test_information(res):
    ei = _estimable_items(res)
    loc = res.jmle.threshold_location[ei]
    M = int(res.coded.m[ei].max())
    loc = loc[:, :M]
    grid = _theta_grid(res, loc[np.isfinite(loc)], pad=1.5)
    info = moments(grid, loc).W.sum(axis=1)
    sem = 1.0 / np.sqrt(info)
    j = int(np.argmax(info))
    with st.styled():
        fig = st.new_figure(7.6, 4.8)
        ax = fig.subplots()
        ax.plot(grid, info, color=st.PRIMARY, label="Test information (left axis)")
        ax.scatter([grid[j]], [info[j]], s=40, color=st.PRIMARY, edgecolors=st.SURFACE, linewidths=1.5, zorder=3)
        ax.annotate(f"max. {num(info[j], 1)} at {num(grid[j])} logit", (grid[j], info[j]),
                    textcoords="offset points", xytext=(8, 6), fontsize=8, color=st.INK)
        ax.set_ylim(0, info.max() * 1.15)
        ax.set_xlabel("Person measure (logit)")
        ax.set_ylabel("Test information")
        ax2 = ax.twinx()
        ax2.plot(grid, sem, color=st.SECONDARY, label="Standard error of measurement (right axis)")
        ax2.set_ylim(0, min(sem.max(), max(3.0, 3 * sem.min())) * 1.05)
        ax2.set_ylabel("Standard error of measurement, SEM (logit)")
        ax2.grid(False)
        ax2.spines["right"].set_visible(True)
        h1, l1 = ax.get_legend_handles_labels()
        h2, l2 = ax2.get_legend_handles_labels()
        ax.legend(h1 + h2, l1 + l2, loc="upper left")
        st.titles(ax, "Test Information Function and Standard Error of Measurement",
                  "SEM = 1 / √(test information); the higher the information, the smaller the SEM")
    return fig


# ---------------------------------------------------------------------------
# 6. Item Fit Bubble Chart
# ---------------------------------------------------------------------------
def fit_bubble(res):
    items = res.items[~res.items["extreme"]]
    lo, hi = res.settings["mnsq_range"]
    se = items["se"].to_numpy()
    size = 320 * (se / np.nanmax(se))  # luas gelembung sebanding dengan SE
    with st.styled():
        fig = st.new_figure(9.6, 4.8)
        axes = fig.subplots(1, 2, sharey=True)
        ymax = max(2.0, float(np.nanmax(items[["infit_mnsq", "outfit_mnsq"]].to_numpy())) * 1.12)
        for ax, key, label in zip(axes, ("infit_mnsq", "outfit_mnsq"), ("Infit MNSQ", "Outfit MNSQ")):
            y = items[key].to_numpy()
            bad = (y < lo) | (y > hi)
            ax.axhspan(lo, hi, color=st.GOOD_ZONE, alpha=0.10, linewidth=0, zorder=0)
            ax.axhline(1.0, color=st.INK_MUTED, linewidth=0.8, zorder=1)
            ax.scatter(items["measure"][~bad], y[~bad], s=size[~bad], color=st.PRIMARY, alpha=0.75,
                       edgecolors=st.SURFACE, linewidths=1.5, zorder=2)
            ax.scatter(items["measure"][bad], y[bad], s=size[bad], color=st.PROBLEM, alpha=0.85,
                       edgecolors=st.SURFACE, linewidths=1.5, zorder=3)
            for name, xv, yv in zip(items["item"][bad], items["measure"][bad], y[bad]):
                ax.annotate(name, (xv, yv), textcoords="offset points", xytext=(7, 4), fontsize=8, color=st.INK)
            ax.set_ylim(0, ymax)
            ax.set_xlabel("Item measure (logit)")
            ax.set_title(label, loc="left", fontsize=10, color=st.INK_SECONDARY)
        axes[0].set_ylabel("MNSQ")
        handles = [Line2D([], [], marker="o", linestyle="", color=st.PRIMARY, label="Within range"),
                   Line2D([], [], marker="o", linestyle="", color=st.PROBLEM, label="Outside range"),
                   Patch(color=st.GOOD_ZONE, alpha=0.25, label=f"Zone {num(lo, 1)}-{num(hi, 1)}"),
                   Line2D([], [], linestyle="", label="Bubble area proportional to SE")]
        fig.legend(handles=handles, loc="outside lower center", ncols=4)
        fig.suptitle("Item Fit Bubble Chart", x=0.01, ha="left", fontsize=12, fontweight="bold", color=st.INK)
    return fig


# ---------------------------------------------------------------------------
# 7. Person Fit Distribution
# ---------------------------------------------------------------------------
def person_fit_histogram(res):
    p = res.persons[~res.persons["extreme"] & res.persons["infit_mnsq"].notna()]
    lo, hi = res.settings["mnsq_range"]
    with st.styled():
        fig = st.new_figure(9.6, 4.6)
        axes = fig.subplots(1, 2, sharey=True)
        for ax, key, label in zip(axes, ("infit_mnsq", "outfit_mnsq"), ("Infit MNSQ", "Outfit MNSQ")):
            v = p[key].to_numpy()
            top = max(2.5, float(np.ceil(np.quantile(v, 0.99) * 2) / 2))
            edges = np.arange(0.0, top + 0.1, 0.1)
            counts, _ = np.histogram(np.clip(v, 0, top - 1e-9), edges)
            ax.axvspan(lo, hi, color=st.GOOD_ZONE, alpha=0.10, linewidth=0, zorder=0)
            ax.bar(edges[:-1], counts, width=0.1 * 0.82, align="edge", color=st.PRIMARY, linewidth=0, zorder=2)
            out = int(((v < lo) | (v > hi)).sum())
            ax.text(0.98, 0.95, f"{out} of {len(v)} outside {num(lo, 1)}-{num(hi, 1)}",
                    transform=ax.transAxes, ha="right", va="top", fontsize=8.5, color=st.INK)
            ax.set_xlabel(f"{label} (values >= {num(top, 1)} pooled in the last bar)")
            ax.set_title(label, loc="left", fontsize=10, color=st.INK_SECONDARY)
        axes[0].set_ylabel("Number of persons")
        fig.suptitle("Person Fit Distribution", x=0.01, ha="left", fontsize=12, fontweight="bold",
                     color=st.INK)
    return fig


# ---------------------------------------------------------------------------
# 8. PCA of Residuals: First Contrast
# ---------------------------------------------------------------------------
def pca_contrast(res):
    d = res.dimensionality
    load = d["loadings"]
    items = res.items.set_index("item").loc[load.index]
    x = items["measure"].to_numpy()
    y = load.to_numpy()
    pos = y >= 0
    order = np.argsort(y)
    show = set(load.index[order[:3]]) | set(load.index[order[-3:]])
    if len(load) <= 15:
        show = set(load.index)
    eig = d["first_contrast_eigenvalue"]
    with st.styled():
        fig = st.new_figure(7.6, 4.8)
        ax = fig.subplots()
        ax.axhline(0, color=st.INK_MUTED, linewidth=0.8)
        ax.scatter(x[pos], y[pos], s=46, color=st.PRIMARY, edgecolors=st.SURFACE, linewidths=1.5, label="Positive loading")
        ax.scatter(x[~pos], y[~pos], s=46, color=st.SECONDARY, edgecolors=st.SURFACE, linewidths=1.5,
                   label="Negative loading")
        for name, xv, yv in zip(load.index, x, y):
            if name in show:
                ax.annotate(name, (xv, yv), textcoords="offset points", xytext=(6, 3), fontsize=8, color=st.INK)
        ax.set_xlabel("Item measure (logit)")
        ax.set_ylabel("Loading on first contrast")
        ax.legend(loc="best")
        rel = "<" if eig < rules.CONTRAST_EIGENVALUE_MAX else ">="
        st.titles(ax, "PCA of Residuals: First Contrast",
                  f"Eigenvalue {num(eig)} ({rel} {num(rules.CONTRAST_EIGENVALUE_MAX, 1)}); "
                  f"raw variance explained by measures {num(d['variance_explained_pct'], 1)}%")
    return fig


# ---------------------------------------------------------------------------
# 9. DIF Plot
# ---------------------------------------------------------------------------
def dif_plot(res):
    dif = res.dif
    ga, gb = dif["group_a"].iloc[0], dif["group_b"].iloc[0]
    x = np.arange(len(dif))
    z = 1.959964
    with st.styled():
        fig = st.new_figure(max(7.6, 0.42 * len(dif) + 2.5), 4.8)
        ax = fig.subplots()
        for xi, flag in zip(x, dif["flag_dif"]):
            if flag:
                ax.axvspan(xi - 0.45, xi + 0.45, color=st.PROBLEM, alpha=0.10, linewidth=0, zorder=0)
        for off, key, se, color, label in ((-0.14, "measure_a", "se_a", st.PRIMARY, f"Group {ga}"),
                                           (0.14, "measure_b", "se_b", st.SECONDARY, f"Group {gb}")):
            ax.errorbar(x + off, dif[key], yerr=z * dif[se], fmt="o", color=color, markersize=6,
                        markeredgecolor=st.SURFACE, markeredgewidth=1.2, elinewidth=1.2, capsize=0, label=label,
                        zorder=2)
        ax.set_xticks(x)
        ax.set_xticklabels(dif["item"], rotation=90 if len(dif) > 12 else 0, fontsize=8)
        ax.set_xlim(-0.7, len(dif) - 0.3)
        ax.set_ylabel("Item measure (logit)")
        ax.grid(axis="x", visible=False)
        handles, labels = ax.get_legend_handles_labels()
        if dif["flag_dif"].any():
            handles.append(Patch(color=st.PROBLEM, alpha=0.25))
            labels.append("Flagged DIF")
        ax.legend(handles, labels, loc="upper left", ncols=3)
        st.titles(ax, "DIF Plot: Item Measure by Group", "Points = item measure per group; bars = 95% CI")
    return fig


# ---------------------------------------------------------------------------
# 10. Yen's Q3 Matrix
# ---------------------------------------------------------------------------
def q3_heatmap(res):
    q3 = res.q3
    Q = q3["matrix"].to_numpy().copy()
    names_ = list(q3["matrix"].columns)
    np.fill_diagonal(Q, np.nan)
    # Q3 bias negatif secara sistematis (sekitar -1/(L-1)), sehingga titik netral warna
    # diletakkan pada rata-rata Q3, sesuai aturan relatif Christensen dkk. (2017).
    centre = float(q3["mean"])
    span = max(0.3, float(np.nanmax(np.abs(Q - centre))))
    L = len(names_)
    size = min(9.0, 3.5 + 0.18 * L)
    with st.styled():
        fig = st.new_figure(size + 1.2, size)
        ax = fig.subplots()
        ax.grid(False)
        cmap = st.DIVERGING.with_extremes(bad=st.SURFACE)
        im = ax.imshow(Q, cmap=cmap, norm=TwoSlopeNorm(vmin=centre - span, vcenter=centre, vmax=centre + span),
                       interpolation="nearest")
        idx = {n: k for k, n in enumerate(names_)}
        for a, b in zip(q3["flagged_pairs"]["item_a"], q3["flagged_pairs"]["item_b"]):
            for r, c in ((idx[a], idx[b]), (idx[b], idx[a])):
                ax.add_patch(Rectangle((c - 0.5, r - 0.5), 1, 1, fill=False, edgecolor=st.INK, linewidth=1.4))
        step = 1 if L <= 40 else int(np.ceil(L / 40))
        ticks = list(range(0, L, step))
        ax.set_xticks(ticks)
        ax.set_yticks(ticks)
        ax.set_xticklabels([names_[t] for t in ticks], rotation=90, fontsize=7.5)
        ax.set_yticklabels([names_[t] for t in ticks], fontsize=7.5)
        for s in ax.spines.values():
            s.set_visible(False)
        cb = fig.colorbar(im, ax=ax, shrink=0.8)
        cb.set_label("Q3 (residual correlation); neutral colour = mean Q3", color=st.INK_SECONDARY)
        cb.outline.set_visible(False)
        st.titles(ax, "Yen's Q3 Matrix",
                  f"Mean Q3 {num(q3['mean'], 3)}; black boxes = Q3 > {num(q3['cutoff'], 3)} "
                  f"(mean + {num(rules.Q3_RELATIVE_CUTOFF, 1)})")
    return fig
