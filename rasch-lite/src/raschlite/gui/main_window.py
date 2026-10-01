"""Jendela utama: wizard empat langkah dengan navigasi Kembali/Lanjut."""

from __future__ import annotations

from PySide6.QtWidgets import QHBoxLayout, QMainWindow, QPushButton, QStackedWidget, QVBoxLayout, QWidget

from . import strings as S
from .pages import ImportPage, ModelPage, ResultsPage, RunPage
from .widgets import StepIndicator

IMPORT, MODEL, RUN, RESULTS = range(4)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(S.APP_TITLE)
        self.resize(1200, 820)
        self.steps = StepIndicator(S.STEPS)
        self.stack = QStackedWidget()
        self.import_page = ImportPage()
        self.model_page = ModelPage()
        self.run_page = RunPage()
        self.results_page: ResultsPage | None = None
        self.results_holder = QWidget()
        QVBoxLayout(self.results_holder).setContentsMargins(0, 0, 0, 0)
        for page in (self.import_page, self.model_page, self.run_page, self.results_holder):
            self.stack.addWidget(page)
        self.btn_back = QPushButton(S.BTN_BACK)
        self.btn_next = QPushButton(S.BTN_NEXT)
        self.btn_next.setDefault(True)
        nav = QHBoxLayout()
        nav.addWidget(self.btn_back)
        nav.addStretch()
        nav.addWidget(self.btn_next)
        central = QWidget()
        lay = QVBoxLayout(central)
        lay.addWidget(self.steps)
        lay.addWidget(self.stack, 1)
        lay.addLayout(nav)
        self.setCentralWidget(central)
        self.btn_back.clicked.connect(self.go_back)
        self.btn_next.clicked.connect(self.go_next)
        self.run_page.done.connect(self._on_done)
        self.run_page.stopped.connect(self._update_nav)
        self._update_nav()

    # --- navigasi -------------------------------------------------------------
    def current(self) -> int:
        return self.stack.currentIndex()

    def _show(self, index: int) -> None:
        self.stack.setCurrentIndex(index)
        self.steps.set_current(index)
        self._update_nav()

    def _update_nav(self) -> None:
        idx = self.current()
        running = self.run_page.running
        self.btn_back.setEnabled(idx in (MODEL, RESULTS) or (idx == RUN and not running))
        self.btn_next.setEnabled(not (idx == RUN))
        self.btn_next.setText({MODEL: S.BTN_RUN, RESULTS: S.BTN_NEW}.get(idx, S.BTN_NEXT))

    def go_next(self) -> None:
        idx = self.current()
        if idx == IMPORT:
            prep = self.import_page.validate()
            if prep is not None:
                self.model_page.set_data(prep)
                self._show(MODEL)
        elif idx == MODEL:
            self._show(RUN)
            self.run_page.start(self.import_page.prep, self.model_page.selected_model(),
                                self.model_page.strict.isChecked(), self.model_page.dif.isChecked())
            self._update_nav()
        elif idx == RESULTS:
            self._show(IMPORT)

    def go_back(self) -> None:
        idx = self.current()
        if idx == MODEL:
            self._show(IMPORT)
        elif idx in (RUN, RESULTS) and not self.run_page.running:
            self._show(MODEL)

    def _on_done(self, res, interp) -> None:
        layout = self.results_holder.layout()
        if self.results_page is not None:
            layout.removeWidget(self.results_page)
            self.results_page.deleteLater()
        self.results_page = ResultsPage(res, interp)
        layout.addWidget(self.results_page)
        self._show(RESULTS)

    def closeEvent(self, event) -> None:
        if self.run_page.running:
            self.run_page.cancel()
            self.run_page.wait(5000)
        super().closeEvent(event)
