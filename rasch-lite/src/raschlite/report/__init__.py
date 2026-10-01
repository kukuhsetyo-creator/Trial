"""Ekspor hasil: workbook Excel, laporan HTML mandiri, laporan PDF, dan grafik.

Submodul dimuat saat pertama kali dipakai (PEP 562). Dengan begitu GUI dapat mengimpor
``raschlite.report.common`` saat startup tanpa ikut memuat matplotlib, sehingga jendela
utama tampil lebih cepat; matplotlib baru dimuat ketika hasil analysis ditampilkan.
"""

from importlib import import_module

_EXPORTS = {
    "export_excel": ".excel",
    "export_html": ".html",
    "export_all": ".export",
    "ExportCancelled": ".export",
    "export_pdf": ".pdf",
}
__all__ = list(_EXPORTS)


def __getattr__(name: str):
    if name in _EXPORTS:
        value = getattr(import_module(_EXPORTS[name], __name__), name)
        globals()[name] = value
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
