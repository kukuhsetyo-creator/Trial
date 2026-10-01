"""Stylesheet Qt (QSS) bergaya deck CSPS, dibangun dari :mod:`raschlite.theme`."""

from __future__ import annotations

from .. import theme as T

TITLE_FONT = "Georgia, 'DejaVu Serif', serif"


def stylesheet() -> str:
    return f"""
QMainWindow, QWidget#central, QStackedWidget > QWidget {{ background: {T.BACKGROUND}; }}
QWidget {{ color: {T.INK}; }}
QLabel {{ background: transparent; }}
QGroupBox {{
    background: {T.CARD}; border: 1px solid {T.LINE}; border-radius: 10px;
    margin-top: 16px; padding: 12px 10px 10px 10px;
}}
QGroupBox::title {{
    subcontrol-origin: margin; left: 12px; padding: 0 4px;
    color: {T.BRONZE}; font-weight: 600; letter-spacing: 1px;
}}
QPushButton {{
    background: {T.CARD}; color: {T.INK}; border: 1px solid {T.LINE_STRONG};
    border-radius: 8px; padding: 6px 14px;
}}
QPushButton:hover {{ background: {T.SAND}; }}
QPushButton:disabled {{ color: {T.STATUS['abu']}; border-color: {T.LINE}; background: {T.BACKGROUND}; }}
QPushButton#primary {{
    background: {T.NAVY}; color: {T.NAVY_TEXT}; border: 1px solid {T.NAVY}; font-weight: 600;
}}
QPushButton#primary:hover {{ background: #2C4160; }}
QPushButton#primary:disabled {{ background: #9AA3AF; border-color: #9AA3AF; color: {T.NAVY_TEXT}; }}
QLineEdit, QComboBox, QListWidget, QPlainTextEdit, QTextBrowser {{
    background: {T.CARD}; border: 1px solid {T.LINE}; border-radius: 6px; padding: 3px;
    selection-background-color: {T.TERRA_HEAD}; selection-color: {T.INK};
}}
QTableView, QTableWidget {{
    background: {T.CARD}; border: 1px solid {T.LINE}; gridline-color: {T.LINE};
    selection-background-color: {T.TERRA_HEAD}; selection-color: {T.INK};
}}
QHeaderView::section {{
    background: {T.SAND}; color: {T.INK}; border: none; border-right: 1px solid {T.LINE};
    border-bottom: 1px solid {T.LINE_STRONG}; padding: 4px 6px; font-weight: 600;
}}
QTableCornerButton::section {{ background: {T.SAND}; border: none; }}
QTabWidget::pane {{ border: 1px solid {T.LINE}; background: {T.CARD}; top: -1px; }}
QTabBar::tab {{
    background: {T.SAND}; color: {T.INK_SECONDARY}; padding: 6px 14px; margin-right: 2px;
    border: 1px solid {T.LINE}; border-bottom: none;
    border-top-left-radius: 8px; border-top-right-radius: 8px;
}}
QTabBar::tab:selected {{ background: {T.CARD}; color: {T.INK}; border-top: 3px solid {T.BRONZE}; font-weight: 600; }}
QProgressBar {{
    background: {T.SAND}; border: 1px solid {T.LINE}; border-radius: 6px; text-align: center;
    color: {T.INK}; min-height: 18px;
}}
QProgressBar::chunk {{ background: {T.NAVY_SERIES}; border-radius: 6px; }}
QScrollArea {{ background: transparent; border: none; }}
QScrollArea > QWidget > QWidget {{ background: transparent; }}
QToolTip {{ background: {T.NAVY}; color: {T.NAVY_TEXT}; border: none; padding: 6px; }}
QCheckBox, QRadioButton {{ spacing: 8px; }}
"""


def title_style() -> str:
    """Judul halaman: serif berhuruf kapital dengan jarak huruf, seperti judul deck."""
    return (f"font-family:{TITLE_FONT}; font-size:20pt; font-weight:400; letter-spacing:2px; "
            f"color:{T.INK};")


def label_style() -> str:
    """Label kecil bronze berhuruf kapital (gaya label deck)."""
    return f"color:{T.BRONZE}; font-weight:600; letter-spacing:2px;"
