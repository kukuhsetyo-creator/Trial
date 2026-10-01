"""Halaman wizard (Impor, Model, Jalankan) dan panel Hasil."""

from __future__ import annotations

import html
from pathlib import Path

import numpy as np
import pandas as pd
from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QPlainTextEdit,
    QProgressBar,
    QPushButton,
    QRadioButton,
    QScrollArea,
    QTabWidget,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from ..core.data import DataValidationError, PreparedData, category_issues, prepare_data, read_table
from ..interpret import rules
from ..interpret.glossary import GLOSSARY, tooltip
from ..interpret.narrative import num, pct
from ..report.common import DECIMALS, dif_labels, table_frame
from ..resources import SAMPLES, sample_path
from . import strings as S
from .widgets import Banner, ChartPanel, Collapsible, TrafficLight, make_table, tech_table
from .worker import AnalysisWorker, start_worker


def _title(text: str) -> QLabel:
    lab = QLabel(text)
    lab.setStyleSheet("font-size:16pt;font-weight:bold;color:#1F1F1F;")
    return lab


def _para(text: str) -> QLabel:
    lab = QLabel(text)
    lab.setWordWrap(True)
    lab.setTextFormat(Qt.TextFormat.PlainText)
    lab.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
    return lab


def _issues_html(issues) -> str:
    return "<br>".join("• " + html.escape(i.message) for i in issues)


