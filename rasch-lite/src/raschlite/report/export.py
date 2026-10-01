"""Ekspor lengkap ke satu folder: grafik (PNG 300 dpi + SVG), Excel, HTML, PDF.

Grafik diekspor lebih dulu; laporan HTML dan PDF memakai ulang berkas SVG/PNG
tersebut sehingga setiap grafik hanya dirender sekali.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from ..gui import strings as S
from ..plots import available_charts, item_choices, render, save_figure
from .excel import export_excel
from .html import chart_stem, chart_title, export_html
from .pdf import export_pdf


class ExportCancelled(Exception):
    pass


def export_all(res, interp, folder: str | Path, source_name: str = "",
               progress: Callable[[int, int, str], None] | None = None,
               should_cancel: Callable[[], bool] | None = None, formats=("png", "svg"),
               include_pdf: bool = True) -> dict:
    """Ekspor semua keluaran; ``progress(langkah, total, pesan)`` dipanggil di setiap langkah."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    chart_dir = folder / S.EXPORT_FILES["charts"]
    jobs = []
    for spec in available_charts(res):
        if spec.per_item:
            jobs.extend((spec.key, it) for it in item_choices(res))
        else:
            jobs.append((spec.key, None))
    total = len(jobs) + 2 + int(include_pdf)
    step = 0

    def tick(message: str) -> None:
        nonlocal step
        if should_cancel is not None and should_cancel():
            raise ExportCancelled()
        if progress is not None:
            progress(step, total, message)
        step += 1

    written: dict = {"charts": []}
    for k, (key, item) in enumerate(jobs):
        tick(S.EXPORT_STEP_CHART.format(k=k + 1, n=len(jobs), name=chart_title(key, item)))
        fig = render(res, key, item)
        written["charts"].extend(save_figure(fig, chart_dir / chart_stem(key, item), formats))
        fig.clear()
    tick(S.EXPORT_STEP_EXCEL)
    written["excel"] = export_excel(res, interp, folder / S.EXPORT_FILES["excel"], source_name)
    tick(S.EXPORT_STEP_HTML)
    written["html"] = export_html(res, interp, folder / S.EXPORT_FILES["html"], source_name, chart_dir)
    if include_pdf:
        tick(S.EXPORT_STEP_PDF)
        written["pdf"] = export_pdf(res, interp, folder / S.EXPORT_FILES["pdf"], source_name, chart_dir)
    if progress is not None:
        progress(total, total, "")
    return written
