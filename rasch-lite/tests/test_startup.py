"""Titik masuk aplikasi: opsi verifikasi build dan startup yang ringan.

Jendela utama harus dapat tampil tanpa memuat matplotlib dan scipy.stats (keduanya baru
diperlukan ketika hasil ditampilkan), karena kedua pustaka itu menyumbang sebagian besar
waktu impor dan menentukan target cold start < 4 detik.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[1] / "src"


def _env():
    env = dict(os.environ)
    env["PYTHONPATH"] = str(SRC) + os.pathsep + env.get("PYTHONPATH", "")
    env.setdefault("QT_QPA_PLATFORM", "offscreen")
    return env


def test_main_window_import_does_not_load_matplotlib_or_scipy_stats():
    code = ("import sys; import raschlite.gui.main_window; "
            "print(sorted({m.split('.')[0] for m in sys.modules if m.startswith('matplotlib')}), "
            "'scipy.stats' in sys.modules)")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=_env(), timeout=120)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "[] False", out.stdout


def test_startup_check_opens_window_and_reports_time(tmp_path):
    pytest.importorskip("PySide6.QtWidgets", exc_type=ImportError)
    target = tmp_path / "startup.txt"
    proc = subprocess.run([sys.executable, "-m", "raschlite", "--startup-check", str(target)],
                          capture_output=True, text=True, env=_env(), timeout=120)
    assert proc.returncode == 0, proc.stderr
    text = target.read_text(encoding="utf-8").strip()
    assert text.startswith("window_shown_seconds=")
    assert 0.0 < float(text.split("=", 1)[1]) < 4.0


def test_cli_options_require_a_path():
    from raschlite.gui.app import _option

    assert _option(["--self-test", "folder"], "--self-test") == "folder"
    assert _option([], "--self-test") is None
    with pytest.raises(SystemExit):
        _option(["--self-test"], "--self-test")
    with pytest.raises(SystemExit):
        _option(["--startup-check", "--self-test", "x"], "--startup-check")
