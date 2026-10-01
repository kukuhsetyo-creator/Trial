"""Bahan bersama untuk GUI dan laporan: format angka, kolom tabel, metadata.

Modul ini murni Python (tanpa Qt).
"""

from __future__ import annotations

import base64
import io
import math
from datetime import datetime

import numpy as np
import pandas as pd

from .. import APP_NAME, __version__
from ..gui import strings as S
from ..interpret.narrative import num, pct

#: Kolom yang ditampilkan untuk setiap tabel (urutan tampilan).
TABLE_COLUMNS = {
    "items": ["item", "status", "n_categories", "score", "count", "measure", "se", "infit_mnsq", "infit_zstd",
              "outfit_mnsq", "outfit_zstd", "ptmea_obs", "ptmea_exp", "flag_misfit", "flag_negative_ptmea"],
    "persons": ["person", "group", "status", "score", "max_score", "count", "measure", "se", "infit_mnsq",
                "infit_zstd", "outfit_mnsq", "outfit_zstd", "flag_misfit"],
    "categories": ["item", "label", "count", "percent", "avg_measure", "outfit_mnsq", "outfit_expected", "outfit_z",
                   "threshold", "threshold_se", "threshold_location", "flag_low_count",
                   "flag_disordered_threshold", "flag_disordered_avg", "flag_outfit_high"],
    "dif": ["item", "measure_a", "se_a", "n_a", "measure_b", "se_b", "n_b", "contrast", "joint_se", "t", "df", "p",
            "ets_category", "flag_dif"],
    "loadings": ["item", "measure", "loading"],
    "q3_pairs": ["item_a", "item_b", "q3", "q3_relative"],
}
CATEGORY_FLAGS = ["flag_low_count", "flag_disordered_threshold", "flag_disordered_avg", "flag_outfit_high"]
DECIMALS = {"score": 0, "max_score": 0, "count": 0, "n_a": 0, "n_b": 0, "df": 0, "percent": 1, "p": 4,
            "q3": 3, "q3_relative": 3}


def fmt_value(v, decimals: int = 2) -> str:
    """Format satu sel untuk tampilan: koma desimal, boolean 'Ya'/kosong, NaN kosong."""
    if v is None:
        return ""
    if isinstance(v, (bool, np.bool_)):
        return S.YES if v else ""
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, (float, np.floating)):
        if not math.isfinite(float(v)):
            return ""
        return f"{float(v):.{decimals}f}".replace(".", ",")
    return str(v)


def column_label(key: str) -> str:
    return S.COLUMNS.get(key, key)


def table_frame(res, key: str) -> tuple[pd.DataFrame | None, list[str], np.ndarray, np.ndarray]:
    """DataFrame, kolom, penanda baris bermasalah, dan penanda baris redup untuk tabel ``key``."""
    if key == "items":
        df = res.items
        cols = [c for c in TABLE_COLUMNS["items"] if c != "n_categories" or res.model != "dichotomous"]
        return df, cols, (df["flag_misfit"] | df["flag_negative_ptmea"]).to_numpy(), df["extreme"].to_numpy()
    if key == "persons":
        df = res.persons
        cols = [c for c in TABLE_COLUMNS["persons"] if c in df.columns]
        return df, cols, df["flag_misfit"].to_numpy(), (df["extreme"] | df["measure"].isna()).to_numpy()
    if key == "categories":
        df = res.categories
        if df is None:
            return None, [], np.zeros(0, bool), np.zeros(0, bool)
        return df, TABLE_COLUMNS["categories"], df[CATEGORY_FLAGS].any(axis=1).to_numpy(), np.zeros(len(df), bool)
    if key == "dif":
        df = res.dif
        if df is None:
            return None, [], np.zeros(0, bool), np.zeros(0, bool)
        return df, TABLE_COLUMNS["dif"], df["flag_dif"].to_numpy(), np.zeros(len(df), bool)
    if key == "loadings":
        load = res.dimensionality["loadings"].rename("loading").reset_index().rename(columns={"index": "item"})
        df = load.merge(res.items[["item", "measure"]], on="item").sort_values("loading", ascending=False)
        return df.reset_index(drop=True), TABLE_COLUMNS["loadings"], np.zeros(len(df), bool), np.zeros(len(df), bool)
    if key == "q3_pairs":
        df = res.q3["flagged_pairs"]
        return df, TABLE_COLUMNS["q3_pairs"], np.ones(len(df), bool), np.zeros(len(df), bool)
    raise KeyError(key)


