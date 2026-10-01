"""Impor, validasi, dan pengodean ulang data respons.

Tahap ini berjalan sebelum estimasi dan menghasilkan dua objek:

* :class:`PreparedData` berisi matriks nilai mentah yang sudah divalidasi
  (bilangan bulat, missing = NaN), deteksi jenis respons, dan rekomendasi
  model.
* :class:`CodedData` berisi kode kategori 0..m yang kontinu untuk model yang
  dipilih, penanda skor ekstrem, serta peringatan kategori.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import pandas as pd

from . import messages as msg

MODELS = ("dichotomous", "rsm", "pcm")


class DataValidationError(ValueError):
    """Data tidak dapat dianalisis; ``str(err)`` berisi pesan untuk pengguna."""

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.details = details or {}


@dataclass
class DataIssue:
    level: str  # "error" | "warning" | "info"
    code: str
    message: str
    details: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Membaca berkas
# ---------------------------------------------------------------------------
def read_table(path: str | Path, sheet: str | int = 0) -> pd.DataFrame:
    """Baca .xlsx atau .csv menjadi DataFrame bertipe object.

    Untuk CSV, pemisah ditebak dengan ``csv.Sniffer`` (koma, titik koma, tab).
    """
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in (".xlsx", ".xlsm"):
        return pd.read_excel(path, sheet_name=sheet, engine="openpyxl", dtype=object)
    if suffix in (".csv", ".txt"):
        with open(path, "r", encoding="utf-8-sig", newline="") as fh:
            sample = fh.read(65536)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            sep = dialect.delimiter
        except csv.Error:
            sep = ","
        return pd.read_csv(path, sep=sep, dtype=object, encoding="utf-8-sig",
                           keep_default_na=False)
    raise DataValidationError(msg.UNSUPPORTED_FILE.format(suffix=suffix or "(tanpa ekstensi)"))


# ---------------------------------------------------------------------------
# Validasi
# ---------------------------------------------------------------------------
@dataclass
class PreparedData:
    person_ids: np.ndarray
    item_names: list[str]
    raw: np.ndarray  # (N, L) float, nilai bulat mentah, NaN = missing
    groups: np.ndarray | None  # (N,) object, None = missing
    group_name: str | None
    response_type: str  # "dichotomous" | "polytomous"
    recommended_model: str
    recommendation_reason: str
    issues: list[DataIssue] = field(default_factory=list)
    excluded_items: list[str] = field(default_factory=list)
    excluded_persons: list = field(default_factory=list)

    @property
    def n_persons(self) -> int:
        return self.raw.shape[0]

    @property
    def n_items(self) -> int:
        return self.raw.shape[1]

    @property
    def dif_available(self) -> bool:
        return self.groups is not None


def _missing_tokens(missing_codes: Iterable) -> set[str]:
    tokens = {"", "na", "nan", "none", "null"}
    for code in missing_codes or ():
        s = str(code).strip().lower()
        if s:
            tokens.add(s)
            try:
                f = float(s)
                if f.is_integer():
                    tokens.add(str(int(f)))
            except ValueError:
                pass
    return tokens


def _cell_token(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if np.isnan(v):
            return ""
        if v.is_integer():
            return str(int(v))
    return str(v).strip().lower()


def prepare_data(
    df: pd.DataFrame,
    item_cols: Sequence[str],
    id_col: str | None = None,
    group_col: str | None = None,
    missing_codes: Iterable = (),
    max_error_examples: int = 5,
) -> PreparedData:
    """Validasi data dan susun matriks respons.

    Aturan: sel kosong dan kode missing menjadi NaN; nilai bukan bilangan
    bulat menghentikan proses dengan :class:`DataValidationError`; item tanpa
    variasi dikeluarkan dengan peringatan; person dengan missing > 50% diberi
    peringatan; person tanpa satu pun respons dikeluarkan.
    """
    item_cols = list(item_cols)
    if len(item_cols) < 2:
        raise DataValidationError(msg.TOO_FEW_ITEMS)
    missing_cols = [c for c in item_cols + [id_col, group_col] if c is not None and c not in df.columns]
    if missing_cols:
        raise DataValidationError(msg.COLUMN_NOT_FOUND.format(cols=", ".join(map(str, missing_cols))))
    if id_col is not None and id_col in item_cols:
        raise DataValidationError(msg.ID_IS_ITEM)
    if group_col is not None and group_col in item_cols:
        raise DataValidationError(msg.GROUP_IS_ITEM)

    tokens = _missing_tokens(missing_codes)
    sub = df[item_cols]
    N, L = sub.shape
    raw = np.full((N, L), np.nan)
    bad: list[tuple[int, str, str]] = []
    n_bad = 0
    values = sub.to_numpy(dtype=object)
    for j in range(L):
        col = values[:, j]
        for n in range(N):
            v = col[n]
            tok = _cell_token(v)
            if tok in tokens:
                continue
            try:
                f = float(str(v).strip().replace(",", ".")) if not isinstance(v, (int, float, np.integer, np.floating)) else float(v)
            except ValueError:
                f = np.nan
            if not np.isfinite(f) or not float(f).is_integer():
                n_bad += 1
                if len(bad) < max_error_examples:
                    bad.append((n + 2, str(item_cols[j]), str(v)))
                continue
            raw[n, j] = f
    if n_bad:
        examples = "; ".join(msg.BAD_VALUE_EXAMPLE.format(row=r, col=c, value=v) for r, c, v in bad)
        raise DataValidationError(
            msg.NON_INTEGER.format(n=n_bad, examples=examples),
            {"count": n_bad, "examples": bad},
        )

    issues: list[DataIssue] = []
    if id_col is not None:
        ids = np.array([_display_id(v, n) for n, v in enumerate(df[id_col].to_numpy(dtype=object))], dtype=object)
    else:
        ids = np.array([f"P{n + 1:04d}" for n in range(N)], dtype=object)

    # Item tanpa variasi
    item_names = [str(c) for c in item_cols]
    keep_items = []
    excluded_items = []
    for j in range(L):
        col = raw[:, j]
        obs = col[~np.isnan(col)]
        if obs.size == 0 or np.unique(obs).size < 2:
            excluded_items.append(item_names[j])
        else:
            keep_items.append(j)
    if excluded_items:
        issues.append(DataIssue("warning", "item_no_variance",
                                msg.ITEM_NO_VARIANCE.format(items=", ".join(excluded_items)),
                                {"items": excluded_items}))
    if len(keep_items) < 2:
        raise DataValidationError(msg.TOO_FEW_VALID_ITEMS)
    raw = raw[:, keep_items]
    item_names = [item_names[j] for j in keep_items]

    # Person tanpa respons dan person dengan missing > 50%
    n_obs = (~np.isnan(raw)).sum(axis=1)
    empty = n_obs == 0
    excluded_persons = list(ids[empty])
    if empty.any():
        issues.append(DataIssue("warning", "person_no_response",
                                msg.PERSON_NO_RESPONSE.format(n=int(empty.sum())),
                                {"persons": excluded_persons}))
    frac_missing = 1.0 - n_obs / raw.shape[1]
    heavy = (frac_missing > 0.5) & ~empty
    if heavy.any():
        listed = list(ids[heavy])
        issues.append(DataIssue("warning", "person_heavy_missing",
                                msg.PERSON_HEAVY_MISSING.format(n=int(heavy.sum()), examples=_examples(listed)),
                                {"persons": listed}))
    raw = raw[~empty]
    ids = ids[~empty]
    group_values = None
    if group_col is not None:
        g = df[group_col].to_numpy(dtype=object)[~empty]
        g = np.array([None if _cell_token(v) in tokens else str(v).strip() for v in g], dtype=object)
        levels = sorted({v for v in g if v is not None})
        if len(levels) != 2:
            issues.append(DataIssue("warning", "dif_group_levels",
                                    msg.DIF_GROUP_LEVELS.format(col=group_col, k=len(levels)),
                                    {"levels": levels}))
        else:
            group_values = g
            n_missing_group = int(sum(v is None for v in g))
            if n_missing_group:
                issues.append(DataIssue("info", "dif_group_missing",
                                        msg.DIF_GROUP_MISSING.format(n=n_missing_group)))

    response_type, rec, reason = _detect_model(raw, item_names)
    if response_type == "dichotomous":
        vals = np.unique(raw[~np.isnan(raw)])
        if not (vals[0] == 0 and vals[1] == 1):
            issues.append(DataIssue("info", "dichotomous_recode",
                                    msg.DICHOTOMOUS_RECODE.format(lo=int(vals[0]), hi=int(vals[1]))))

    return PreparedData(
        person_ids=ids,
        item_names=item_names,
        raw=raw,
        groups=group_values,
        group_name=group_col if group_values is not None else None,
        response_type=response_type,
        recommended_model=rec,
        recommendation_reason=reason,
        issues=issues,
        excluded_items=excluded_items,
        excluded_persons=excluded_persons,
    )


def _display_id(v, n: int) -> str:
    tok = _cell_token(v)
    if tok == "":
        return f"baris {n + 2}"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _examples(values: list, k: int = 5) -> str:
    shown = ", ".join(str(v) for v in values[:k])
    return shown + (" ..." if len(values) > k else "")


def _detect_model(raw: np.ndarray, item_names: list[str]) -> tuple[str, str, str]:
    obs = raw[~np.isnan(raw)]
    values = np.unique(obs)
    if values.size == 2:
        return "dichotomous", "dichotomous", msg.RECOMMEND_DICHOTOMOUS
    ranges = []
    for j in range(raw.shape[1]):
        col = raw[:, j]
        col = col[~np.isnan(col)]
        ranges.append((int(col.min()), int(col.max())))
    distinct = sorted(set(ranges))
    if len(distinct) == 1:
        lo, hi = distinct[0]
        return "polytomous", "rsm", msg.RECOMMEND_RSM.format(lo=lo, hi=hi)
    examples = []
    for lo, hi in distinct[:3]:
        names = [item_names[j] for j, r in enumerate(ranges) if r == (lo, hi)]
        examples.append(msg.RANGE_EXAMPLE.format(items=_examples(names, 3), lo=lo, hi=hi))
    return "polytomous", "pcm", msg.RECOMMEND_PCM.format(examples="; ".join(examples))


# ---------------------------------------------------------------------------
# Pengodean kategori untuk model tertentu
# ---------------------------------------------------------------------------
@dataclass
class CodedData:
    model: str
    person_ids: np.ndarray
    item_names: list[str]
    X: np.ndarray  # (N, L) kode 0..m_i, NaN = missing
    m: np.ndarray  # (L,) jumlah threshold per item
    category_labels: list[list[str]]  # label nilai mentah untuk tiap kode
    person_extreme: np.ndarray  # (N,) -1 minimum, +1 maksimum, 0 tidak
    item_extreme: np.ndarray  # (L,) -1, +1, 0; 2 = dikeluarkan (PCM)
    groups: np.ndarray | None
    issues: list[DataIssue] = field(default_factory=list)

    @property
    def obs(self) -> np.ndarray:
        return ~np.isnan(self.X)

    @property
    def M(self) -> int:
        return int(self.m.max())


def _code_global(raw: np.ndarray) -> tuple[np.ndarray, list[int]]:
    values = sorted(int(v) for v in np.unique(raw[~np.isnan(raw)]))
    lut = {v: k for k, v in enumerate(values)}
    X = np.full(raw.shape, np.nan)
    mask = ~np.isnan(raw)
    X[mask] = [lut[int(v)] for v in raw[mask]]
    return X, values


def category_issues(prep: PreparedData, model: str) -> list[DataIssue]:
    """Deteksi kategori yang tidak terpakai sebelum estimasi."""
    raw = prep.raw
    obs_vals = raw[~np.isnan(raw)]
    lo, hi = int(obs_vals.min()), int(obs_vals.max())
    issues: list[DataIssue] = []
    if model == "dichotomous":
        return issues
    all_values = set(int(v) for v in np.unique(obs_vals))
    gaps = [v for v in range(lo, hi + 1) if v not in all_values]
    if gaps:
        issues.append(DataIssue("warning", "unused_category_global",
                                msg.UNUSED_CATEGORY_GLOBAL.format(cats=", ".join(map(str, gaps)), lo=lo, hi=hi),
                                {"categories": gaps}))
    if model == "pcm":
        for j, name in enumerate(prep.item_names):
            col = raw[:, j]
            used = set(int(v) for v in np.unique(col[~np.isnan(col)]))
            unused = [v for v in sorted(all_values) if v not in used]
            if unused:
                issues.append(DataIssue("warning", "unused_category_item",
                                        msg.UNUSED_CATEGORY_ITEM.format(item=name, cats=", ".join(map(str, unused)),
                                                                        k=len(used)),
                                        {"item": name, "categories": unused}))
    elif model == "rsm":
        for j, name in enumerate(prep.item_names):
            col = raw[:, j]
            used = set(int(v) for v in np.unique(col[~np.isnan(col)]))
            unused = [v for v in sorted(all_values) if v not in used]
            if unused:
                issues.append(DataIssue("info", "unused_category_item_rsm",
                                        msg.UNUSED_CATEGORY_ITEM_RSM.format(item=name, cats=", ".join(map(str, unused))),
                                        {"item": name, "categories": unused}))
    return issues


def code_responses(prep: PreparedData, model: str) -> CodedData:
    """Kodekan respons menjadi 0..m kontinu dan tandai skor ekstrem.

    Dikotomus dan RSM: pengodean global (semua item berbagi kategori).
    PCM: pengodean per item, sehingga jumlah kategori boleh berbeda.
    Setelah person/item ekstrem disisihkan, kategori ujung yang kosong pada
    himpunan estimasi digabung ke kategori tetangganya (threshold-nya tidak
    dapat diestimasi), lalu deteksi ekstrem diulang.
    """
    if model not in MODELS:
        raise ValueError(f"model tidak dikenal: {model}")
    raw = prep.raw
    N, L = raw.shape
    issues = category_issues(prep, model)
    if model == "dichotomous" and prep.response_type != "dichotomous":
        raise DataValidationError(msg.NOT_DICHOTOMOUS)

    # label[i][k] = daftar nilai mentah yang menjadi kode k pada item i
    if model in ("dichotomous", "rsm"):
        X, values = _code_global(raw)
        labels = [[[v] for v in values] for _ in range(L)]
        m = np.full(L, len(values) - 1, dtype=int)
    else:
        X = np.full(raw.shape, np.nan)
        labels = []
        m = np.zeros(L, dtype=int)
        for j in range(L):
            Xj, values = _code_global(raw[:, [j]])
            X[:, j] = Xj[:, 0]
            labels.append([[v] for v in values])
            m[j] = len(values) - 1

    item_status = np.zeros(L, dtype=int)  # 2 = dikeluarkan dari analisis
    while True:
        p_ext, i_ext = _find_extremes(X, m, item_status)
        est_p = p_ext == 0
        est_i = i_ext == 0
        Xe = X[np.ix_(est_p, est_i)]
        changed = False
        if model == "rsm":
            counts = np.array([(Xe == k).sum() for k in range(int(m.max()) + 1)])
            new_codes = _collapse_map(counts)
            if new_codes is not None:
                merged = _merged_labels(labels[0], new_codes)
                issues.append(DataIssue("warning", "collapse_category",
                                        msg.COLLAPSE_RSM.format(cats=_label_text(merged)),
                                        {"labels": merged}))
                X = _apply_map(X, new_codes)
                labels = [merged for _ in range(L)]
                m[:] = len(merged) - 1
                changed = True
        elif model == "pcm":
            for c, j in enumerate(np.flatnonzero(est_i)):
                col = Xe[:, c]
                counts = np.array([(col == k).sum() for k in range(m[j] + 1)])
                new_codes = _collapse_map(counts)
                if new_codes is not None:
                    merged = _merged_labels(labels[j], new_codes)
                    issues.append(DataIssue("warning", "collapse_category",
                                            msg.COLLAPSE_PCM.format(item=prep.item_names[j], cats=_label_text(merged)),
                                            {"item": prep.item_names[j], "labels": merged}))
                    X[:, j] = _apply_map(X[:, [j]], new_codes)[:, 0]
                    labels[j] = merged
                    m[j] = len(merged) - 1
                    changed = True
            # Item PCM yang ekstrem pada himpunan estimasi tidak memberi informasi
            # tentang struktur kategorinya, sehingga dikeluarkan dari analisis.
            pcm_ext = np.flatnonzero(np.isin(i_ext, (-1, 1)) & (item_status != 2))
            if pcm_ext.size:
                names = [prep.item_names[j] for j in pcm_ext]
                issues.append(DataIssue("warning", "pcm_extreme_item",
                                        msg.PCM_EXTREME_ITEM.format(items=", ".join(names)), {"items": names}))
                item_status[pcm_ext] = 2
                changed = True
        if not changed:
            break

    item_extreme = i_ext
    unest_items = [prep.item_names[j] for j in np.flatnonzero((i_ext == 2) & (item_status != 2))]
    if unest_items:
        issues.append(DataIssue("warning", "item_not_estimable",
                                msg.ITEM_NOT_ESTIMABLE.format(items=", ".join(unest_items)), {"items": unest_items}))
    n_ext_p = int(np.isin(p_ext, (-1, 1)).sum())
    if n_ext_p:
        issues.append(DataIssue("info", "extreme_persons",
                                msg.EXTREME_PERSONS.format(n=n_ext_p, n_min=int((p_ext == -1).sum()),
                                                           n_max=int((p_ext == 1).sum()))))
    unest_p = list(prep.person_ids[p_ext == 2])
    if unest_p:
        issues.append(DataIssue("warning", "person_not_estimable",
                                msg.PERSON_NOT_ESTIMABLE.format(n=len(unest_p), examples=_examples(unest_p)),
                                {"persons": unest_p}))
    ext_items = [prep.item_names[j] for j in np.flatnonzero(np.isin(item_extreme, (-1, 1)))]
    if ext_items:
        issues.append(DataIssue("warning", "extreme_items",
                                msg.EXTREME_ITEMS.format(items=", ".join(ext_items)), {"items": ext_items}))
    if (p_ext == 0).sum() < 2 or (item_extreme == 0).sum() < 2:
        raise DataValidationError(msg.TOO_FEW_NONEXTREME)

    str_labels = [["+".join(str(v) for v in grp) for grp in item_labels] for item_labels in labels]
    return CodedData(
        model=model,
        person_ids=prep.person_ids,
        item_names=list(prep.item_names),
        X=X,
        m=m.copy(),
        category_labels=str_labels,
        person_extreme=p_ext,
        item_extreme=item_extreme,
        groups=prep.groups,
        issues=issues,
    )


def _find_extremes(X: np.ndarray, m: np.ndarray, item_status: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Identifikasi iteratif person dan item dengan skor ekstrem.

    Status: 0 = ikut estimasi, -1 = skor minimum, +1 = skor maksimum,
    2 = tidak memiliki respons pada himpunan estimasi (tidak dapat diestimasi).
    Status hanya berubah dari 0 ke nilai lain, sehingga iterasi pasti berhenti.
    """
    N, L = X.shape
    obs = ~np.isnan(X)
    X0 = np.where(obs, X, 0.0)
    p_ext = np.zeros(N, dtype=int)
    i_ext = np.where(item_status == 2, 2, 0)

    def classify(score, maxs, cnt):
        return np.where(cnt == 0, 2, np.where(score == 0, -1, np.where(score == maxs, 1, 0)))

    while True:
        ai = i_ext == 0
        o = obs[:, ai]
        new_p = classify(X0[:, ai].sum(axis=1), (o * m[ai][None, :]).sum(axis=1), o.sum(axis=1))
        new_p = np.where(p_ext == 0, new_p, p_ext)
        ap = new_p == 0
        o = obs[ap]
        cnt_i = o.sum(axis=0)
        new_i = classify(X0[ap].sum(axis=0), cnt_i * m, cnt_i)
        new_i = np.where(i_ext == 0, new_i, i_ext)
        if np.array_equal(new_p, p_ext) and np.array_equal(new_i, i_ext):
            return p_ext, i_ext
        p_ext, i_ext = new_p, new_i


def _collapse_map(counts: np.ndarray) -> np.ndarray | None:
    """Peta kode lama -> kode baru yang menghapus kategori berfrekuensi nol."""
    if (counts > 0).all():
        return None
    keep = counts > 0
    if keep.sum() < 2:
        return None
    new = np.cumsum(keep) - 1
    return np.maximum(new, 0)


def _merged_labels(old: list[list[int]], new_codes: np.ndarray) -> list[list[int]]:
    out: list[list[int]] = [[] for _ in range(int(new_codes.max()) + 1)]
    for k, grp in enumerate(old):
        out[int(new_codes[k])].extend(grp)
    return out


def _apply_map(X: np.ndarray, new_codes: np.ndarray) -> np.ndarray:
    out = X.copy()
    mask = ~np.isnan(X)
    out[mask] = new_codes[X[mask].astype(int)]
    return out


def _label_text(labels: list[list[int]]) -> str:
    return ", ".join("+".join(str(v) for v in grp) for grp in labels)
