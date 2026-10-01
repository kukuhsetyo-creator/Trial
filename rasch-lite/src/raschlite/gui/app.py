"""Titik masuk aplikasi GUI."""

from __future__ import annotations

import sys


def main() -> int:
    from PySide6.QtGui import QFont, QFontDatabase
    from PySide6.QtWidgets import QApplication

    from . import strings as S
    from .main_window import MainWindow

    app = QApplication.instance() or QApplication(sys.argv)
    app.setApplicationName(S.APP_TITLE)
    families = set(QFontDatabase.families())
    for name in ("Segoe UI", "DejaVu Sans"):
        if name in families:
            app.setFont(QFont(name, 9))
            break
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