def dif_labels(res) -> dict[str, str]:
    """Label kolom DIF yang memuat nama grup sebenarnya."""
    if res.dif is None:
        return {}
    ga, gb = res.dif["group_a"].iloc[0], res.dif["group_b"].iloc[0]
    return {"measure_a": f"Measure {ga}", "se_a": f"SE {ga}", "n_a": f"n {ga}",
            "measure_b": f"Measure {gb}", "se_b": f"SE {gb}", "n_b": f"n {gb}"}


def display_table(res, key: str, only_flagged: bool = False) -> dict | None:
    """Tabel siap tampil (string terformat) untuk HTML/PDF."""
    df, cols, flag, muted = table_frame(res, key)
    if df is None:
        return None
    labels = {**{c: column_label(c) for c in cols}, **dif_labels(res)}
    values = df[cols].to_numpy(dtype=object)
    rows = []
    for r in range(len(df)):
        if only_flagged and not flag[r]:
            continue
        rows.append({"cells": [fmt_value(values[r, c], DECIMALS.get(cols[c], 2)) for c in range(len(cols))],
                     "flag": bool(flag[r]), "muted": bool(muted[r]),
                     "numeric": [isinstance(values[r, c], (int, float, np.integer, np.floating))
                                 and not isinstance(values[r, c], (bool, np.bool_)) for c in range(len(cols))]})
    return {"key": key, "title": S.TABLE_TITLES.get(key, key), "headers": [labels[c] for c in cols], "rows": rows}


def flagged_items(res) -> list[str]:
    """Item yang perlu diperiksa: misfit, PTMEA negatif, kategori bermasalah, atau DIF."""
    names = set(res.items.loc[res.items["flag_misfit"] | res.items["flag_negative_ptmea"], "item"])
    if res.categories is not None and res.model == "pcm":
        cat = res.categories
        names |= set(cat.loc[cat[CATEGORY_FLAGS].any(axis=1), "item"])
    if res.dif is not None:
        names |= set(res.dif.loc[res.dif["flag_dif"], "item"])
    order = res.coded.item_names
    return sorted((n for n in names if n in order), key=order.index)


def metadata(res, source_name: str = "") -> list[tuple[str, str]]:
    s = res.summary
    st = res.settings
    m = S.REPORT_META_ROWS
    conv = (S.CONVERGED_OK if res.converged else S.CONVERGED_NO).format(n=s["iterations"])
    lo, hi = st["mnsq_range"]
    rows = [
        (m["source"], source_name or "-"),
        (m["model"], S.MODEL_LABELS[res.model]),
        (m["persons"], f"{s['n_persons_estimated']} / {s['n_persons_extreme']} (total {s['n_persons']})"),
        (m["items"], f"{s['n_items_estimated']} / {s['n_items_extreme']} (total {s['n_items']})"),
        (m["missing"], pct(s["missing_pct"], 1)),
        (m["convergence"], conv),
        (m["criteria"], f"max logit change < {num(st['conv_change'], 3)} dan max score residual "
                        f"< {num(st['conv_resid'], 2)}"),
        (m["fit_range"], f"{num(lo, 1)}-{num(hi, 1)}" + (" (mode ketat)" if st["strict_fit"] else "")),
        (m["bias"], num(st["bias_factor"], 4)),
        (m["dif"], "dianalisis" if res.dif is not None else "tidak dianalisis"),
    ]
    return rows


def generated_line() -> str:
    return S.REPORT_SUBTITLE.format(app=APP_NAME, version=__version__,
                                    when=datetime.now().strftime("%d-%m-%Y %H:%M"))


def figure_bytes(fig, fmt: str, dpi: int = 150) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, dpi=dpi if fmt == "png" else None, facecolor="white")
    return buf.getvalue()


def data_uri(data: bytes, fmt: str) -> str:
    mime = "image/svg+xml" if fmt == "svg" else "image/png"
    return f"data:{mime};base64," + base64.b64encode(data).decode("ascii")
