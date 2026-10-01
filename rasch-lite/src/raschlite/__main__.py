"""Jalankan RaschLite: ``python -m raschlite`` (juga skrip masuk build PyInstaller).

Argumen opsional untuk verifikasi build: ``--self-test <folder>`` dan
``--startup-check <berkas>`` (lihat :func:`raschlite.gui.app.main`).
"""

import time

_T0 = time.perf_counter()

import sys  # noqa: E402

from raschlite.gui.app import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(t0=_T0))
