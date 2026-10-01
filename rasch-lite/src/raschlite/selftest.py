"""Uji mandiri untuk build beku (PyInstaller).

Dijalankan dengan ``RaschLite.exe --self-test <folder>`` (atau ``python -m raschlite
--self-test <folder>``). Karena executable Windows dibangun tanpa konsol, hasilnya ditulis
ke ``<folder>/selftest_result.txt`` dan dinyatakan lewat kode keluar (0 = semua lulus).

Yang diuji: data contoh terbaca dari dalam paket, ketiga model konvergen, ekspor lengkap
(Excel, HTML mandiri tanpa tautan eksternal, PDF, grafik PNG/SVG) berhasil, alur GUI penuh
(impor, estimasi di QThread, semua tab dan grafik), serta target performa 2000x50
dichotomous < 5 detik dan 1000x30 PCM 5 kategori < 10 detik.
"""

from __future__ import annotations

import platform
import re
import sys
import time
import traceback
from pathlib import Path

RESULT_FILE = "selftest_result.txt"
#: Target performa dari spesifikasi (detik); bukan ambang yang boleh dilonggarkan.
PERF_TARGETS = {"dichotomous_2000x50": 5.0, "pcm_1000x30_5cat": 10.0}
_EXTERNAL = re.compile(r"""(?:src|href)\s*=\s*["'](?:https?:)?//""", re.IGNORECASE)


def _versions() -> list[str]:
    import matplotlib
    import numpy
    import pandas
    import scipy

    from . import __version__

    try:
        import PySide6

        qt = PySide6.__version__
    except Exception:  # pragma: no cover - hanya relevan bila Qt tidak terpasang
        qt = "-"
    return [f"RaschLite {__version__}", f"Python {platform.python_version()} ({platform.system()} "
            f"{platform.machine()})", f"frozen={getattr(sys, 'frozen', False)}", f"numpy {numpy.__version__}",
            f"scipy {scipy.__version__}", f"pandas {pandas.__version__}", f"matplotlib {matplotlib.__version__}",
            f"PySide6 {qt}"]


def _sample_jobs():
    from .core.analysis import run_analysis
    from .core.data import prepare_data, read_table
    from .resources import SAMPLES, sample_path

    for kind, model in (("dichotomous", "dichotomous"), ("polytomous", "rsm"), ("polytomous", "pcm")):
        cfg = SAMPLES[kind]
        df = read_table(sample_path(kind))
        cols = [c for c in df.columns if c not in (cfg["id"], cfg["group"])]
        prep = prepare_data(df, cols, id_col=cfg["id"], group_col=cfg["group"])
        yield kind, model, run_analysis(prep, model), cfg["file"]


def _perf_jobs():
    """Data simulasi yang sama dengan tests/test_performance.py."""
    import numpy as np

    from .core.simulate import simulate_dichotomous, simulate_responses

    rng = np.random.default_rng(31)
    N, L = 2000, 50
    X = simulate_dichotomous(rng.normal(0, 1, N), rng.uniform(-2, 2, L), rng)
    yield "dichotomous_2000x50", "dichotomous", X, np.where(rng.random(N) < 0.5, "A", "B").astype(object)
    rng = np.random.default_rng(32)
    N, L = 1000, 30
    b = rng.uniform(-1.5, 1.5, L)
    tau = np.sort(rng.normal(0, 1, (L, 4)), axis=1)
    tau -= tau.mean(axis=1, keepdims=True)
    X = simulate_responses(rng.normal(0, 1, N), b[:, None] + tau, rng)
    yield "pcm_1000x30_5cat", "pcm", X, np.where(rng.random(N) < 0.5, "A", "B").astype(object)


def _run_simulated(X, model: str, groups):
    from .core.analysis import run_analysis
    from .core.data import prepare_data
    from .core.simulate import to_frame

    df = to_frame(X, groups=groups)
    items = [c for c in df.columns if c not in ("ID", "Grup")]
    return run_analysis(prepare_data(df, items, id_col="ID", group_col="Grup"), model)


