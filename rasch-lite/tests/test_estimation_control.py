"""Kontrol estimasi: peringatan tidak konvergen, pembatalan, progress, isolasi dari Qt."""

import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from raschlite.core.analysis import run_analysis
from raschlite.core.data import prepare_data
from raschlite.core.jmle import EstimationCancelled
from raschlite.core.simulate import simulate_dichotomous

SRC = Path(__file__).resolve().parents[1] / "src"


@pytest.fixture
def prep():
    rng = np.random.default_rng(21)
    X = simulate_dichotomous(rng.normal(0, 1, 300), rng.uniform(-2, 2, 15), rng)
    df = pd.DataFrame(X, columns=[f"I{j}" for j in range(15)])
    return prepare_data(df, list(df.columns))


def test_non_convergence_produces_explicit_warning(prep):
    res = run_analysis(prep, "dichotomous", max_iter=1)
    assert not res.converged
    warn = [i for i in res.issues if i.code == "not_converged"]
    assert warn and warn[0].level == "warning" and "TIDAK konvergen" in warn[0].message


def test_cancel_raises(prep):
    calls = {"n": 0}

    def cancel():
        calls["n"] += 1
        return calls["n"] > 1

    with pytest.raises(EstimationCancelled):
        run_analysis(prep, "dichotomous", should_cancel=cancel)


def test_progress_callback_reports_each_iteration(prep):
    seen = []
    res = run_analysis(prep, "dichotomous", progress=lambda it, ch, rs: seen.append((it, ch, rs)))
    assert [s[0] for s in seen] == list(range(1, res.summary["iterations"] + 1))
    assert seen[-1][1] < 0.001 and seen[-1][2] < 0.01


def test_core_does_not_import_qt():
    code = (
        "import sys; sys.path.insert(0, %r);"
        "import raschlite.core.analysis, raschlite.core.simulate;"
        "bad = [m for m in sys.modules if m.split('.')[0] in ('PySide6', 'PyQt5', 'PyQt6', 'shiboken6')];"
        "print(bad); sys.exit(1 if bad else 0)"
    ) % str(SRC)
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
