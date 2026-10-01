"""Laporan PDF lewat QTextDocument + QPdfWriter (QtGui bawaan, tanpa WebEngine).

Rich text Qt hanya mendukung subset HTML, sehingga PDF memakai template
tersendiri. Grafik dimasukkan sebagai resource gambar dokumen (PNG), tabel
responden hanya memuat responden yang misfit agar PDF tetap ringkas.
"""

from __future__ import annotations

from pathlib import Path

from .. import APP_NAME, __version__
from ..gui import strings as S
from ..interpret.glossary import GLOSSARY
from ..plots import SPECS, render
from .common import display_table, figure_bytes, flagged_items, generated_line, metadata
from .html import chart_stem, chart_title, environment

PDF_PER_ITEM_LIMIT = 12
# QTextDocument.print_ menambah margin 2 cm di dalam margin halaman (5 mm), sehingga lebar area
# teks A4 sekitar 160 mm, kira-kira 600 piksel tata letak pada 96 dpi; 560 piksel selalu muat.
IMAGE_WIDTH = 560
STATUS_COLORS = {"hijau": "#009E73", "kuning": "#C8B400", "merah": "#D55E00", "abu": "#9E9E9E"}
_APP = None


def _ensure_gui_app():
    """QTextDocument dan QPdfWriter memerlukan aplikasi Qt. Bila belum ada, dibuat
    QApplication (bukan sekadar QGuiApplication) agar widget tetap dapat dibuat
    sesudahnya dalam proses yang sama; QGuiApplication tidak dapat ditingkatkan."""
    global _APP
    from PySide6.QtCore import QCoreApplication

    app = QCoreApplication.instance()
    if app is None:
        from PySide6.QtWidgets import QApplication

        _APP = QApplication([])
        app = _APP
    return app


def _pdf_chart_plan(res, limit: int) -> list[tuple[str, str | None]]:
    from ..plots import available_charts

    chosen = flagged_items(res)[:limit]
    plan = []
    for spec in available_charts(res):
        if spec.per_item:
            plan.extend((spec.key, it) for it in chosen)
        else:
            plan.append((spec.key, None))
    return plan


def export_pdf(res, interp, path: str | Path, source_name: str = "", chart_dir: str | Path | None = None,
               per_item_limit: int = PDF_PER_ITEM_LIMIT) -> Path:
    """Tulis laporan PDF A4. Bila ``chart_dir`` berisi PNG hasil ekspor, berkas itu dipakai ulang."""
    _ensure_gui_app()
    from PySide6.QtCore import QMarginsF, QUrl
    from PySide6.QtGui import QFont, QFontDatabase, QImage, QPageLayout, QPageSize, QPdfWriter, QTextDocument

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = QTextDocument()
    families = set(QFontDatabase.families())
    family = next((f for f in ("Segoe UI", "DejaVu Sans", "Liberation Sans", "Arial") if f in families), "")
    if family:
        doc.setDefaultFont(QFont(family, 9))

    charts, images = [], []
    for k, (key, item) in enumerate(_pdf_chart_plan(res, per_item_limit)):
        png = Path(chart_dir) / f"{chart_stem(key, item)}.png" if chart_dir is not None else None
        data = png.read_bytes() if png is not None and png.exists() else figure_bytes(render(res, key, item), "png", 200)
        name = f"grafik_{k}.png"
        images.append((name, QImage.fromData(data)))
        charts.append({"title": chart_title(key, item), "src": name, "width": IMAGE_WIDTH,
                       "how_to_read": SPECS[key].how_to_read(res)})

    tables = []
    for key in ("items", "persons", "categories", "dif", "loadings", "q3_pairs"):
        tb = display_table(res, key, only_flagged=(key == "persons"))
        if tb is None:
            continue
        tb["note"] = S.REPORT_PERSONS_MISFIT_ONLY if key == "persons" else ""
        tables.append(tb)
    labels = {
        "summary": S.SUMMARY_1MIN, "explanation": S.EXPLANATION, "charts": S.REPORT_CHARTS,
        "tables": S.REPORT_TABLES, "glossary": S.REPORT_GLOSSARY, "meta": S.REPORT_META, "cautions": S.CAUTIONS,
        "actions": S.ACTIONS, "technical": S.REPORT_TECHNICAL, "references": S.REFERENCES,
        "how_to_read": S.HOW_TO_READ, "table_hint": S.REPORT_TABLE_HINT, "no_rows": S.REPORT_NO_ROWS,
    }
    note = S.REPORT_PER_ITEM_FLAGGED.format(folder=S.EXPORT_FILES["charts"])
    html = environment().get_template("report_pdf.html.j2").render(
        app=APP_NAME, version=__version__, title=S.REPORT_TITLE, generated=generated_line(),
        meta=metadata(res, source_name), cautions=interp.cautions, lights=interp.lights,
        lights_head=S.LIGHTS_HEAD, status_text=S.STATUS_TEXT, colors=STATUS_COLORS, intro=interp.intro,
        sections=interp.sections, tech_head=S.TECH_HEAD, charts=charts, per_item_note=note, tables=tables,
        glossary=list(GLOSSARY.values()), labels=labels,
    )
    doc.setHtml(html)
    for name, image in images:
        doc.addResource(QTextDocument.ResourceType.ImageResource, QUrl(name), image)

    writer = QPdfWriter(str(path))
    writer.setPageSize(QPageSize(QPageSize.PageSizeId.A4))
    writer.setPageMargins(QMarginsF(5, 5, 5, 5), QPageLayout.Unit.Millimeter)
    writer.setResolution(300)
    writer.setTitle(f"{S.REPORT_TITLE} · {interp.model_name}")
    writer.setCreator(f"{APP_NAME} {__version__}")
    doc.print_(writer)
    return path