def _gui_flow(check) -> None:
    """Alur GUI nyata: muat data contoh, pilih PCM, estimasi di QThread, buka semua tab dan grafik."""
    from PySide6.QtWidgets import QApplication

    from .gui.main_window import RESULTS, MainWindow

    app = QApplication.instance() or QApplication([])
    win = MainWindow()
    win.show()
    t0 = time.perf_counter()
    loaded = win.import_page.load_sample("polytomous")
    win.go_next()
    win.model_page.select_model("pcm")
    win.go_next()
    while win.run_page.running and time.perf_counter() - t0 < 120:
        app.processEvents()
        time.sleep(0.01)
    app.processEvents()
    reached = bool(loaded) and win.current() == RESULTS
    detail = f"{time.perf_counter() - t0:.1f} detik"
    if not reached:
        banners = " / ".join(b.text() for b in (win.import_page.banner, win.run_page.banner) if b.text())
        detail += f"; halaman {win.current()}, status run {win.run_page.outcome}; pesan: {banners}"
    check("GUI: impor -> pilih model -> estimasi (QThread) -> hasil", reached, detail)
    if win.current() == RESULTS:
        page = win.results_page
        for k in range(page.tabs.count()):
            page.tabs.setCurrentIndex(k)
            app.processEvents()
        charts = page.charts
        shown = 0
        for i in range(charts.chart_combo.count()):
            charts.chart_combo.setCurrentIndex(i)
            charts.refresh()
            app.processEvents()
            shown += int(charts.canvas is not None and bool(charts.read_label.text()))
        check("GUI: semua tab dan grafik tampil", shown == charts.chart_combo.count() > 0,
              f"{page.tabs.count()} tab, {shown} grafik")
    win.close()
    app.processEvents()


def run_self_test(folder: str | Path) -> int:
    """Jalankan uji mandiri dan tulis laporan; kembalikan 0 bila semua lulus."""
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    ok = True

    def check(name: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok &= bool(passed)
        lines.append(f"[{'OK' if passed else 'GAGAL'}] {name}" + (f" | {detail}" if detail else ""))

    t_all = time.perf_counter()
    try:
        lines.extend(_versions())
        lines.append("")
        from .interpret import interpret
        from .report.export import export_all

        for kind, model, res, source in _sample_jobs():
            check(f"{model}: estimasi data contoh {source}", res.converged,
                  f"{res.summary['iterations']} iterasi, {res.elapsed_seconds:.2f} detik")
            interp = interpret(res)
            out = folder / model
            t0 = time.perf_counter()
            written = export_all(res, interp, out, source)
            secs = time.perf_counter() - t0
            sizes = {k: written[k].stat().st_size for k in ("excel", "html", "pdf")}
            check(f"{model}: ekspor Excel/HTML/PDF", all(v > 0 for v in sizes.values()),
                  ", ".join(f"{k} {v / 1024:.0f} KB" for k, v in sizes.items()) + f"; {secs:.1f} detik")
            check(f"{model}: PDF valid", written["pdf"].read_bytes()[:5] == b"%PDF-")
            html = written["html"].read_text(encoding="utf-8")
            external = _EXTERNAL.findall(html)
            check(f"{model}: HTML mandiri tanpa tautan eksternal", not external, f"{len(external)} tautan eksternal")
            charts = written["charts"]
            n_png = sum(p.suffix == ".png" for p in charts)
            n_svg = sum(p.suffix == ".svg" for p in charts)
            check(f"{model}: grafik PNG dan SVG", n_png > 0 and n_png == n_svg, f"{n_png} PNG, {n_svg} SVG")

        _gui_flow(check)

        for name, model, X, groups in _perf_jobs():
            t0 = time.perf_counter()
            res = _run_simulated(X, model, groups)
            secs = time.perf_counter() - t0
            check(f"performa {name}", res.converged and secs < PERF_TARGETS[name],
                  f"{secs:.2f} detik (target < {PERF_TARGETS[name]:.0f} detik), {res.summary['iterations']} iterasi")
    except Exception:  # noqa: BLE001 - semua galat harus tercatat di berkas hasil
        ok = False
        lines.append("[GAGAL] galat tak terduga:")
        lines.append(traceback.format_exc())
    lines.append("")
    lines.append(f"Total {time.perf_counter() - t_all:.1f} detik. HASIL: {'LULUS' if ok else 'GAGAL'}")
    (folder / RESULT_FILE).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0 if ok else 1
