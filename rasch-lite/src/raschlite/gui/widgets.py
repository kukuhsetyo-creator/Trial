"""Widget dan model data yang dipakai bersama oleh halaman-halaman GUI."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd
from PySide6.QtCore import QAbstractTableModel, QModelIndex, QSortFilterProxyModel, Qt
from PySide6.QtGui import QBrush, QColor
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QSizePolicy,
    QTableView,
    QTableWidget,
    QTableWidgetItem,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from ..interpret.glossary import tooltip
from ..report.common import fmt_value
from . import strings as S

SORT_ROLE = Qt.ItemDataRole.UserRole + 1
FLAG_BG = QColor("#FBE3D6")  # vermilion sangat pucat: baris yang perlu diperiksa
MUTED_BG = QColor("#F2F2F2")  # baris ekstrem / tidak diestimasi
STATUS_COLORS = {"hijau": "#009E73", "kuning": "#F0E442", "merah": "#D55E00", "abu": "#BDBDBD"}


class DataFrameModel(QAbstractTableModel):
    """Model tabel baca-saja untuk DataFrame, dengan format angka Indonesia,
    peran pengurutan numerik, pewarnaan baris, dan tooltip glosarium pada judul."""

    def __init__(self, df: pd.DataFrame, columns: list[str], flag_rows=None, muted_rows=None,
                 decimals: dict | None = None, parent=None):
        super().__init__(parent)
        self._df = df.reset_index(drop=True)
        self._cols = [c for c in columns if c in self._df.columns]
        self._flag = np.asarray(flag_rows, bool) if flag_rows is not None else np.zeros(len(self._df), bool)
        self._muted = np.asarray(muted_rows, bool) if muted_rows is not None else np.zeros(len(self._df), bool)
        self._dec = decimals or {}
        self._values = self._df[self._cols].to_numpy(dtype=object) if self._cols else np.empty((0, 0), object)

    def rowCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self._df)

    def columnCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self._cols)

    def data(self, index, role=Qt.ItemDataRole.DisplayRole):
        if not index.isValid():
            return None
        v = self._values[index.row(), index.column()]
        key = self._cols[index.column()]
        if role == Qt.ItemDataRole.DisplayRole:
            return fmt_value(v, self._dec.get(key, 2))
        if role == SORT_ROLE:
            if isinstance(v, (bool, np.bool_)):
                return int(v)
            if isinstance(v, (int, float, np.integer, np.floating)):
                f = float(v)
                return f if math.isfinite(f) else -1e300
            return str(v)
        if role == Qt.ItemDataRole.BackgroundRole:
            if self._flag[index.row()]:
                return QBrush(FLAG_BG)
            if self._muted[index.row()]:
                return QBrush(MUTED_BG)
        if role == Qt.ItemDataRole.TextAlignmentRole:
            if isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_)):
                return int(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        return None

    def headerData(self, section, orientation, role=Qt.ItemDataRole.DisplayRole):
        if orientation == Qt.Orientation.Horizontal:
            key = self._cols[section]
            if role == Qt.ItemDataRole.DisplayRole:
                return S.COLUMNS.get(key, key)
            if role == Qt.ItemDataRole.ToolTipRole and key in S.COLUMN_GLOSSARY:
                return tooltip(S.COLUMN_GLOSSARY[key])
        elif role == Qt.ItemDataRole.DisplayRole:
            return str(section + 1)
        return None


def make_table(df: pd.DataFrame, columns: list[str], flag_rows=None, muted_rows=None, decimals=None) -> QTableView:
    """QTableView yang dapat diurutkan untuk sebuah DataFrame."""
    view = QTableView()
    model = DataFrameModel(df, columns, flag_rows, muted_rows, decimals, view)
    proxy = QSortFilterProxyModel(view)
    proxy.setSourceModel(model)
    proxy.setSortRole(SORT_ROLE)
    view.setModel(proxy)
    view.setSortingEnabled(True)
    view.sortByColumn(-1, Qt.SortOrder.AscendingOrder)
    view.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
    view.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
    view.setAlternatingRowColors(False)
    view.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
    view.verticalHeader().setDefaultSectionSize(22)
    return view


class Banner(QLabel):
    """Pesan sebaris (info / peringatan / galat) yang tidak memblokir alur."""

    STYLES = {
        "info": "background:#EAF3FA;border:1px solid #BBD7EC;color:#1F1F1F;",
        "warning": "background:#FFF7D6;border:1px solid #E9D98A;color:#1F1F1F;",
        "error": "background:#FBE3D6;border:1px solid #E7B394;color:#1F1F1F;",
    }

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWordWrap(True)
        self.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.hide()

    def show_message(self, text: str, level: str = "info") -> None:
        self.setText(text)
        self.setStyleSheet(self.STYLES[level] + "padding:8px;border-radius:4px;")
        self.setProperty("level", level)
        self.show()

    def clear_message(self) -> None:
        self.setText("")
        self.setProperty("level", None)
        self.hide()


class StepIndicator(QWidget):
    def __init__(self, steps: list[str], parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        self._labels = []
        for k, text in enumerate(steps):
            lab = QLabel(text)
            lab.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lab.setMinimumHeight(30)
            self._labels.append(lab)
            lay.addWidget(lab, 1)
        self.set_current(0)

    def set_current(self, k: int) -> None:
        for i, lab in enumerate(self._labels):
            if i == k:
                lab.setStyleSheet("background:#0072B2;color:white;font-weight:bold;border-radius:4px;")
            elif i < k:
                lab.setStyleSheet("background:#D9EAF5;color:#1F1F1F;border-radius:4px;")
            else:
                lab.setStyleSheet("background:#F2F2F2;color:#7A7A7A;border-radius:4px;")


class TrafficLight(QFrame):
    """Satu baris lampu: titik berwarna + label status (warna tidak berdiri sendiri)."""

    def __init__(self, title: str, status: str, sentence: str, tip: str = "", parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(4, 4, 4, 4)
        dot = QLabel()
        dot.setFixedSize(18, 18)
        dot.setStyleSheet(f"background:{STATUS_COLORS[status]};border-radius:9px;border:1px solid #7A7A7A;")
        head = QLabel(f"<b>{title}</b><br><span style='color:#4D4D4D'>{S.STATUS_TEXT[status]}</span>")
        head.setFixedWidth(150)
        if tip:
            head.setToolTip(tip)
        body = QLabel(sentence)
        body.setWordWrap(True)
        lay.addWidget(dot, 0, Qt.AlignmentFlag.AlignTop)
        lay.addWidget(head, 0, Qt.AlignmentFlag.AlignTop)
        lay.addWidget(body, 1)
        self.status = status


class Collapsible(QWidget):
    """Bagian yang dapat dibuka-tutup (dipakai untuk Detail Teknis)."""

    def __init__(self, content: QWidget, parent=None):
        super().__init__(parent)
        self.button = QToolButton()
        self.button.setText(S.TECH_SHOW)
        self.button.setCheckable(True)
        self.button.setStyleSheet("QToolButton{border:none;color:#0072B2;}")
        self.content = content
        content.setVisible(False)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.addWidget(self.button, 0, Qt.AlignmentFlag.AlignLeft)
        lay.addWidget(content)
        self.button.toggled.connect(self._toggle)

    def _toggle(self, on: bool) -> None:
        self.content.setVisible(on)
        self.button.setText(S.TECH_HIDE if on else S.TECH_SHOW)


def tech_table(rows) -> QTableWidget:
    t = QTableWidget(len(rows), 3)
    t.setHorizontalHeaderLabels(S.TECH_HEAD)
    for r, row in enumerate(rows):
        for c, v in enumerate((row.label.strip(), row.value, row.criterion)):
            t.setItem(r, c, QTableWidgetItem(v))
    t.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
    t.verticalHeader().setVisible(False)
    t.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
    t.horizontalHeader().setStretchLastSection(True)
    t.setMinimumHeight(min(60 + 26 * len(rows), 360))
    return t


class ChartPanel(QWidget):
    """Kanvas matplotlib + pilihan grafik/butir + panel 'Cara membaca grafik ini' + ekspor."""

    def __init__(self, res, keys: list[str] | None = None, parent=None):
        super().__init__(parent)
        from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg

        from ..plots import SPECS, available_charts, item_choices

        self._canvas_cls = FigureCanvasQTAgg
        self.res = res
        self.specs = [s for s in available_charts(res) if keys is None or s.key in keys]
        self._spec_map = SPECS
        self.figure = None
        self.canvas = None
        self.chart_combo = QComboBox()
        for s in self.specs:
            self.chart_combo.addItem(s.title, s.key)
        self.item_combo = QComboBox()
        self.item_combo.addItems(item_choices(res))
        self.btn_png = QPushButton(S.BTN_SAVE_PNG)
        self.btn_svg = QPushButton(S.BTN_SAVE_SVG)
        self.saved = QLabel("")
        self.saved.setStyleSheet("color:#4D4D4D;")
        top = QHBoxLayout()
        if len(self.specs) > 1:
            top.addWidget(QLabel(S.LBL_CHART))
            top.addWidget(self.chart_combo, 1)
        if any(spec.per_item for spec in self.specs):
            top.addWidget(QLabel(S.LBL_ITEM))
            top.addWidget(self.item_combo)
        top.addStretch()
        top.addWidget(self.btn_png)
        top.addWidget(self.btn_svg)
        self.read_box = QGroupBox(S.HOW_TO_READ)
        self.read_label = QLabel()
        self.read_label.setWordWrap(True)
        self.read_label.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        self.read_label.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.MinimumExpanding)
        rb = QVBoxLayout(self.read_box)
        rb.addWidget(self.read_label)
        self.read_box.setFixedWidth(300)
        self.canvas_holder = QVBoxLayout()
        body = QHBoxLayout()
        body.addLayout(self.canvas_holder, 1)
        side = QVBoxLayout()
        side.addWidget(self.read_box)
        side.addStretch()
        body.addLayout(side)
        lay = QVBoxLayout(self)
        lay.addLayout(top)
        lay.addLayout(body, 1)
        lay.addWidget(self.saved)
        self.chart_combo.currentIndexChanged.connect(self.refresh)
        self.item_combo.currentIndexChanged.connect(self.refresh)
        self.btn_png.clicked.connect(lambda: self._ask_save("png"))
        self.btn_svg.clicked.connect(lambda: self._ask_save("svg"))
        self._rendered = False

    def current_key(self) -> str:
        return self.chart_combo.currentData()

    def ensure_rendered(self) -> None:
        if not self._rendered:
            self.refresh()

    def refresh(self) -> None:
        from ..plots import render

        key = self.current_key()
        if key is None:
            return
        spec = self._spec_map[key]
        self.item_combo.setEnabled(spec.per_item)
        item = self.item_combo.currentText() if spec.per_item else None
        fig = render(self.res, key, item)
        if self.canvas is not None:
            self.canvas_holder.removeWidget(self.canvas)
            self.canvas.setParent(None)
            self.canvas.deleteLater()
        self.figure = fig
        self.canvas = self._canvas_cls(fig)
        self.canvas.setMinimumSize(480, 320)
        self.canvas_holder.addWidget(self.canvas)
        self.read_label.setText(spec.how_to_read(self.res))
        self._rendered = True

    def export(self, stem: str | Path, formats=("png", "svg")) -> list[Path]:
        """Simpan grafik yang sedang tampil; dipakai tombol simpan dan uji otomatis."""
        from ..plots import save_figure

        self.ensure_rendered()
        paths = save_figure(self.figure, Path(stem), formats)
        self.saved.setText(S.SAVED.format(path=", ".join(str(p) for p in paths)))
        return paths

    def _ask_save(self, fmt: str) -> None:
        from PySide6.QtWidgets import QFileDialog

        key = self.current_key()
        spec = self._spec_map[key]
        name = key + (f"_{self.item_combo.currentText()}" if spec.per_item else "")
        flt = S.SAVE_FILTER_PNG if fmt == "png" else S.SAVE_FILTER_SVG
        path, _ = QFileDialog.getSaveFileName(self, spec.title, f"{name}.{fmt}", flt)
        if path:
            self.export(Path(path).with_suffix(""), (fmt,))
