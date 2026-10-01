"""Titik masuk aplikasi GUI.

Argumen baris perintah (dipakai untuk memverifikasi build; executable Windows tidak
memiliki konsol sehingga hasil ditulis ke berkas dan dinyatakan lewat kode keluar):

``--self-test <folder>``
    Jalankan :func:`raschlite.selftest.run_self_test` tanpa membuka jendela.
``--startup-check <berkas>``
    Buka jendela utama, catat waktu sampai jendela tampil ke ``<berkas>``, lalu keluar.
"""

from __future__ import annotations

import sys
import time


def _option(argv: list[str], name: str) -> str | None:
    if name not in argv:
        return None
    i = argv.index(name)
    if i + 1 >= len(argv) or argv[i + 1].startswith("--"):
        raise SystemExit(f"{name} memerlukan argumen path")
    return argv[i + 1]


def main(argv: list[str] | None = None, t0: float | None = None) -> int:
    t0 = time.perf_counter() if t0 is None else t0
    argv = list(sys.argv[1:] if argv is None else argv)
    self_test = _option(argv, "--self-test")
    if self_test is not None:
        from ..selftest import run_self_test

        return run_self_test(self_test)
    startup_file = _option(argv, "--startup-check")

    from PySide6.QtCore import QTimer
    from PySide6.QtGui import QFont, QFontDatabase
    from PySide6.QtWidgets import QApplication

    from . import strings as S
    from .main_window import MainWindow

    app = QApplication.instance() or QApplication(sys.argv[:1])
    app.setApplicationName(S.APP_TITLE)
    from PySide6.QtGui import QIcon

    from ..resources import ICON_PATH

    if ICON_PATH.exists():
        app.setWindowIcon(QIcon(str(ICON_PATH)))
    families = set(QFontDatabase.families())
    for name in ("Segoe UI", "DejaVu Sans"):
        if name in families:
            app.setFont(QFont(name, 9))
            break
    window = MainWindow()
    window.show()
    if startup_file is not None:
        def report() -> None:
            from pathlib import Path

            Path(startup_file).write_text(f"window_shown_seconds={time.perf_counter() - t0:.3f}\n",
                                          encoding="utf-8")
            window.close()
            app.quit()

        QTimer.singleShot(0, report)
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
