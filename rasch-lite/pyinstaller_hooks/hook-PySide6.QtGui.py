"""Hook lokal PyInstaller untuk PySide6.QtGui: menggantikan hook bawaan PyInstaller.

Hook bawaan mengumpulkan semua jenis plugin QtGui. RaschLite adalah aplikasi widget desktop
yang menggambar secara raster, sehingga hanya plugin berikut yang dipertahankan:

* ``platforms``: qwindows (Windows), qxcb (Linux X11), qcocoa (macOS), serta qoffscreen dan
  qminimal untuk verifikasi tanpa layar;
* ``imageformats``: qico, qjpeg, qgif (kecil, tanpa dependensi tambahan);
* ``platforminputcontexts`` dan ``accessiblebridge`` (metode input dan aksesibilitas).

Plugin yang dibuang (EGL/KMS, Wayland, tema GTK, ikon/gambar SVG, input evdev/tuio, dan
sebagainya) tidak pernah dimuat oleh aplikasi ini. Karena pemangkasan terjadi sebelum analisis
dependensi biner, pustaka yang hanya dibutuhkan plugin tersebut (misalnya GTK di Linux) juga
tidak ikut terbawa.
"""

import os

from PyInstaller.utils.hooks.qt import add_qt6_dependencies

hiddenimports, binaries, datas = add_qt6_dependencies(__file__)

_KEEP = {
    "platforms": {"qwindows", "qxcb", "qcocoa", "qoffscreen", "qminimal"},
    "imageformats": {"qico", "qjpeg", "qgif"},
    "platforminputcontexts": None,  # None = pertahankan semua
    "accessiblebridge": None,
}


def _plugin_kind_and_name(src: str):
    parts = os.path.normpath(src).replace("\\", "/").split("/")
    if "plugins" not in parts:
        return None, None
    i = len(parts) - 1 - parts[::-1].index("plugins")
    if i + 2 >= len(parts):
        return None, None
    name = os.path.splitext(parts[-1])[0]
    if name.startswith("lib"):
        name = name[3:]
    return parts[i + 1], name


def _keep(entry) -> bool:
    kind, name = _plugin_kind_and_name(entry[0])
    if kind is None:
        return True
    if kind not in _KEEP:
        return False
    allowed = _KEEP[kind]
    return allowed is None or name in allowed


binaries = [b for b in binaries if _keep(b)]