# ---------------------------------------------------------------------------
# Langkah 1: Impor data
# ---------------------------------------------------------------------------
class ImportPage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.df: pd.DataFrame | None = None
        self.source_name = ""
        self.prep: PreparedData | None = None
        self.btn_open = QPushButton(S.BTN_OPEN)
        self.btn_sample_dicho = QPushButton(S.BTN_SAMPLE_DICHO)
        self.btn_sample_poly = QPushButton(S.BTN_SAMPLE_POLY)
        self.file_label = QLabel(S.NO_FILE)
        self.preview = QWidget()
        self.preview_holder = QVBoxLayout(self.preview)
        self.preview_holder.setContentsMargins(0, 0, 0, 0)
        self.id_combo = QComboBox()
        self.group_combo = QComboBox()
        self.missing_edit = QLineEdit()
        self.missing_edit.setPlaceholderText(S.MISSING_PLACEHOLDER)
        self.items_list = QListWidget()
        self.btn_all = QPushButton(S.BTN_ALL)
        self.btn_clear = QPushButton(S.BTN_CLEAR)
        self.banner = Banner()

        buttons = QHBoxLayout()
        for b in (self.btn_open, self.btn_sample_dicho, self.btn_sample_poly):
            buttons.addWidget(b)
        buttons.addStretch()
        form = QFormLayout()
        form.addRow(S.LBL_ID, self.id_combo)
        form.addRow(S.LBL_GROUP, self.group_combo)
        form.addRow(S.LBL_MISSING, self.missing_edit)
        items_box = QGroupBox(S.LBL_ITEMS)
        ib = QVBoxLayout(items_box)
        ib.addWidget(self.items_list)
        row = QHBoxLayout()
        row.addWidget(self.btn_all)
        row.addWidget(self.btn_clear)
        row.addStretch()
        ib.addLayout(row)
        lower = QHBoxLayout()
        left = QVBoxLayout()
        left.addLayout(form)
        left.addStretch()
        lower.addLayout(left, 1)
        lower.addWidget(items_box, 1)
        lay = QVBoxLayout(self)
        lay.addWidget(_title(S.IMPORT_TITLE))
        lay.addWidget(_para(S.IMPORT_HELP))
        lay.addLayout(buttons)
        lay.addWidget(self.file_label)
        lay.addWidget(self.preview, 2)
        lay.addLayout(lower, 2)
        lay.addWidget(self.banner)

        self.btn_open.clicked.connect(self._ask_open)
        self.btn_sample_dicho.clicked.connect(lambda: self.load_sample("dichotomous"))
        self.btn_sample_poly.clicked.connect(lambda: self.load_sample("polytomous"))
        self.btn_all.clicked.connect(lambda: self._check_all(True))
        self.btn_clear.clicked.connect(lambda: self._check_all(False))
        self.id_combo.currentIndexChanged.connect(self._exclude_special_columns)
        self.group_combo.currentIndexChanged.connect(self._exclude_special_columns)

    # --- memuat data -----------------------------------------------------
    def _ask_open(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, S.BTN_OPEN, "", S.OPEN_FILTER)
        if path:
            self.load_file(path)

    def load_file(self, path, id_col=None, group_col=None) -> bool:
        try:
            df = read_table(path)
        except Exception as exc:
            self.banner.show_message(S.ERR_READ.format(error=exc), "error")
            return False
        self.set_dataframe(df, Path(path).name, id_col, group_col)
        return True

    def load_sample(self, kind: str) -> bool:
        cfg = SAMPLES[kind]
        return self.load_file(sample_path(kind), cfg["id"], cfg["group"])

    def set_dataframe(self, df: pd.DataFrame, name: str, id_col=None, group_col=None, item_cols=None) -> None:
        self.df = df
        self.source_name = name
        self.prep = None
        self.banner.clear_message()
        self.file_label.setText(S.FILE_LOADED.format(name=name, rows=len(df), cols=df.shape[1]))
        while self.preview_holder.count():
            w = self.preview_holder.takeAt(0).widget()
            if w is not None:
                w.deleteLater()
        head = df.head(20).apply(lambda col: col.map(_preview_text))
        self.preview_holder.addWidget(make_table(head, list(head.columns)))
        cols = [str(c) for c in df.columns]
        guess_id, guess_items = _guess_columns(df)
        id_col = id_col if id_col in cols else guess_id
        for combo in (self.id_combo, self.group_combo):
            combo.blockSignals(True)
            combo.clear()
            combo.addItem(S.NONE_OPTION, None)
            for c in cols:
                combo.addItem(c, c)
            combo.blockSignals(False)
        self.id_combo.setCurrentIndex(cols.index(id_col) + 1 if id_col in cols else 0)
        self.group_combo.setCurrentIndex(cols.index(group_col) + 1 if group_col in cols else 0)
        chosen = set(item_cols) if item_cols is not None else set(guess_items)
        self.items_list.clear()
        for c in cols:
            it = QListWidgetItem(c)
            it.setFlags(it.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            it.setCheckState(Qt.CheckState.Checked if c in chosen else Qt.CheckState.Unchecked)
            self.items_list.addItem(it)
        self._exclude_special_columns()

    def _exclude_special_columns(self) -> None:
        special = {self.selected_id(), self.selected_group()}
        for k in range(self.items_list.count()):
            it = self.items_list.item(k)
            if it.text() in special:
                it.setCheckState(Qt.CheckState.Unchecked)

    def _check_all(self, on: bool) -> None:
        special = {self.selected_id(), self.selected_group()}
        for k in range(self.items_list.count()):
            it = self.items_list.item(k)
            it.setCheckState(Qt.CheckState.Checked if on and it.text() not in special else Qt.CheckState.Unchecked)

    # --- pilihan pengguna ------------------------------------------------
    def selected_id(self):
        return self.id_combo.currentData()

    def selected_group(self):
        return self.group_combo.currentData()

    def selected_items(self) -> list[str]:
        return [self.items_list.item(k).text() for k in range(self.items_list.count())
                if self.items_list.item(k).checkState() == Qt.CheckState.Checked]

    def missing_codes(self) -> list[str]:
        return [t.strip() for t in self.missing_edit.text().split(",") if t.strip()]

    def validate(self) -> PreparedData | None:
        """Validasi pilihan; galat ditampilkan di banner, bukan dialog modal."""
        if self.df is None:
            self.banner.show_message(S.ERR_NO_FILE, "error")
            return None
        try:
            prep = prepare_data(self.df, self.selected_items(), id_col=self.selected_id(),
                                group_col=self.selected_group(), missing_codes=self.missing_codes())
        except DataValidationError as exc:
            self.banner.show_message(str(exc), "error")
            return None
        warn = [i for i in prep.issues if i.level == "warning"]
        text = S.VALID_OK.format(n=prep.n_persons, k=prep.n_items)
        if warn:
            self.banner.show_message(text + "<br>" + _issues_html(warn), "warning")
        else:
            self.banner.show_message(text, "info")
        self.prep = prep
        return prep


def _preview_text(v) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _guess_columns(df: pd.DataFrame) -> tuple[str | None, list[str]]:
    """Tebak kolom ID (nama khas atau kolom pertama non-numerik) dan kolom butir (bilangan bulat)."""
    cols = [str(c) for c in df.columns]
    id_col = next((c for c in cols if c.strip().lower() in ("id", "nama", "name", "nis", "nim", "no", "kode")), None)
    items = []
    for c in cols:
        vals = [v for v in df[c].tolist() if _preview_text(v) != ""]
        if not vals:
            continue
        ok = 0
        for v in vals:
            try:
                ok += float(str(v).replace(",", ".")).is_integer()
            except ValueError:
                pass
        if ok / len(vals) >= 0.9 and len(set(map(_preview_text, vals))) <= 20:
            items.append(c)
        elif id_col is None and c == cols[0]:
            id_col = c
    return id_col, [c for c in items if c != id_col]


# ---------------------------------------------------------------------------
# Langkah 2: Model
# ---------------------------------------------------------------------------
class ModelPage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.prep: PreparedData | None = None
        self.detected = QLabel()
        self.detected.setStyleSheet("font-weight:bold;")
        self.reason = _para("")
        self.group = QButtonGroup(self)
        self.radios: dict[str, QRadioButton] = {}
        box = QGroupBox(S.MODEL_TITLE)
        bl = QVBoxLayout(box)
        for key in ("dichotomous", "rsm", "pcm"):
            r = QRadioButton(S.MODEL_LABELS[key])
            self.radios[key] = r
            self.group.addButton(r)
            bl.addWidget(r)
            d = QLabel(S.MODEL_DESC[key])
            d.setStyleSheet("color:#4D4D4D;margin-left:24px;")
            d.setWordWrap(True)
            bl.addWidget(d)
        lo, hi = rules.MNSQ_STRICT
        dlo, dhi = rules.MNSQ_PRODUCTIVE
        self.strict = QCheckBox(S.LBL_STRICT.format(lo=num(lo, 1), hi=num(hi, 1), dlo=num(dlo, 1), dhi=num(dhi, 1)))
        self.dif = QCheckBox()
        self.category_banner = Banner()
        self.notes_banner = Banner()
        lay = QVBoxLayout(self)
        lay.addWidget(_title(S.MODEL_TITLE))
        lay.addWidget(self.detected)
        rec = QGroupBox(S.RECOMMENDED)
        QVBoxLayout(rec).addWidget(self.reason)
        lay.addWidget(rec)
        lay.addWidget(box)
        lay.addWidget(self.strict)
        lay.addWidget(self.dif)
        lay.addWidget(self.category_banner)
        lay.addWidget(self.notes_banner)
        lay.addStretch()
        for r in self.radios.values():
            r.toggled.connect(self._update_category_check)

    def set_data(self, prep: PreparedData) -> None:
        self.prep = prep
        dicho = prep.response_type == "dichotomous"
        self.detected.setText(S.DETECTED_DICHO if dicho else S.DETECTED_POLY)
        self.reason.setText(prep.recommendation_reason)
        self.radios["dichotomous"].setEnabled(dicho)
        self.radios["rsm"].setEnabled(not dicho)
        self.radios["pcm"].setEnabled(not dicho)
        self.select_model(prep.recommended_model)
        if prep.dif_available:
            self.dif.setText(S.LBL_DIF.format(col=prep.group_name))
            self.dif.setEnabled(True)
            self.dif.setChecked(True)
        else:
            self.dif.setText(S.LBL_DIF_NA)
            self.dif.setEnabled(False)
            self.dif.setChecked(False)
        notes = list(prep.issues)
        if notes:
            self.notes_banner.show_message(f"<b>{S.DATA_NOTES_TITLE}</b><br>" + _issues_html(notes),
                                           "warning" if any(i.level == "warning" for i in notes) else "info")
        else:
            self.notes_banner.clear_message()
        self._update_category_check()

    def select_model(self, model: str) -> None:
        self.radios[model].setChecked(True)

    def selected_model(self) -> str:
        return next(k for k, r in self.radios.items() if r.isChecked())

    def _update_category_check(self) -> None:
        if self.prep is None or not any(r.isChecked() for r in self.radios.values()):
            return
        model = self.selected_model()
        if model == "dichotomous":
            self.category_banner.clear_message()
            return
        issues = category_issues(self.prep, model)
        if issues:
            self.category_banner.show_message(f"<b>{S.CATEGORY_CHECK_TITLE}</b><br>" + _issues_html(issues), "warning")
        else:
            self.category_banner.show_message(f"<b>{S.CATEGORY_CHECK_TITLE}</b><br>{S.CATEGORY_CHECK_OK}", "info")


# ---------------------------------------------------------------------------
# Langkah 3: Jalankan
# ---------------------------------------------------------------------------
class RunPage(QWidget):
    done = Signal(object, object)
    stopped = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.btn_cancel = QPushButton(S.BTN_CANCEL)
        self.banner = Banner()
        self.worker = None
        self.thread = None
        self.running = False
        self.outcome = None  # "finished" | "cancelled" | "failed"
        lay = QVBoxLayout(self)
        lay.addWidget(_title(S.RUN_TITLE))
        lay.addWidget(_para(S.RUN_HELP))
        lay.addWidget(self.progress)
        lay.addWidget(self.log, 1)
        row = QHBoxLayout()
        row.addStretch()
        row.addWidget(self.btn_cancel)
        lay.addLayout(row)
        lay.addWidget(self.banner)
        self.btn_cancel.clicked.connect(self.cancel)

    def start(self, prep, model: str, strict_fit: bool, run_dif: bool) -> None:
        self.log.clear()
        self.banner.clear_message()
        self.progress.setValue(0)
        self.outcome = None
        self.log.appendPlainText(S.RUN_START.format(model=S.MODEL_LABELS[model], n=prep.n_persons, k=prep.n_items))
        self.worker = AnalysisWorker(prep, model, strict_fit, run_dif)
        self.worker.progress.connect(self._on_progress)
        self.worker.finished.connect(self._on_finished)
        self.worker.failed.connect(self._on_failed)
        self.worker.cancelled.connect(self._on_cancelled)
        self.running = True
        self.btn_cancel.setEnabled(True)
        self.thread = start_worker(self.worker, self)

    def cancel(self) -> None:
        if self.running and self.worker is not None:
            self.worker.cancel()
            self.btn_cancel.setEnabled(False)
            self.log.appendPlainText(S.RUN_CANCELLING)

    def wait(self, ms: int = 30000) -> None:
        if self.thread is not None:
            self.thread.wait(ms)

    def _on_progress(self, it: int, change: float, resid: float, frac: float) -> None:
        self.progress.setValue(int(round(100 * frac)))
        self.log.appendPlainText(S.RUN_ITER.format(it=it, change=num(change, 5), resid=num(resid, 4)))

    def _finish(self, outcome: str) -> None:
        self.running = False
        self.outcome = outcome
        self.btn_cancel.setEnabled(False)

    def _on_finished(self, res, interp, seconds: float) -> None:
        self.progress.setValue(100)
        for issue in res.issues:
            if issue.code in ("converged", "not_converged"):
                self.log.appendPlainText(issue.message)
        self.log.appendPlainText(S.RUN_DONE.format(sec=num(seconds, 2)))
        self._finish("finished")
        self.done.emit(res, interp)

    def _on_failed(self, message: str) -> None:
        self.banner.show_message(S.RUN_FAILED.format(error=html.escape(message)), "error")
        self._finish("failed")
        self.stopped.emit()

    def _on_cancelled(self) -> None:
        self.banner.show_message(S.RUN_CANCELLED, "info")
        self.log.appendPlainText(S.RUN_CANCELLED)
        self._finish("cancelled")
        self.stopped.emit()


# ---------------------------------------------------------------------------
# Langkah 4: Hasil
# ---------------------------------------------------------------------------
class ResultsPage(QWidget):
    def __init__(self, res, interp, source_name: str = "", parent=None):
        super().__init__(parent)
        self.res, self.interp, self.source_name = res, interp, source_name
        self.export_running = False
        self.export_outcome = None  # "finished" | "failed" | "cancelled"
        self.export_written = None
        self._export_worker = None
        self._export_thread = None
        s = res.summary
        conv = (S.CONVERGED_OK if res.converged else S.CONVERGED_NO).format(n=s["iterations"])
        header = QLabel(S.RESULT_HEADER.format(model=interp.model_name, n=s["n_persons"], k=s["n_items"], conv=conv))
        header.setStyleSheet("font-weight:bold;" + ("" if res.converged else "color:#D55E00;"))
        self.tabs = QTabWidget()
        self.chart_panels: dict[int, ChartPanel] = {}
        self.tables: dict[str, object] = {}
        self.tabs.addTab(self._summary_tab(), S.TAB_SUMMARY)
        self.tabs.addTab(self._items_tab(), S.TAB_ITEMS)
        self.tabs.addTab(self._persons_tab(), S.TAB_PERSONS)
        self.tabs.addTab(self._categories_tab(), S.TAB_CATEGORIES)
        self._add_with_chart(self._dimension_tab(), S.TAB_DIMENSION, ["pca_contrast"])
        self._add_with_chart(self._local_tab(), S.TAB_LOCAL, ["q3_heatmap"])
        self._add_with_chart(self._dif_tab(), S.TAB_DIF, ["dif"] if res.dif is not None else None)
        self.charts = ChartPanel(res)
        self.chart_panels[self.tabs.addTab(self.charts, S.TAB_CHARTS)] = self.charts
        self.tabs.addTab(self._glossary_tab(), S.TAB_GLOSSARY)
        self.btn_export = QPushButton(S.BTN_EXPORT)
        self.export_progress = QProgressBar()
        self.export_progress.hide()
        self.export_banner = Banner()
        top = QHBoxLayout()
        top.addWidget(header, 1)
        top.addWidget(self.btn_export)
        lay = QVBoxLayout(self)
        lay.addLayout(top)
        lay.addWidget(self.export_progress)
        lay.addWidget(self.export_banner)
        lay.addWidget(self.tabs, 1)
        self.tabs.currentChanged.connect(self._render_visible_chart)
        self.btn_export.clicked.connect(self._ask_export)

    # --- Ekspor -------------------------------------------------------------
    def _ask_export(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, S.EXPORT_DIALOG)
        if folder:
            self.start_export(folder)

    def start_export(self, folder) -> None:
        from .worker import ExportWorker

        self.export_running = True
        self.export_outcome = None
        self.btn_export.setEnabled(False)
        self.export_progress.setValue(0)
        self.export_progress.show()
        self.export_banner.clear_message()
        self._export_folder = folder
        worker = ExportWorker(self.res, self.interp, folder, self.source_name)
        worker.progress.connect(self._on_export_progress)
        worker.finished.connect(self._on_export_finished)
        worker.failed.connect(self._on_export_failed)
        worker.cancelled.connect(self._on_export_failed)
        self._export_worker = worker
        self._export_thread = start_worker(worker, self)

    def wait_export(self, ms: int = 120000) -> None:
        if self._export_thread is not None:
            self._export_thread.wait(ms)

    def _on_export_progress(self, k: int, n: int, message: str) -> None:
        self.export_progress.setMaximum(max(n, 1))
        self.export_progress.setValue(k)
        if message:
            self.export_progress.setFormat(S.EXPORT_RUNNING.format(message=message))

    def _end_export(self, outcome: str) -> None:
        self.export_running = False
        self.export_outcome = outcome
        self.btn_export.setEnabled(True)
        self.export_progress.hide()

    def _on_export_finished(self, written) -> None:
        self.export_written = written
        files = ", ".join(S.EXPORT_FILES[k] for k in ("excel", "html", "pdf") if k in written)
        files += f", {S.EXPORT_FILES['charts']}/ ({len(written['charts'])} berkas)"
        self.export_banner.show_message(html.escape(S.EXPORT_DONE.format(folder=self._export_folder, files=files)),
                                        "info")
        self._end_export("finished")

    def _on_export_failed(self, message: str = "") -> None:
        self.export_banner.show_message(html.escape(S.EXPORT_FAILED.format(error=message or "-")), "error")
        self._end_export("failed" if message else "cancelled")

    def _render_visible_chart(self, index: int) -> None:
        panel = self.chart_panels.get(index)
        if panel is not None:
            panel.ensure_rendered()

    def _add_with_chart(self, widget: QWidget, title: str, keys) -> None:
        if keys:
            holder = QWidget()
            v = QVBoxLayout(holder)
            v.addWidget(widget, 1)
            panel = ChartPanel(self.res, keys)
            v.addWidget(panel, 2)
            self.chart_panels[self.tabs.addTab(holder, title)] = panel
        else:
            self.tabs.addTab(widget, title)

    # --- Ringkasan ----------------------------------------------------------
    def _summary_tab(self) -> QWidget:
        inner = QWidget()
        v = QVBoxLayout(inner)
        if self.interp.cautions:
            b = Banner()
            b.show_message(f"<b>{S.CAUTIONS}</b><br>" + "<br>".join("• " + html.escape(c) for c in self.interp.cautions),
                           "warning")
            v.addWidget(b)
        v.addWidget(_title(S.SUMMARY_1MIN))
        self.lights = []
        for light in self.interp.lights:
            w = TrafficLight(light.title, light.status, light.sentence, tooltip(S.LIGHT_GLOSSARY.get(light.key, "")))
            self.lights.append(w)
            v.addWidget(w)
        v.addSpacing(12)
        v.addWidget(_title(S.EXPLANATION))
        for p in self.interp.intro:
            v.addWidget(_para(p))
        for sec in self.interp.sections:
            head = QLabel(f"<span style='color:{_dot(sec.status)}'>●</span> <b>{html.escape(sec.title)}</b>")
            head.setStyleSheet("font-size:12pt;margin-top:10px;")
            v.addWidget(head)
            for p in sec.paragraphs:
                v.addWidget(_para(p))
            if sec.actions:
                acts = QLabel(f"<b>{S.ACTIONS}</b><ul>" + "".join(f"<li>{html.escape(a)}</li>" for a in sec.actions)
                              + "</ul>")
                acts.setWordWrap(True)
                v.addWidget(acts)
            if sec.technical:
                box = QWidget()
                bl = QVBoxLayout(box)
                bl.setContentsMargins(0, 0, 0, 0)
                bl.addWidget(tech_table(sec.technical))
                if sec.references:
                    refs = _para(S.REFERENCES + ":\n" + "\n".join("• " + r for r in sec.references))
                    refs.setStyleSheet("color:#4D4D4D;")
                    bl.addWidget(refs)
                v.addWidget(Collapsible(box))
        v.addStretch()
        area = QScrollArea()
        area.setWidgetResizable(True)
        area.setWidget(inner)
        return area

    # --- Tabel -------------------------------------------------------------
    def _with_hint(self, view, key: str) -> QWidget:
        self.tables[key] = view
        w = QWidget()
        v = QVBoxLayout(w)
        hint = QLabel(S.TABLE_HINT)
        hint.setStyleSheet("color:#4D4D4D;")
        v.addWidget(hint)
        v.addWidget(view, 1)
        return w

    def _table_view(self, key: str):
        df, cols, flag, muted = table_frame(self.res, key)
        labels = dif_labels(self.res) if key == "dif" else {}
        if labels:
            df = df.rename(columns=labels)
            cols = [labels.get(c, c) for c in cols]
        dec = {labels.get(k, k): v for k, v in DECIMALS.items()}
        return make_table(df, cols, flag, muted, dec)

    def _items_tab(self) -> QWidget:
        return self._with_hint(self._table_view("items"), "items")

    def _persons_tab(self) -> QWidget:
        return self._with_hint(self._table_view("persons"), "persons")

    def _categories_tab(self) -> QWidget:
        if self.res.categories is None:
            return _para(S.NOT_APPLICABLE_CATEGORIES)
        return self._with_hint(self._table_view("categories"), "categories")

    def _dimension_tab(self) -> QWidget:
        d = self.res.dimensionality
        text = _para(S.DIMENSION_TEXT.format(eig=num(d["first_contrast_eigenvalue"]),
                                             lim=num(rules.CONTRAST_EIGENVALUE_MAX, 1),
                                             pct=pct(d["variance_explained_pct"], 1)))
        view = self._table_view("loadings")
        self.tables["loadings"] = view
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(text)
        v.addWidget(view, 1)
        return w

    def _local_tab(self) -> QWidget:
        q3 = self.res.q3
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(_para(S.LOCAL_TEXT.format(mean=num(q3["mean"], 3), cutoff=num(q3["cutoff"], 3),
                                              rel=num(rules.Q3_RELATIVE_CUTOFF, 1))))
        if len(q3["flagged_pairs"]):
            view = self._table_view("q3_pairs")
            self.tables["q3_pairs"] = view
            v.addWidget(view, 1)
        else:
            v.addWidget(_para(S.NO_Q3_PAIRS.format(cutoff=num(q3["cutoff"], 3))))
        return w

    def _dif_tab(self) -> QWidget:
        if self.res.dif is None:
            return _para(S.NOT_APPLICABLE_DIF)
        return self._with_hint(self._table_view("dif"), "dif")

    def _glossary_tab(self) -> QWidget:
        browser = QTextBrowser()
        parts = [f"<h3>{html.escape(t.term)}</h3><p>{html.escape(t.long)}</p>" for t in GLOSSARY.values()]
        browser.setHtml("".join(parts))
        return browser


def _dot(status: str) -> str:
    from .widgets import STATUS_COLORS

    return STATUS_COLORS[status]


__all__ = ["ImportPage", "ModelPage", "RunPage", "ResultsPage"]
