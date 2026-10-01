"""Membangun AgenKualitatif.html: satu berkas yang berjalan langsung di peramban.

Menyematkan src/app.js dan pustaka di vendor/ ke dalam src/app.html, sehingga
hasilnya dapat dibuka dengan klik dua kali tanpa internet untuk memuat pustaka
(internet tetap diperlukan untuk memanggil AI Anthropic).

pdf.js dimuat bersama pdf.worker sebagai skrip biasa; pdf.js lalu memakai
"fake worker" di utas utama, yang berfungsi pula ketika halaman dibuka dari
file:// tempat Web Worker sering diblokir.

Pemakaian: python web/build_html.py
"""

from pathlib import Path

WEB = Path(__file__).resolve().parent
VENDOR = WEB / "vendor"
OUT = WEB / "AgenKualitatif.html"


def aman_disematkan(kode: str, nama: str) -> str:
    # "<!--" hanya muncul di dalam string literal pada pustaka ini; diganti
    # dengan escape yang setara agar parser HTML tidak masuk ke mode komentar.
    kode = kode.replace("<!--", "\\x3C!--")
    if "</script" in kode.lower():
        raise SystemExit(f"{nama} memuat '</script' dan tidak aman disematkan.")
    return kode


def main() -> None:
    html = (WEB / "src" / "app.html").read_text(encoding="utf-8")
    vendor = "\n".join(
        f"<script>/* {nama} */\n{aman_disematkan((VENDOR / nama).read_text(encoding='utf-8'), nama)}\n</script>"
        for nama in ("mammoth.browser.min.js", "pdf.min.js", "pdf.worker.min.js")
    )
    app = aman_disematkan((WEB / "src" / "app.js").read_text(encoding="utf-8"), "app.js")
    assert "<!--VENDOR-->" in html and "/*APP*/" in html
    html = html.replace("<!--VENDOR-->", vendor).replace("/*APP*/", app)
    OUT.write_text(html, encoding="utf-8")
    print(f"Dibangun: {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
