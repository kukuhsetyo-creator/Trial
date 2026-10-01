"""Menjalankan analisis di QThread terpisah dengan progres dan pembatalan."""

from __future__ import annotations

import math
import time

from PySide6.QtCore import QObject, QThread, Signal, Slot

from ..core.analysis import run_analysis
from ..core.jmle import EstimationCancelled
from ..interpret import interpret


def progress_fraction(first: float, current: float) -> float:
    """Perkiraan kemajuan konvergensi 0..0,95 dari skor jarak ke kriteria (log)."""
    if current <= 1.0:
        return 0.95
    if first <= current or first <= 1.0:
        return 0.02
    return max(0.02, min(0.95, 0.95 * math.log(first / current) / math.log(first)))


class AnalysisWorker(QObject):
    progress = Signal(int, float, float, float)  # iterasi, perubahan, residual, fraksi 0..1
    finished = Signal(object, object, float)  # hasil, interpretasi, detik
    failed = Signal(str)
    cancelled = Signal()

    def __init__(self, prep, model: str, strict_fit: bool, run_dif: bool, conv_change: float = 0.001,
                 conv_resid: float = 0.01):
        super().__init__()
        self.prep, self.model = prep, model
        self.strict_fit, self.run_dif = strict_fit, run_dif
        self.conv_change, self.conv_resid = conv_change, conv_resid
        self._cancel = False
        self._first = None

    def cancel(self) -> None:
        self._cancel = True

    def _on_progress(self, it: int, change: float, resid: float) -> None:
        score = max(change / self.conv_change, resid / self.conv_resid)
        if self._first is None:
            self._first = max(score, 1.0001)
        self.progress.emit(it, change, resid, progress_fraction(self._first, score))

    @Slot()
    def run(self) -> None:
        t0 = time.perf_counter()
        try:
            res = run_analysis(self.prep, self.model, strict_fit=self.strict_fit, run_dif=self.run_dif,
                               conv_change=self.conv_change, conv_resid=self.conv_resid,
                               progress=self._on_progress, should_cancel=lambda: self._cancel)
            interp = interpret(res)
        except EstimationCancelled:
            self.cancelled.emit()
            return
        except Exception as exc:  # pesan galat ditampilkan di GUI, bukan diam-diam
            self.failed.emit(f"{type(exc).__name__}: {exc}")
            return
        self.finished.emit(res, interp, time.perf_counter() - t0)


def start_worker(worker: AnalysisWorker, parent: QObject) -> QThread:
    thread = QThread(parent)
    worker.moveToThread(thread)
    thread.started.connect(worker.run)
    for sig in (worker.finished, worker.failed, worker.cancelled):
        sig.connect(thread.quit)
    thread.finished.connect(worker.deleteLater)
    thread.start()
    return thread


class ExportWorker(QObject):
    """Menjalankan :func:`raschlite.report.export_all` di thread terpisah."""

    progress = Signal(int, int, str)
    finished = Signal(object)
    failed = Signal(str)
    cancelled = Signal()

    def __init__(self, res, interp, folder, source_name: str = ""):
        super().__init__()
        self.res, self.interp, self.folder, self.source_name = res, interp, folder, source_name
        self._cancel = False

    def cancel(self) -> None:
        self._cancel = True

    @Slot()
    def run(self) -> None:
        from ..report.export import ExportCancelled, export_all

        try:
            written = export_all(self.res, self.interp, self.folder, self.source_name,
                                 progress=lambda k, n, msg: self.progress.emit(k, n, msg),
                                 should_cancel=lambda: self._cancel)
        except ExportCancelled:
            self.cancelled.emit()
            return
        except Exception as exc:
            self.failed.emit(f"{type(exc).__name__}: {exc}")
            return
        self.finished.emit(written)
