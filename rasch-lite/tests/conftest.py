"""Konfigurasi pytest: path sumber, helper simulasi, dan tabel recovery."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from raschlite.core.analysis import run_analysis  # noqa: E402
from raschlite.core.data import prepare_data  # noqa: E402
from raschlite.core.simulate import to_frame  # noqa: E402

_RECOVERY_ROWS: list[dict] = []


@pytest.fixture
def analyze():
    """Jalankan analisis lengkap untuk matriks respons hasil simulasi."""

    def _run(X, model, groups=None, **kwargs):
        df = to_frame(X, groups=groups)
        items = [c for c in df.columns if c not in ("ID", "Grup")]
        prep = prepare_data(df, items, id_col="ID", group_col="Grup" if groups is not None else None)
        return run_analysis(prep, model, **kwargs)

    return _run


@pytest.fixture
def record():
    """Catat baris tabel recovery yang dicetak di akhir sesi pytest."""

    def _rec(**row):
        _RECOVERY_ROWS.append(row)

    return _rec


def pytest_terminal_summary(terminalreporter):
    if not _RECOVERY_ROWS:
        return
    tr = terminalreporter
    tr.write_sep("=", "TABEL RECOVERY DAN DETEKSI (nilai aktual dari tes)")
    for row in _RECOVERY_ROWS:
        parts = []
        for k, v in row.items():
            if isinstance(v, (float, np.floating)):
                parts.append(f"{k}={v:.4f}")
            else:
                parts.append(f"{k}={v}")
        tr.write_line(" | ".join(parts))
