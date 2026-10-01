"""Smoke test GUI headless (QT_QPA_PLATFORM=offscreen).

Alur nyata: muat data contoh, validasi, pilih model, jalankan estimasi di QThread,
buka setiap tab hasil, render setiap grafik, ekspor grafik tunggal ke PNG dan SVG,
lalu "Ekspor Semua" (Excel, HTML, PDF, folder grafik) lewat thread ekspor.
"""

import os
import time

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pandas as pd  # noqa: E402
import pytest  # noqa: E402

QtWidgets = pytest.importorskip("PySide6.QtWidgets", reason="PySide6 tidak terpasang", exc_type=ImportError)

from raschlite.gui.main_window import IMPORT, MODEL, RESULTS, RUN, MainWindow  # noqa: E402


@pytest.fixture(scope="module")
def app():
    return QtWidgets.QApplication.instance() or QtWidgets.QApplication([])


def _wait(app, cond, timeout=60.0):
    t0 = time.perf_counter()
    while not cond():
        app.processEvents()
        if time.perf_counter() - t0 > timeout:
            raise TimeoutError("GUI tidak selesai dalam batas waktu")
        time.sleep(0.01)
    app.processEvents()


def _run_model(app, win, model):
    assert win.current() == MODEL
    win.model_page.select_model(model)
    win.go_next()
    assert win.current() == RUN
    _wait(app, lambda: not win.run_page.running)
    assert win.run_page.outcome == "finished", win.run_page.banner.text()
    assert win.current() == RESULTS
    return win.results_page


def _exercise_results(app, page, tmp_path, tag):
    assert page.tabs.count() == 9
    assert len(page.lights) == 6
    for k in range(page.tabs.count()):
        page.tabs.setCurrentIndex(k)
        app.processEvents()
    assert page.tables["items"].model().rowCount() == page.res.items.shape[0]
    assert page.tables["persons"].model().rowCount() == page.res.persons.shape[0]
    view = page.tables["items"]
    view.sortByColumn(5, view.horizontalHeader().sortIndicatorOrder())  # urutkan measure
    charts = page.charts
    item = charts.item_combo.itemText(0)
    for i in range(charts.chart_combo.count()):
        charts.chart_combo.setCurrentIndex(i)
        charts.item_combo.setCurrentText(item)
        charts.refresh()
        app.processEvents()
        assert charts.read_label.text()
        paths = charts.export(tmp_path / f"{tag}_{charts.current_key()}", ("png", "svg"))
        assert all(p.exists() and p.stat().st_size > 0 for p in paths)
    folder = tmp_path / f"ekspor_{tag}"
    page.start_export(str(folder))
    _wait(app, lambda: not page.export_running, timeout=180.0)
    assert page.export_outcome == "finished", page.export_banner.text()
    for key in ("excel", "html", "pdf"):
        assert page.export_written[key].exists() and page.export_written[key].stat().st_size > 0
    assert page.export_written["pdf"].read_bytes().startswith(b"%PDF")
    assert len(page.export_written["charts"]) > 0


def test_full_flow_both_sample_datasets_and_all_models(app, tmp_path):
    win = MainWindow()
    win.show()
    # Dikotomus
    assert win.import_page.load_sample("dichotomous")
    win.go_next()
    assert win.current() == MODEL, win.import_page.banner.text()
    assert not win.model_page.radios["rsm"].isEnabled()
    page = _run_model(app, win, "dichotomous")
    assert page.res.dif is not None and "dif" in page.tables
    _exercise_results(app, page, tmp_path, "dik")
    # Politomus: RSM lalu PCM
    win.go_next()
    assert win.current() == IMPORT
    assert win.import_page.load_sample("polytomous")
    win.go_next()
    assert win.model_page.selected_model() == "rsm"
    for model in ("rsm", "pcm"):
        page = _run_model(app, win, model)
        assert page.res.model == model and "categories" in page.tables
        _exercise_results(app, page, tmp_path, model)
        win.go_back()
        assert win.current() == MODEL
    win.close()


def test_cancel_during_estimation(app):
    win = MainWindow()
    win.import_page.load_sample("polytomous")
    win.go_next()
    win.model_page.select_model("pcm")
    win.go_next()
    win.run_page.cancel()
    _wait(app, lambda: not win.run_page.running)
    assert win.run_page.outcome in ("cancelled", "finished")
    if win.run_page.outcome == "cancelled":
        assert win.current() == RUN and win.btn_back.isEnabled()
    win.close()


def test_non_integer_data_shows_clear_error_without_advancing(app):
    win = MainWindow()
    df = pd.DataFrame({"ID": ["a", "b", "c"], "Q1": ["1", "2.5", "0"], "Q2": ["1", "0", "x"]})
    win.import_page.set_dataframe(df, "salah.csv", id_col="ID", item_cols=["Q1", "Q2"])
    win.go_next()
    assert win.current() == IMPORT
    assert "bukan bilangan bulat" in win.import_page.banner.text()
    assert win.import_page.banner.property("level") == "error"
    win.close()
