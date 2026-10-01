"""Grafik: semua grafik dapat dirender dan diekspor PNG 300 dpi serta SVG."""

import re
import subprocess
import sys
from pathlib import Path

import matplotlib.image as mpimg
import pytest

from raschlite.core.analysis import run_analysis
from raschlite.core.data import prepare_data, read_table
from raschlite.plots import CHARTS, SPECS, available_charts, item_choices, render, render_gallery, save_figure

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "src" / "raschlite" / "resources" / "sample_data"
SRC = Path(__file__).resolve().parents[1] / "src"


def _sample(name, model):
    df = read_table(SAMPLE_DIR / name)
    items = [c for c in df.columns if c not in ("ID", "Jenis_Kelamin")]
    return run_analysis(prepare_data(df, items, id_col="ID", group_col="Jenis_Kelamin"), model)


@pytest.fixture(scope="module")
def results():
    return {
        "dichotomous": _sample("contoh_dikotomus.csv", "dichotomous"),
        "rsm": _sample("contoh_politomus.csv", "rsm"),
        "pcm": _sample("contoh_politomus.csv", "pcm"),
    }


def test_ten_chart_types_registered():
    assert len(CHARTS) == 10
    assert set(SPECS) == {"wright_map", "icc", "category_curves", "expected_score", "test_information",
                          "fit_bubble", "person_fit", "pca_contrast", "dif", "q3_heatmap"}


@pytest.mark.parametrize("model", ["dichotomous", "rsm", "pcm"])
def test_every_applicable_chart_renders(results, model):
    res = results[model]
    keys = {c.key for c in available_charts(res)}
    poly = model != "dichotomous"
    assert ("category_curves" in keys) == poly and ("expected_score" in keys) == poly
    item = item_choices(res)[0]
    for spec in available_charts(res):
        fig = render(res, spec.key, item)
        assert fig.axes, spec.key
        title = fig.axes[0].get_title(loc="left") or fig.get_suptitle()
        assert title, spec.key


@pytest.mark.parametrize("model", ["dichotomous", "pcm"])
def test_how_to_read_has_two_to_four_sentences(results, model):
    for spec in available_charts(results[model]):
        text = spec.how_to_read(results[model])
        sentences = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]
        assert 2 <= len(sentences) <= 4, (spec.key, len(sentences))


def test_png_is_300_dpi_and_svg_is_written(results, tmp_path):
    fig = render(results["pcm"], "wright_map")
    w, h = fig.get_size_inches()
    paths = save_figure(fig, tmp_path / "peta", formats=("png", "svg"))
    img = mpimg.imread(paths[0])
    assert img.shape[0] == pytest.approx(h * 300, abs=2) and img.shape[1] == pytest.approx(w * 300, abs=2)
    assert paths[1].read_text(encoding="utf-8").lstrip().startswith("<?xml")


def test_render_gallery_exports_every_chart(results, tmp_path):
    res = results["dichotomous"]
    written = render_gallery(res, tmp_path, formats=("png",), items=["S07"], dpi=60)
    assert set(written) == {c.key for c in available_charts(res)}
    assert (tmp_path / "icc_S07.png").exists()


def test_disordered_threshold_highlighted_in_red(results):
    fig = render(results["pcm"], "category_curves", "A09")
    colors = {line.get_color().lower() for line in fig.axes[0].get_lines()}
    assert "#d55e00" in colors


def test_plots_and_interpret_do_not_import_qt():
    code = (
        "import sys; sys.path.insert(0, %r);"
        "import raschlite.plots, raschlite.interpret;"
        "bad = [m for m in sys.modules if m.split('.')[0] in ('PySide6', 'PyQt5', 'PyQt6', 'shiboken6')];"
        "print(bad); sys.exit(1 if bad else 0)"
    ) % str(SRC)
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
