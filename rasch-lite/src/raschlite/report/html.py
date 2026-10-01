"""Laporan HTML mandiri: satu berkas, grafik SVG di-embed base64, tanpa sumber eksternal."""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .. import APP_NAME, __version__, theme
from ..gui import strings as S
from ..interpret.glossary import GLOSSARY
from ..plots import SPECS, available_charts, item_choices, render
from .common import data_uri, display_table, figure_bytes, flagged_items, generated_line, metadata

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"
HTML_PER_ITEM_LIMIT = 30


def environment() -> Environment:
    return Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=select_autoescape(["html", "j2"]),
                       trim_blocks=False, lstrip_blocks=False)


def chart_plan(res, per_item_limit: int) -> tuple[list[tuple[str, str | None]], bool]:
    """Daftar (kunci grafik, butir) untuk laporan; grafik per butir untuk semua butir bila
    jumlahnya <= ``per_item_limit``, selain itu hanya butir yang perlu diperiksa."""
    items = item_choices(res)
    all_items = len(items) <= per_item_limit
    chosen = items if all_items else flagged_items(res)[:per_item_limit]
    plan = []
    for spec in available_charts(res):
        if spec.per_item:
            plan.extend((spec.key, it) for it in chosen)
        else:
            plan.append((spec.key, None))
    return plan, all_items


def chart_title(key: str, item: str | None) -> str:
    return SPECS[key].title + (f": {item}" if item else "")


def chart_stem(key: str, item: str | None) -> str:
    from ..plots.gallery import _safe

    return key + (f"_{_safe(item)}" if item else "")


def export_html(res, interp, path: str | Path, source_name: str = "", chart_dir: str | Path | None = None,
                per_item_limit: int = HTML_PER_ITEM_LIMIT) -> Path:
    """Tulis laporan HTML. Bila ``chart_dir`` berisi SVG hasil ekspor grafik, berkas itu
    dipakai ulang; bila tidak, grafik dirender di memori."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    plan, all_items = chart_plan(res, per_item_limit)
    charts = []
    for key, item in plan:
        svg_file = Path(chart_dir) / f"{chart_stem(key, item)}.svg" if chart_dir is not None else None
        if svg_file is not None and svg_file.exists():
            data = svg_file.read_bytes()
        else:
            fig = render(res, key, item)
            data = figure_bytes(fig, "svg")
        charts.append({"title": chart_title(key, item), "uri": data_uri(data, "svg"),
                       "how_to_read": SPECS[key].how_to_read(res)})
    tables = [t for t in (display_table(res, k) for k in ("items", "persons", "categories", "dif", "loadings",
                                                           "q3_pairs")) if t is not None]
    labels = {
        "summary": S.SUMMARY_1MIN, "explanation": S.EXPLANATION, "charts": S.REPORT_CHARTS,
        "tables": S.REPORT_TABLES, "glossary": S.REPORT_GLOSSARY, "meta": S.REPORT_META,
        "cautions": S.CAUTIONS, "actions": S.ACTIONS, "technical": S.REPORT_TECHNICAL,
        "references": S.REFERENCES, "how_to_read": S.HOW_TO_READ, "table_hint": S.REPORT_TABLE_HINT,
        "no_rows": S.REPORT_NO_ROWS,
    }
    note = S.REPORT_PER_ITEM_ALL if all_items else S.REPORT_PER_ITEM_FLAGGED.format(folder=S.EXPORT_FILES["charts"])
    html = environment().get_template("report.html.j2").render(
        app=APP_NAME, version=__version__, title=S.REPORT_TITLE, model_name=interp.model_name,
        generated=generated_line(), meta=metadata(res, source_name), cautions=interp.cautions,
        lights=interp.lights, status_text=S.STATUS_TEXT, intro=interp.intro, sections=interp.sections,
        tech_head=S.TECH_HEAD, charts=charts, per_item_note=note, tables=tables,
        glossary=list(GLOSSARY.values()), labels=labels, t=theme,
    )
    path.write_text(html, encoding="utf-8")
    return path
