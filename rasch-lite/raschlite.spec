# -*- mode: python ; coding: utf-8 -*-
"""Spesifikasi PyInstaller RaschLite: build --onedir ke dist/RaschLite.

Jalankan dari folder rasch-lite:
    pyinstaller --noconfirm --clean raschlite.spec

Penghematan ukuran yang diterapkan (tanpa mengubah fungsi):
* hanya QtCore, QtGui, QtWidgets yang diimpor sehingga hanya modul Qt itu yang dikumpulkan;
* plugin Qt dipangkas oleh hook lokal pyinstaller_hooks/hook-PySide6.QtGui.py (hanya platform
  desktop, beberapa format gambar kecil, metode input);
* modul AVIF Pillow (PIL._avif) tidak disertakan; matplotlib hanya menulis PNG;
* subpaket SciPy yang tidak dipakai dikecualikan (engine hanya memakai scipy.special);
* berkas terjemahan Qt (.qm) tidak disertakan karena antarmuka tidak memuat QTranslator;
* opengl32sw.dll (rasterizer OpenGL perangkat lunak, sekitar 20 MB) tidak disertakan karena
  aplikasi tidak memakai OpenGL; widget dan matplotlib QtAgg menggambar secara raster.
UPX tidak dipakai karena dapat merusak DLL Qt dan memicu alarm palsu antivirus.
"""

import sys
from pathlib import Path

ROOT = Path(SPECPATH)
SRC = ROOT / "src"
PKG = SRC / "raschlite"
WINDOWS = sys.platform.startswith("win")

datas = [
    (str(PKG / "resources" / "sample_data"), "raschlite/resources/sample_data"),
    (str(PKG / "resources" / "brand"), "raschlite/resources/brand"),
    (str(PKG / "report" / "templates"), "raschlite/report/templates"),
]

# Semua modul paket ikut dikumpulkan, termasuk yang dimuat secara malas (report/__init__.py).
hiddenimports = sorted(
    "raschlite." + ".".join(p.relative_to(PKG).with_suffix("").parts).removesuffix(".__init__")
    for p in PKG.rglob("*.py")
)

excludes = [
    "tkinter", "_tkinter", "IPython", "jedi", "pytest", "PyQt5", "PyQt6", "PySide2",
    "PySide6.QtWebEngineCore", "PySide6.QtWebEngineWidgets", "PySide6.QtQml", "PySide6.QtQuick",
    "PySide6.QtNetwork", "PySide6.QtOpenGL", "PySide6.QtOpenGLWidgets", "PySide6.QtSql", "PySide6.QtTest",
    "PySide6.QtXml", "PySide6.QtDBus", "PySide6.QtPdf",
    # PySide6.QtSvg tidak boleh dikecualikan: matplotlib.backends.qt_compat selalu mengimpornya.
    "scipy.stats", "scipy.optimize", "scipy.integrate", "scipy.interpolate", "scipy.sparse", "scipy.spatial",
    "scipy.ndimage", "scipy.fft", "scipy.fftpack", "scipy.signal", "scipy.io", "scipy.cluster", "scipy.odr",
    "scipy.datasets", "scipy.differentiate", "scipy.linalg",
    # numpy.f2py tidak boleh dikecualikan: scipy._lib.array_api_compat menelusuri semua atribut numpy.
    "PIL._avif", "PIL.AvifImagePlugin", "matplotlib.backends.backend_tkagg", "matplotlib.backends._backend_tk",
    "matplotlib.backends.backend_webagg", "matplotlib.backends.backend_wx", "matplotlib.backends.backend_gtk3",
    "matplotlib.backends.backend_gtk4",
]

a = Analysis(
    [str(ROOT / "scripts" / "launch_raschlite.py")],
    pathex=[str(SRC)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[str(ROOT / "pyinstaller_hooks")],
    # Backend matplotlib yang dipakai: QtAgg (kanvas GUI), Agg (PNG 300 dpi), SVG (ekspor dan laporan HTML).
    hooksconfig={"matplotlib": {"backends": ["QtAgg", "Agg", "SVG"]}},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    optimize=0,
)


def _keep(entry) -> bool:
    dest = entry[0].replace("\\", "/").lower()
    if "/translations/" in dest and dest.endswith(".qm"):
        return False
    if dest.endswith("opengl32sw.dll"):
        return False
    return True


a.datas = [d for d in a.datas if _keep(d)]
a.binaries = [b for b in a.binaries if _keep(b)]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="RaschLite",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    icon=str(PKG / "resources" / "brand" / "raschlite.ico"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="RaschLite",
)
