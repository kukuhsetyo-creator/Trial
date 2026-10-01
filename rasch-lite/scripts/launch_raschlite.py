"""Skrip masuk PyInstaller untuk RaschLite (setara dengan ``python -m raschlite``).

Waktu mulai dicatat sebelum impor apa pun agar ``--startup-check`` mengukur waktu
sampai jendela utama tampil, termasuk pemuatan pustaka.
"""

import time

_T0 = time.perf_counter()

import sys  # noqa: E402

from raschlite.gui.app import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(t0=_T0))
